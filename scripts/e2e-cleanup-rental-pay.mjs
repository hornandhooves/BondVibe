#!/usr/bin/env node
/**
 * KIN-275 cleanup — deletes the qaSeed:"KIN275-RENTAL-PAY" vehicle doc. The
 * flow only reaches RentalCheckout (Stripe CardField, documented not
 * executed) — reserveVehicle() never runs, so no "rentals" collection doc is
 * ever created by this flow. Nothing else to clean.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-cleanup-rental-pay.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();

const QA_SEED = "KIN275-RENTAL-PAY";

(async () => {
  const before = await db.collection("vehicles").where("qaSeed", "==", QA_SEED).get();
  console.log("antes — vehicles qaSeed:", before.size);

  for (const d of before.docs) await d.ref.delete();

  const after = await db.collection("vehicles").where("qaSeed", "==", QA_SEED).get();
  console.log("después — vehicles qaSeed:", after.size);
  console.log(after.size === 0 ? "LIMPIEZA COMPLETA" : "QUEDAN RESTOS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
