#!/usr/bin/env node
/**
 * KIN-275 seed — e2e-email-gate.yaml. Ensures ONE Firebase Auth account
 * exists with emailVerified:false — same ensureUser idempotent-upsert
 * pattern as kin117_smoke_admin_setup.mjs, but forcing emailVerified back to
 * false on every run (defensive reset — in case a stray click ever verified
 * it out of band; the flow's whole point is testing the UNVERIFIED path).
 *
 * uid/email are FIXED (not timestamped) on purpose: this is exactly the
 * account referenced by KINLO_UNVERIFIED_EMAIL / KINLO_UNVERIFIED_PASSWORD in
 * EAS Environment Variables — those are created ONCE by Carlos in the EAS
 * console and must keep pointing at the same account across runs.
 *
 * Password is fixed and printed only on first creation, matching the
 * kin117_smoke_admin_setup.mjs convention (throwaway QA account, not a real
 * credential). Never logged again on a defensive-reset run.
 *
 * Every doc: qaSeed:"KIN275-EMAIL-GATE". Cleanup target:
 * scripts/e2e-cleanup-email-gate.mjs (deletes + this script recreates fresh
 * next run — simpler than trying to keep one persistent account in sync).
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-seed-email-gate.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();
const auth = admin.auth();

const QA_SEED = "KIN275-EMAIL-GATE";
const UID = "qa275eg_unverified";
const EMAIL = "qa275eg.unverified@kinlo.test";
const PASSWORD = "Kin275EmailGate!2026";

(async () => {
  try {
    await auth.createUser({ uid: UID, email: EMAIL, password: PASSWORD, emailVerified: false });
    console.log(`created auth user ${UID}`);
    console.log("PASSWORD (first creation only — copy into EAS KINLO_UNVERIFIED_PASSWORD):", PASSWORD);
  } catch (e) {
    if (e.code === "auth/uid-already-exists" || e.code === "auth/email-already-exists") {
      await auth.updateUser(UID, { email: EMAIL, password: PASSWORD, emailVerified: false });
      console.log(`reset existing auth user ${UID} to emailVerified:false`);
    } else {
      throw e;
    }
  }

  await db.collection("users").doc(UID).set(
    { role: "user", fullName: "QA275 Email Gate", qaSeed: QA_SEED },
    { merge: true },
  );

  const check = await auth.getUser(UID);
  console.log("verified emailVerified is false:", check.emailVerified === false);
  console.log(JSON.stringify({ uid: UID, email: EMAIL }, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
