#!/usr/bin/env node
/**
 * KIN-275 cleanup — deletes everything e2e-seed-join-event.mjs created plus
 * whatever the join itself wrote: joinEvent (rosterService.js:145) writes to
 * the events/{eventId}/roster subcollection via a Cloud Function — that
 * subcollection is NOT tagged with qaSeed (the function writes it, not this
 * script), so it's deleted by being a child of the seeded event, same lesson
 * as kin212_smoke_cleanup.mjs's membershipReservations handling.
 *
 * Reports before/after counts — "cleaned up" is a measurement here, not a
 * claim (regla 27 del proyecto).
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-cleanup-join-event.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();

const QA_SEED = "KIN275-JOIN-EVENT";

(async () => {
  const before = await db.collection("events").where("qaSeed", "==", QA_SEED).count().get();
  console.log("antes — eventos qaSeed:", before.data().count);

  const evts = await db.collection("events").where("qaSeed", "==", QA_SEED).get();
  let rosterDeleted = 0;
  for (const d of evts.docs) {
    const roster = await d.ref.collection("roster").get();
    for (const r of roster.docs) {
      await r.ref.delete();
      rosterDeleted++;
    }
    await d.ref.delete();
  }

  const after = await db.collection("events").where("qaSeed", "==", QA_SEED).count().get();
  console.log("roster docs borrados:", rosterDeleted);
  console.log("después — eventos qaSeed:", after.data().count);
  console.log(after.data().count === 0 ? "LIMPIEZA COMPLETA" : "QUEDAN RESTOS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
