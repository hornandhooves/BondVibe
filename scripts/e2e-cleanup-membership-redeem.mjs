#!/usr/bin/env node
/**
 * KIN-275 cleanup — same shape as kin212_smoke_cleanup.mjs (already verified
 * for this exact schema): deletes events/{qa275mr_evt_*} + roster
 * subcollection, memberships/{qa275mr_mem_*}, and membershipReservations
 * created by reserveMembershipCredit — that collection is NOT tagged with
 * qaSeed (the Cloud Function writes it), so it's found by eventId instead.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-cleanup-membership-redeem.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();

const QA_SEED = "KIN275-MEMBERSHIP-REDEEM";

(async () => {
  const evts = await db.collection("events").where("qaSeed", "==", QA_SEED).get();
  const mems = await db.collection("memberships").where("qaSeed", "==", QA_SEED).get();

  const eventIds = evts.docs.map((d) => d.id);
  let reservations = [];
  for (const id of eventIds) {
    const rs = await db.collection("membershipReservations").where("eventId", "==", id).get();
    reservations = reservations.concat(rs.docs);
  }

  console.log(
    "antes:",
    JSON.stringify({ events: evts.size, memberships: mems.size, reservations: reservations.length }),
  );

  for (const d of evts.docs) {
    const roster = await d.ref.collection("roster").get();
    for (const r of roster.docs) await r.ref.delete();
    await d.ref.delete();
  }
  for (const d of mems.docs) await d.ref.delete();
  for (const d of reservations) await d.ref.delete();

  const afterE = await db.collection("events").where("qaSeed", "==", QA_SEED).get();
  const afterM = await db.collection("memberships").where("qaSeed", "==", QA_SEED).get();
  let afterR = 0;
  for (const id of eventIds) {
    const rs = await db.collection("membershipReservations").where("eventId", "==", id).get();
    afterR += rs.size;
  }

  console.log("después:", JSON.stringify({ events: afterE.size, memberships: afterM.size, reservations: afterR }));
  console.log(afterE.size + afterM.size + afterR === 0 ? "LIMPIEZA COMPLETA" : "QUEDAN RESTOS");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
