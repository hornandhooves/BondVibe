#!/usr/bin/env node
/**
 * One-off backfill: recompute every driver's `carpoolStats.seatsShared` from
 * COMPLETED trips only, correcting values accrued under the old on-approve rule
 * (BUG 28.2). A driver is credited 1 per rider who was still `approved` on a
 * non-cancelled carpool whose event has ENDED (start + durationMinutes < now).
 *
 * It also stamps `seatsCredited:true`/`creditedAt` on each completed carpool so
 * the ongoing `creditCarpoolSeatsOnCompletion` sweep won't re-credit them.
 *
 * Authoritative reset (SET, not increment): drivers whose count was inflated by
 * approvals on future/never-happened rides are reset to their true completed
 * total (0 if none). Only carpools on events that have already ended are
 * credited/stamped; carpools on future events are left un-credited for the
 * daily sweep to pick up when their event ends.
 *
 * Usage:   node scripts/migrate-carpool-seats.mjs [--project bondvibe-dev] [--apply]
 * Default: DRY RUN (prints the plan, writes nothing). Pass --apply to write.
 * Auth:    your gcloud user credentials (Owner/Editor on the project).
 *          gcloud auth print-access-token
 *
 * Idempotent: re-running recomputes the same completed-only totals and SETs
 * them, so it can be run safely more than once.
 */
import { execSync } from "node:child_process";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const PROJECT = arg("project", "bondvibe-dev");
const APPLY = process.argv.includes("--apply");
const token = execSync("gcloud auth print-access-token").toString().trim();

const headers = {
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-Goog-User-Project": PROJECT,
};

const FS_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}` +
  `/databases/(default)/documents`;

// ── REST field helpers ─────────────────────────────────────────────────────
const sv = (f) => (f ? f.stringValue : undefined);
const bv = (f) => !!(f && f.booleanValue === true);
const iv = (f) => {
  if (!f) return undefined;
  if (f.integerValue != null) return parseInt(f.integerValue, 10);
  if (f.doubleValue != null) return f.doubleValue;
  return undefined;
};
// Path `.../documents/events/{eid}/carpools/{cid}[/riders/{rid}]` → segments.
const segmentsOf = (name) => name.split("/documents/")[1].split("/");

async function runQuery(structuredQuery) {
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: "POST",
    headers,
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    throw new Error(`runQuery failed: ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return rows.filter((r) => r.document).map((r) => r.document);
}

async function getDoc(path) {
  const res = await fetch(`${FS_BASE}/${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`get ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function patchDoc(path, fields, maskPaths) {
  const mask = maskPaths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");
  const res = await fetch(`${FS_BASE}/${path}?${mask}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`patch ${path} failed: ${res.status} ${await res.text()}`);
  }
}

// ── Load data ───────────────────────────────────────────────────────────────
console.log(`\n🚗 Carpool seatsShared backfill — project ${PROJECT} ${APPLY ? "(APPLY)" : "(dry run)"}\n`);

// All carpools across every event (collection group).
const carpools = await runQuery({
  from: [{ collectionId: "carpools", allDescendants: true }],
});
console.log(`Found ${carpools.length} carpool(s).`);

// All riders (collection group, unfiltered so no composite index is needed);
// count only status==approved per carpool path, client-side.
const riders = await runQuery({
  from: [{ collectionId: "riders", allDescendants: true }],
});
const approvedByCarpool = {}; // `${eid}/${cid}` → count
for (const r of riders) {
  if (sv(r.fields?.status) !== "approved") continue;
  const [, eid, , cid] = segmentsOf(r.name); // events, {eid}, carpools, {cid}, riders, {rid}
  const key = `${eid}/${cid}`;
  approvedByCarpool[key] = (approvedByCarpool[key] || 0) + 1;
}

// Event completion cache.
const now = Date.now();
const eventCache = {};
async function eventEnded(eid) {
  if (!(eid in eventCache)) {
    const ev = await getDoc(`events/${eid}`);
    if (!ev) {
      eventCache[eid] = { ended: false, cancelled: false, missing: true };
    } else {
      const status = sv(ev.fields?.status);
      const dateF = ev.fields?.date;
      const iso = dateF?.timestampValue || dateF?.stringValue;
      const startMs = iso ? Date.parse(iso) : NaN;
      const dur = iv(ev.fields?.durationMinutes) ?? 180;
      const endMs = Number.isNaN(startMs) ? NaN : startMs + dur * 60000;
      eventCache[eid] = {
        cancelled: status === "cancelled",
        ended: !Number.isNaN(endMs) && endMs < now,
        missing: false,
      };
    }
  }
  return eventCache[eid];
}

// ── Compute ─────────────────────────────────────────────────────────────────
const freshByDriver = {}; // driverId → completed seats
const allDrivers = new Set(); // every driver with any carpool (to reset inflation)
const toStamp = []; // completed carpools to mark seatsCredited

for (const cp of carpools) {
  const [, eid, , cid] = segmentsOf(cp.name);
  const driverId = sv(cp.fields?.driverId);
  const status = sv(cp.fields?.status);
  if (driverId) allDrivers.add(driverId);
  if (status === "cancelled") continue;

  const ev = await eventEnded(eid);
  if (ev.missing || ev.cancelled || !ev.ended) continue; // not a completed trip

  const approved = approvedByCarpool[`${eid}/${cid}`] || 0;
  if (driverId && approved > 0) {
    freshByDriver[driverId] = (freshByDriver[driverId] || 0) + approved;
  }
  if (!bv(cp.fields?.seatsCredited)) {
    toStamp.push({ eid, cid });
  }
}

// Diagnostics so we can trust a "0 completed" result vs a silent lookup bug.
const totalApproved = Object.values(approvedByCarpool).reduce((a, b) => a + b, 0);
const evStates = Object.values(eventCache);
console.log(`\nDiagnostics:`);
console.log(`  riders total: ${riders.length}, approved: ${totalApproved} across ${Object.keys(approvedByCarpool).length} carpool(s)`);
console.log(`  events referenced: ${evStates.length} — ended: ${evStates.filter((e) => e.ended).length}, future/ongoing: ${evStates.filter((e) => !e.ended && !e.cancelled && !e.missing).length}, cancelled: ${evStates.filter((e) => e.cancelled).length}, missing: ${evStates.filter((e) => e.missing).length}`);

// Drivers to write = every carpool driver whose CURRENT seatsShared differs
// from their true completed total (0 if none). Reading current values first
// means we only touch genuinely-inflated docs and can show the real diff.
const nowIso = new Date(now).toISOString();
const driverWrites = [];
for (const uid of allDrivers) {
  const target = freshByDriver[uid] || 0;
  const u = await getDoc(`users/${uid}`);
  if (!u) continue; // driver doc gone (test fixture) — nothing to correct
  const current = iv(u.fields?.carpoolStats?.mapValue?.fields?.seatsShared) || 0;
  if (current !== target) driverWrites.push({ uid, current, seats: target });
}

console.log(`\nPlan:`);
console.log(`  • ${driverWrites.length} driver(s) have an inflated seatsShared to correct (of ${allDrivers.size} carpool driver(s))`);
console.log(`  • ${toStamp.length} completed carpool(s) will be stamped seatsCredited\n`);
for (const d of driverWrites.sort((a, b) => b.current - a.current)) {
  console.log(`    ${d.uid}: ${d.current} → ${d.seats}`);
}

if (!APPLY) {
  console.log(`\n(dry run — nothing written. Re-run with --apply to commit.)\n`);
  process.exit(0);
}

// ── Apply ────────────────────────────────────────────────────────────────────
console.log(`\nApplying…`);
for (const { eid, cid } of toStamp) {
  await patchDoc(
    `events/${eid}/carpools/${cid}`,
    {
      seatsCredited: { booleanValue: true },
      creditedAt: { timestampValue: nowIso },
    },
    ["seatsCredited", "creditedAt"],
  );
}
console.log(`  ✅ Stamped ${toStamp.length} carpool(s).`);

for (const { uid, seats } of driverWrites) {
  await patchDoc(
    `users/${uid}`,
    { carpoolStats: { mapValue: { fields: { seatsShared: { integerValue: String(seats) } } } } },
    ["carpoolStats.seatsShared"],
  );
}
console.log(`  ✅ Set seatsShared on ${driverWrites.length} driver(s).`);
console.log(`\nDone.\n`);
