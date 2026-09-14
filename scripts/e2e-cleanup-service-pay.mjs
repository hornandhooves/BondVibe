#!/usr/bin/env node
/**
 * KIN-275 cleanup — deletes the qaSeed:"KIN275-SERVICE-PAY" sessionType doc
 * AND its parent business doc (we created both under the fixture's own
 * throwaway bizId, so nothing else references that business). The flow only
 * reaches ServiceCheckout (Stripe CardField, documented not executed) —
 * reserveServiceBooking() never runs, so no "bookings" doc is ever created.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-cleanup-service-pay.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();

const QA_SEED = "KIN275-SERVICE-PAY";

(async () => {
  const before = await db
    .collectionGroup("sessionTypes")
    .where("qaSeed", "==", QA_SEED)
    .get();
  console.log("antes — sessionTypes qaSeed:", before.size);

  const bizIds = new Set();
  for (const d of before.docs) {
    bizIds.add(d.ref.parent.parent.id);
    await d.ref.delete();
  }
  for (const bizId of bizIds) {
    await db.collection("businesses").doc(bizId).delete();
  }

  const after = await db
    .collectionGroup("sessionTypes")
    .where("qaSeed", "==", QA_SEED)
    .get();
  console.log("después — sessionTypes qaSeed:", after.size, "· businesses borrados:", bizIds.size);
  console.log(after.size === 0 ? "LIMPIEZA COMPLETA" : "QUEDAN RESTOS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
