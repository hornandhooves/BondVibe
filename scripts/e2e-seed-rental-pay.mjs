#!/usr/bin/env node
/**
 * KIN-275 seed — e2e-rental-pay.yaml. Ensures ONE available, priced vehicle
 * exists and sorts FIRST in RentalHubScreen's list, so the flow's
 * `rental-vehicle-card-0` tap lands on our fixture.
 *
 * WHY AN ID-PREFIX HEURISTIC (not a date self-check like e2e-seed-join-event.mjs):
 * getAvailableVehicles (src/services/rentalService.js:96-99) has NO orderBy —
 * where("status","==","available") + limit only — and RentalHubScreen.js does
 * no client-side sort either (grep: zero .sort() calls). There is no field to
 * anchor a real "am I first" check against, unlike `events`' orderBy("date").
 *
 * DECISION (Carlos, 13-sep-2026, see KIN-275 comment): accept a temporary
 * heuristic — assign a document ID that sorts before realistic existing IDs
 * ("00_" prefix, ASCII digits sort before letters) and bet that Firestore
 * returns unordered-query results ordered by __name__ in practice. This is
 * EXPLICITLY an [Assumption], not a documented Firestore contract — this
 * fixture can start failing intermittently for reasons unrelated to the
 * rentals feature (regla 27). To reduce (not eliminate) the risk, this script
 * still self-checks: it reads the current lowest vehicle id and aborts loud if
 * something already sorts before our prefix, rather than silently racing.
 *
 * BREAKS SILENTLY THE DAY: KIN-185 (Featured Services) ships a featured flag,
 * or marketplace/rentals gets an explicit orderBy (alphabetical/price) — this
 * heuristic stops being "first" with no error. See KIN-275 + KIN-185 comments
 * (13-sep-2026) for the full note. When either ships, migrate this script to
 * anchor on that real field instead of the ID trick.
 *
 * Every doc: qaSeed:"KIN275-RENTAL-PAY". Cleanup target:
 * scripts/e2e-cleanup-rental-pay.mjs.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-seed-rental-pay.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();

const QA_SEED = "KIN275-RENTAL-PAY";
const ID_PREFIX = "00_qa275rp_vehicle_";

(async () => {
  const stamp = Date.now();
  const vehicleId = `${ID_PREFIX}${stamp}`;

  // Self-check: read the current lowest-id available vehicle. If it already
  // sorts before our prefix, this run cannot claim to be "first" — abort
  // rather than seed a fixture the flow won't reach.
  const lowestSnap = await db
    .collection("vehicles")
    .where("status", "==", "available")
    .orderBy(admin.firestore.FieldPath.documentId(), "asc")
    .limit(1)
    .get();

  if (!lowestSnap.empty && lowestSnap.docs[0].id < vehicleId) {
    console.error(
      `ABORT: an existing available vehicle (${lowestSnap.docs[0].id}) already sorts ` +
        `before our fixture id (${vehicleId}). The "first card" heuristic requires our ` +
        `id to be the lowest. Either that doc is a leftover from a previous run (check ` +
        `it isn't tagged qaSeed and clean it up if it is a stray fixture), or a real ` +
        `vehicle genuinely has a low id — in that case this heuristic has reached its ` +
        `limit and needs the KIN-185 featured-flag migration noted in KIN-275.`,
    );
    process.exit(1);
  }

  await db.collection("vehicles").doc(vehicleId).set({
    qaSeed: QA_SEED,
    providerId: `qa275rp_provider_${stamp}`,
    ownerId: `qa275rp_owner_${stamp}`,
    type: "scooter",
    title: "QA275 Rental Fixture",
    city: "tulum",
    pickupLabel: "Tulum Centro",
    photos: [],
    status: "available",
    requiresLicense: false,
    pricePerDayCentavos: 50000,
    pricePerHourCentavos: 0,
    depositCentavos: 0,
    createdAt: admin.firestore.Timestamp.now(),
  });

  console.log(JSON.stringify({ vehicleId }, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
