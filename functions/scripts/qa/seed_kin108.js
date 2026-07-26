// functions/scripts/qa/seed_kin108.js — one-off, QA-only. NOT a test, NOT
// exported/deployed as a function.
//
// KIN-108: seeds synthetic docs across all six previewDeletionImpact
// categories, for BOTH roles (seller/hostUid and buyer/counterparty) — today
// only the seller side is queried (KIN-112 tracks adding the buyer side,
// Commit B's B2), but the data covers both so that work has something real
// to exercise against. dev-only (kinlo-app-dev): every doc id is prefixed
// qa_kin108_ and carries seed:true, and the uids are synthetic
// (qa_kin108_seller_01 etc.) with no corresponding Firebase Auth account.
//
// SAFETY (verify before running against any other project): every held
// paymentLedger row uses releaseAt in 2099. releaseHostPayouts
// (functions/index.js:3511-3540, confirmed against main @ 158bbab) queries
// state=="held" AND frozen==false AND releaseAt<=now every hour and fires a
// REAL Stripe transfer for every match — a past releaseAt on seeded data
// would move real money within the hour. previewDeletionImpact's held-state
// classification never reads releaseAt (see deletionPreview.js
// pendingEscrowInCollection), so a 2099 value doesn't distort anything being
// verified here. giftLedger rows get the same releaseAt for consistency,
// though releaseHostPayouts itself only ever queries paymentLedger.
//
// Run: cd ~/bondvibe/functions && GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/qa/seed_kin108.js
// Cleanup after verifying: node scripts/qa/cleanup_kin108.js
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const SELLER = "qa_kin108_seller_01";
const BUYER = "qa_kin108_buyer_01";
const RECIPIENT = "qa_kin108_recipient_01";
const BIZ = "qa_kin108_biz_01";
const RELEASE_AT_2099 = new Date("2099-01-01T00:00:00Z").toISOString();

(async () => {
  const batch = db.batch();
  let count = 0;
  const seed = (ref, data) => {
    batch.set(ref, {...data, seed: true});
    count++;
  };

  // 1. pendingSettlement — paymentLedger held. hostUid=seller (payout host),
  //    buyerUid=buyer (the payer) — same doc covers both roles.
  seed(db.collection("paymentLedger").doc("qa_kin108_pi_01"), {
    paymentIntentId: "qa_kin108_pi_01",
    type: "event_ticket",
    sourceId: "qa_kin108_evt_01",
    hostUid: SELLER,
    buyerUid: BUYER,
    state: "held",
    frozen: false,
    grossAmount: 25000,
    hostAmount: 22000,
    currency: "mxn",
    releaseAt: RELEASE_AT_2099,
  });

  // 2. pendingGifts — giftLedger held. hostUid=seller, gifterId=buyer (the
  //    payer), recipientId=a third uid (the beneficiary) — three distinct
  //    roles on one doc.
  seed(db.collection("giftLedger").doc("qa_kin108_pi_gift_01"), {
    paymentIntentId: "qa_kin108_pi_gift_01",
    type: "gift",
    hostUid: SELLER,
    gifterId: BUYER,
    recipientId: RECIPIENT,
    state: "held",
    frozen: false,
    redeemed: false,
    grossAmount: 15000,
    currency: "mxn",
    releaseAt: RELEASE_AT_2099,
  });

  // 3. futureEvents — creatorId=seller, future date, price>0, attendees>0.
  //    No buyer-side field on events themselves (attendance is a roster
  //    subcollection, out of B2's scope), so seller-only here is correct.
  seed(db.collection("events").doc("qa_kin108_evt_01"), {
    creatorId: SELLER,
    title: "QA KIN-108 seeded event",
    price: 300,
    participantCount: 2,
    date: new Date(Date.now() + 10 * 864e5).toISOString(),
  });

  // 4. activeRentals — ownerId=seller, renterId=buyer.
  seed(db.collection("rentals").doc("qa_kin108_rental_01"), {
    ownerId: SELLER,
    renterId: BUYER,
    status: "active",
    priceCentavos: 50000,
    currency: "mxn",
  });

  // 5. memberships — hostId=seller, userId=buyer, active + not expired.
  seed(db.collection("memberships").doc("qa_kin108_mem_01"), {
    hostId: SELLER,
    userId: BUYER,
    status: "active",
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 60 * 864e5)),
  });

  // 6. bookings — businesses/{biz}/bookings, ownerUid=seller, buyerUid=buyer.
  //    The parent business doc is seeded too for referential completeness
  //    (previewDeletionImpact reads the booking doc directly and never
  //    dereferences the parent, so this isn't load-bearing for the preview).
  seed(db.collection("businesses").doc(BIZ), {
    name: "QA KIN-108 seeded business",
    ownerUid: SELLER,
  });
  seed(
    db.collection("businesses").doc(BIZ).collection("bookings").doc("qa_kin108_booking_01"),
    {
      ownerUid: SELLER,
      buyerUid: BUYER,
      status: "reserved",
      start: new Date(Date.now() + 5 * 864e5).toISOString(),
      totalCentavos: 40000,
      currency: "mxn",
    },
  );

  await batch.commit();
  console.log(
    `SEEDED ${count} docs under qa_kin108_ prefix. ` +
    `seller=${SELLER} buyer=${BUYER} recipient=${RECIPIENT} biz=${BIZ}`,
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
