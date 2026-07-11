#!/usr/bin/env node
/**
 * F1 Phase 3 backfill: give LEGACY events map coordinates so they can appear on
 * the Search map. For every event that has a `location` string but no
 * `locationCoords` (and no `approxCoords`), geocode the location via the Google
 * Geocoding API and write `locationCoords {latitude, longitude}`.
 *
 * We only write `locationCoords`; the deployed onEventWritten trigger then
 * derives the gated fields (area, approxCoords, private/location) on that write,
 * so F2 stays intact — non-participants still see an approximate circle, not a
 * pin. Events that can't be geocoded are left as-is ("N not on map").
 *
 * Usage:   node scripts/migrate-event-coords.mjs [--project bondvibe-dev] [--key <mapsKey>] [--apply]
 * Default: DRY RUN (prints the plan, writes nothing). Pass --apply to write.
 * Auth:    gcloud user credentials (Owner/Editor). The Maps key needs the
 *          Geocoding API enabled (defaults to app.json's EXPO_PUBLIC_GOOGLE_PLACES_API_KEY).
 *          gcloud auth print-access-token
 *
 * Idempotent: an event that already has locationCoords/approxCoords is skipped.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const PROJECT = arg("project", "bondvibe-dev");
const APPLY = process.argv.includes("--apply");
const appJson = JSON.parse(readFileSync(new URL("../app.json", import.meta.url)));
const GEOCODE_KEY = arg("key", appJson?.expo?.extra?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY);
if (!GEOCODE_KEY) {
  console.error("No Maps/Geocoding key — pass --key or set app.json extra.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY");
  process.exit(1);
}
const token = execSync("gcloud auth print-access-token").toString().trim();

const headers = {
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-Goog-User-Project": PROJECT,
};
const FS_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const sv = (f) => (f ? f.stringValue : undefined);
const segmentsOf = (name) => name.split("/documents/")[1].split("/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
async function geocode(address) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GEOCODE_KEY}`;
    const res = await fetch(url);
    const body = await res.json();
    if (body.status === "OK" && body.results?.[0]?.geometry?.location) {
      const { lat, lng } = body.results[0].geometry.location;
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { latitude: lat, longitude: lng };
    }
    if (body.status && body.status !== "ZERO_RESULTS") {
      console.warn(`  geocode ${body.status}${body.error_message ? ": " + body.error_message : ""}`);
    }
  } catch (e) {
    console.warn(`  geocode network error (treated as miss): ${e.message}`);
  }
  return null; // idempotent re-run resumes safely
}

console.log(`\n📌 Event coord backfill — project ${PROJECT} ${APPLY ? "(APPLY)" : "(dry run)"}\n`);
const events = await runQuery({ from: [{ collectionId: "events" }] });
console.log(`Found ${events.length} event(s).`);

// Candidates: have a location string, but no coords of any kind yet.
const candidates = [];
let skippedHasCoords = 0;
let skippedNoLocation = 0;
// A field written as `null` shows up in REST as { nullValue: null } (present,
// not absent) — CreateEvent writes `locationCoords: locationCoords || null` and
// classes write `locationCoords: null`, so we must detect a REAL coords mapValue,
// not mere key presence, or every null-coord event is wrongly skipped.
const hasCoordMap = (fld) => fld != null && fld.mapValue != null;
for (const ev of events) {
  const f = ev.fields || {};
  const eid = segmentsOf(ev.name)[1];
  if (hasCoordMap(f.locationCoords) || hasCoordMap(f.approxCoords)) { skippedHasCoords++; continue; }
  const location = sv(f.location);
  if (!location || !location.trim()) { skippedNoLocation++; continue; }
  candidates.push({ eid, location: location.trim() });
}
console.log(`  ${candidates.length} candidate(s) to geocode · ${skippedHasCoords} already have coords · ${skippedNoLocation} without a location string\n`);

// Geocode (dry run also geocodes, so the plan shows real hit/miss counts).
const plan = [];
let miss = 0;
for (const c of candidates) {
  const coords = await geocode(c.location);
  await sleep(120); // be gentle on the Geocoding API
  if (coords) {
    plan.push({ ...c, coords });
    console.log(`  ✓ ${c.eid}: "${c.location}" → ${coords.latitude.toFixed(5)},${coords.longitude.toFixed(5)}`);
  } else {
    miss++;
    console.log(`  ✗ ${c.eid}: "${c.location}" → no result`);
  }
}

console.log(`\nPlan: ${plan.length} event(s) will get locationCoords · ${miss} couldn't be geocoded (left off-map)\n`);

if (!APPLY) {
  console.log("(dry run — nothing written. Re-run with --apply to commit. The onEventWritten trigger then gates each on write.)\n");
  process.exit(0);
}

console.log("Applying…");
let done = 0;
for (const p of plan) {
  await patchDoc(
    `events/${p.eid}`,
    { locationCoords: { mapValue: { fields: {
      latitude: { doubleValue: p.coords.latitude },
      longitude: { doubleValue: p.coords.longitude },
    } } } },
    ["locationCoords"],
  );
  done++;
}
console.log(`  ✅ Backfilled locationCoords on ${done} event(s). The trigger derives area/approxCoords/private on each write.\n`);
