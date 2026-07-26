// functions/scripts/qa/cleanup_kin108.js — one-off, QA-only. Deletes exactly
// what seed_kin108.js wrote: every doc with seed:true AND an id prefixed
// qa_kin108_, across every collection the seed script touched. Run once
// verification against previewDeletionImpact is done.
//
// Run: cd ~/bondvibe/functions && GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/qa/cleanup_kin108.js
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const PREFIX = "qa_kin108_";
const BIZ = "qa_kin108_biz_01";

// Bookings (a subcollection) before its parent business doc — order doesn't
// change correctness (deleting a doc never cascades to its subcollections),
// but this reads top-down.
const TARGETS = [
  db.collection("businesses").doc(BIZ).collection("bookings"),
  db.collection("businesses"),
  db.collection("paymentLedger"),
  db.collection("giftLedger"),
  db.collection("events"),
  db.collection("rentals"),
  db.collection("memberships"),
];

(async () => {
  let deleted = 0;
  for (const coll of TARGETS) {
    const snap = await coll.where("seed", "==", true).get();
    for (const doc of snap.docs) {
      if (!doc.id.startsWith(PREFIX)) {
        console.warn(`SKIP (seed:true but not qa_kin108_ prefixed — not ours): ${coll.path}/${doc.id}`);
        continue;
      }
      await doc.ref.delete();
      deleted++;
      console.log(`deleted ${coll.path}/${doc.id}`);
    }
  }
  console.log(`CLEANUP DONE. deleted=${deleted}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
