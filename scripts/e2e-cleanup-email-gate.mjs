#!/usr/bin/env node
/**
 * KIN-275 cleanup — deletes the qa275eg_unverified Auth user + its
 * users/{uid} doc after each run. The seed script recreates it fresh (or
 * resets emailVerified:false if somehow still present) on the next run —
 * same create/cleanup lifecycle as kin117_smoke_admin_setup.mjs +
 * kin117_smoke_cleanup.mjs, just applied to one fixed account instead of
 * three timestamped ones.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-cleanup-email-gate.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();
const auth = admin.auth();

const UID = "qa275eg_unverified";

(async () => {
  let userExisted = false;
  try {
    await auth.getUser(UID);
    userExisted = true;
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
  }
  console.log("antes — auth user existe:", userExisted);

  if (userExisted) {
    await auth.deleteUser(UID);
  }
  try {
    await db.collection("users").doc(UID).delete();
  } catch (e) {
    console.error(`users/${UID} delete failed:`, e.message);
  }

  let stillExists = false;
  try {
    await auth.getUser(UID);
    stillExists = true;
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
  }
  console.log("después — auth user existe:", stillExists);
  console.log(stillExists ? "QUEDAN RESTOS" : "LIMPIEZA COMPLETA");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
