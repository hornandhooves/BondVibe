#!/usr/bin/env node
/**
 * F2 Phase A backfill: for every LEGACY event (has public location/locationCoords
 * but no `area`/`approxCoords`), compute the coarse public fields and move the
 * exact detail into the participant-gated private subcollection:
 *   public  events/{id}         ← area, approxCoords, locationLocked   (ADDED)
 *   private events/{id}/private/location ← venueName, address, exactCoords
 * The legacy public `location`/`locationCoords` are LEFT IN PLACE (Phase A is
 * additive). Phase B (a separate script/deploy, after soak) strips them once
 * every reader uses the fallback resolver.
 *
 * Usage:   node scripts/migrate-event-location.mjs [--project bondvibe-dev] [--apply]
 * Default: DRY RUN (prints the plan, writes nothing). Pass --apply to write.
 * Auth:    your gcloud user credentials (Owner/Editor). REST with an owner token
 *          bypasses security rules, so it can write the server-only fields.
 *          gcloud auth print-access-token
 *
 * Idempotent: an event that already has `area` is skipped, so re-running is safe.
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

// ── REST helpers ────────────────────────────────────────────────────────────
const sv = (f) => (f ? f.stringValue : undefined);
const segmentsOf = (name) => name.split("/documents/")[1].split("/");
const coordOf = (f) => {
  const m = f?.mapValue?.fields;
  if (!m) return null;
  const num = (x) =>
    x?.doubleValue != null ? x.doubleValue :
    x?.integerValue != null ? parseInt(x.integerValue, 10) : NaN;
  const latitude = num(m.latitude);
  const longitude = num(m.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude } : null;
};

const APPROX_GRID_DEG = 0.01;
const snapApproxGrid = (c) => {
  if (!c) return null;
  const snap = (v) => Number((Math.round(v / APPROX_GRID_DEG) * APPROX_GRID_DEG).toFixed(4));
  return { latitude: snap(c.latitude), longitude: snap(c.longitude) };
};
// `location` is "Venue, City" — the tail is a coarse (city-level) area label,
// the head is the venue name. Never expose the street here.
const deriveArea = (location, city) => {
  if (typeof location === "string" && location.includes(",")) {
    const tail = location.split(",").pop().trim();
    if (tail) return tail;
  }
  return city || "Approximate area";
};
const deriveVenue = (location) => {
  if (typeof location === "string" && location.includes(",")) {
    return location.split(",")[0].trim();
  }
  return (typeof location === "string" && location.trim()) || null;
};
const coordMap = (c) => ({
  mapValue: { fields: {
    latitude: { doubleValue: c.latitude },
    longitude: { doubleValue: c.longitude },
  } },
});

async function runQuery(structuredQuery) {
  const res = await fetch(`${FS_BASE}:runQuery`, {
    method: "POST", headers, body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`runQuery failed: ${res.status} ${await res.text()}`);
  return (await res.json()).filter((r) => r.document).map((r) => r.document);
}
async function patchDoc(path, fields, maskPaths) {
  const mask = maskPaths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");
  const res = await fetch(`${FS_BASE}/${path}?${mask}`, {
    method: "PATCH", headers, body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`patch ${path} failed: ${res.status} ${await res.text()}`);
}

// ── Load ─────────────────────────────────────────────────────────────────────
console.log(`\n📍 Event location backfill — project ${PROJECT} ${APPLY ? "(APPLY)" : "(dry run)"}\n`);
const events = await runQuery({ from: [{ collectionId: "events" }] });
console.log(`Found ${events.length} event(s).`);

// ── Compute plan ───────────────────────────────────────────────────────────
const nowIso = new Date().toISOString();
const plan = [];
let skippedMigrated = 0;
let skippedNoLoc = 0;
for (const ev of events) {
  const f = ev.fields || {};
  const eid = segmentsOf(ev.name)[1];
  if (sv(f.area) != null || f.approxCoords != null) { skippedMigrated++; continue; }

  const exact = coordOf(f.locationCoords);
  const location = sv(f.location) || null;
  const venueAddress = sv(f.venueAddress) || null;
  if (!exact && !location && !venueAddress) { skippedNoLoc++; continue; } // no location at all

  plan.push({
    eid,
    area: deriveArea(location, sv(f.city)),
    approx: snapApproxGrid(exact),
    venueName: deriveVenue(location),
    address: venueAddress || location,
    exact,
  });
}

console.log(`\nPlan:`);
console.log(`  • ${plan.length} legacy event(s) to backfill`);
console.log(`  • ${skippedMigrated} already migrated (has area/approxCoords) — skipped`);
console.log(`  • ${skippedNoLoc} with no location at all — left unchanged\n`);
for (const p of plan.slice(0, 40)) {
  console.log(`    ${p.eid}: area="${p.area}"  approx=${p.approx ? `${p.approx.latitude},${p.approx.longitude}` : "—"}  venue="${p.venueName || "—"}"`);
}
if (plan.length > 40) console.log(`    …and ${plan.length - 40} more`);

if (!APPLY) {
  console.log(`\n(dry run — nothing written. Re-run with --apply to commit. Phase A keeps legacy fields.)\n`);
  process.exit(0);
}

// ── Apply ─────────────────────────────────────────────────────────────────
console.log(`\nApplying…`);
let done = 0;
for (const p of plan) {
  // Public: coarse fields only (legacy location/locationCoords untouched).
  const pubFields = { area: { stringValue: p.area }, locationLocked: { booleanValue: true } };
  const pubMask = ["area", "locationLocked"];
  if (p.approx) { pubFields.approxCoords = coordMap(p.approx); pubMask.push("approxCoords"); }
  await patchDoc(`events/${p.eid}`, pubFields, pubMask);

  // Private: the exact detail.
  const privFields = { migratedAt: { timestampValue: nowIso } };
  const privMask = ["migratedAt"];
  if (p.venueName) { privFields.venueName = { stringValue: p.venueName }; privMask.push("venueName"); }
  if (p.address) { privFields.address = { stringValue: p.address }; privMask.push("address"); }
  if (p.exact) { privFields.exactCoords = coordMap(p.exact); privMask.push("exactCoords"); }
  await patchDoc(`events/${p.eid}/private/location`, privFields, privMask);
  done++;
}
console.log(`  ✅ Backfilled ${done} event(s) (legacy fields kept — Phase B strips them later).\n`);
