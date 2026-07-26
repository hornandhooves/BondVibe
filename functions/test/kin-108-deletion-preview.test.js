/**
 * KIN-108 phase 1 (Rev. 2.1) — previewDeletionImpact is read-only and never
 * blocks; deleteUserAccount no longer rejects for open financial
 * obligations (that 409 policy from PR #97's first pass was killed by
 * product decision, KIN-108 comment 10038). These tests cover:
 *   - each preview category (pendingSettlement/pendingGifts byState
 *     breakdown: held / releasedReversible / frozen), including the two the
 *     QA review flagged as untested in isolation: a future paid event with
 *     ZERO ledger rows (the MercadoPago route) and a `released` ledger row
 *     inside/outside the dispute window
 *   - deleteUserAccount still succeeds (200) even with open obligations
 *   - the admin route is never blocked and leaves an audit trail
 *   - a category that exceeds the page cap truncates (per-category flag,
 *     not a single root-level one) instead of crashing, and an untruncated
 *     sibling category never inherits that flag
 *   - PDI12: a category whose query rejects (e.g. an index still CREATING —
 *     the exact failure verified live against kinlo-app-dev) degrades to
 *     `unavailable: true` instead of aborting the other five, and flips the
 *     root `complete` flag to false (KIN-108 AC #14, Commit B0)
 *
 *   npm run test:payments
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");
const {previewDeletionImpact} = require("../account/deletionPreview");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const IDT = `http://127.0.0.1:${
  process.env.FIREBASE_AUTH_EMULATOR_HOST.split(":")[1]
}/identitytoolkit.googleapis.com/v1/accounts`;

admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();

let uniq = 0;
/** @return {string} a collision-free suffix for seeded ids */
const nextId = () => `t${Date.now()}_${uniq++}`;

/**
 * Create an emulator user and return a usable ID token.
 * @param {string} uid desired uid
 * @return {Promise<string>} the ID token
 */
async function tokenFor(uid) {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: true});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: true});
  }
  const r = await fetch(`${IDT}:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  }).then((x) => x.json());
  assert.ok(r.idToken, `no idToken for ${uid}: ${JSON.stringify(r)}`);
  return r.idToken;
}

const deleteAccount = (idToken, body = {}) =>
  fetch(`${FN}/deleteUserAccount`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": `Bearer ${idToken}`},
    body: JSON.stringify(body),
  });

// ── previewDeletionImpact: one category at a time ───────────────────────────

test("PDI1 a held paymentLedger row is detected, classified in byState.held", async () => {
  const host = `host_${nextId()}`;
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: host, state: "held", grossAmount: 25000,
  });

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(preview.pendingSettlement.count, 1);
  assert.strictEqual(preview.pendingSettlement.amountMinor, 25000);
  assert.strictEqual(preview.pendingSettlement.byState.held.count, 1);
  assert.strictEqual(preview.pendingSettlement.byState.held.amountMinor, 25000);
  assert.strictEqual(preview.pendingSettlement.byState.releasedReversible.count, 0);
  assert.strictEqual(preview.pendingSettlement.byState.frozen.count, 0);
  assert.strictEqual(preview.pendingSettlement.truncated, false);
});

test("PDI2 future paid event, attendees, ZERO ledger rows is detected (MP route, isolated)", async () => {
  const host = `host_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: host,
    title: "Clase pagada por MercadoPago",
    price: 250,
    participantCount: 3,
    date: new Date(Date.now() + 7 * 864e5).toISOString(),
  });

  // Deliberately no paymentLedger row anywhere for this host — this is
  // exactly the DA1 coverage gap QA flagged: the old test always seeded a
  // ledger row alongside the event, so this branch never ran in isolation.
  const ledgerForHost = await db.collection("paymentLedger")
    .where("hostUid", "==", host).get();
  assert.strictEqual(ledgerForHost.size, 0, "test setup: must have zero ledger rows");

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(preview.pendingSettlement.count, 0);
  assert.strictEqual(preview.futureEvents.count, 1);
  assert.strictEqual(preview.futureEvents.attendees, 3);
  assert.strictEqual(preview.futureEvents.amountMinor, 250 * 100 * 3);
  assert.strictEqual(preview.futureEvents.isEstimate, true);
});

test("PDI3 a released ledger row INSIDE the reversal window is detected, classified releasedReversible", async () => {
  const host = `host_${nextId()}`;
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: host, state: "released", frozen: false, grossAmount: 10000,
    releasedAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3600000), // 1h ago
  });

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(preview.pendingSettlement.count, 1, "recently-released money is still reversible");
  assert.strictEqual(preview.pendingSettlement.amountMinor, 10000);
  assert.strictEqual(preview.pendingSettlement.byState.releasedReversible.count, 1);
  assert.strictEqual(preview.pendingSettlement.byState.held.count, 0);
  assert.strictEqual(preview.pendingSettlement.byState.frozen.count, 0);
  assert.strictEqual(preview.pendingSettlement.byState.notRecoverable.count, 0);
});

test("PDI4 a released row OUTSIDE the reversal window is shown as notRecoverable, not hidden (Commit B5)", async () => {
  const host = `host_${nextId()}`;
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: host, state: "released", frozen: false, grossAmount: 10000,
    // 200 days ago — past the 30-day default reversal window.
    releasedAt: admin.firestore.Timestamp.fromMillis(Date.now() - 200 * 864e5),
  });

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(
    preview.pendingSettlement.count, 0,
    "settled, no-longer-reversible money is excluded from the actionable total",
  );
  assert.strictEqual(
    preview.pendingSettlement.byState.notRecoverable.count, 1,
    "but it must still be VISIBLE under notRecoverable, never silently dropped",
  );
  assert.strictEqual(preview.pendingSettlement.byState.notRecoverable.amountMinor, 10000);
  assert.strictEqual(preview.pendingSettlement.byState.releasedReversible.count, 0);
});

test("PDI5 a frozen ledger row is detected regardless of age, classified frozen (not releasedReversible)", async () => {
  const host = `host_${nextId()}`;
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: host, state: "released", frozen: true, grossAmount: 10000,
    releasedAt: admin.firestore.Timestamp.fromMillis(Date.now() - 300 * 864e5), // long past the window
  });

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(preview.pendingSettlement.count, 1, "an active dispute overrides the dispute-window cutoff");
  assert.strictEqual(preview.pendingSettlement.byState.frozen.count, 1);
  assert.strictEqual(preview.pendingSettlement.byState.releasedReversible.count, 0);
});

test("PDI6 an unredeemed (held) gift is detected", async () => {
  const host = `host_${nextId()}`;
  await db.collection("giftLedger").doc(`pi_gift_${nextId()}`).set({
    hostUid: host, state: "held", redeemed: false, grossAmount: 15000,
  });

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(preview.pendingGifts.count, 1);
  assert.strictEqual(preview.pendingGifts.amountMinor, 15000);
  assert.strictEqual(preview.pendingGifts.byState.held.count, 1);
});

test("PDI7 an active rental is detected", async () => {
  const host = `host_${nextId()}`;
  await db.collection("rentals").doc(`rental_${nextId()}`).set({
    ownerId: host, renterId: `renter_${nextId()}`, status: "active",
  });

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(preview.activeRentals.count, 1);
});

test("PDI8 a still-valid sold membership is detected", async () => {
  const host = `host_${nextId()}`;
  await db.collection("memberships").doc(`mem_${nextId()}`).set({
    userId: `member_${nextId()}`, hostId: host, status: "active",
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 864e5),
  });

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(preview.memberships.count, 1);
});

test("PDI9 an active upcoming service booking is detected via a direct (collectionGroup) query", async () => {
  const bizId = `biz_${nextId()}`;
  const owner = `host_${nextId()}`;
  await db.collection("businesses").doc(bizId).collection("bookings")
    .doc(`booking_${nextId()}`).set({
      ownerUid: owner,
      status: "reserved",
      start: new Date(Date.now() + 2 * 864e5).toISOString(),
      totalCentavos: 50000,
    });

  const preview = await previewDeletionImpact(db, owner);
  assert.strictEqual(preview.bookings.count, 1);
  assert.strictEqual(preview.bookings.amountMinor, 50000);
});

test("PDI10 a category past its page cap truncates (per-category flag) instead of crashing", async () => {
  const host = `host_${nextId()}`;
  const TOTAL = 1001; // MAX_PAGES(5) * PAGE_SIZE(200) + 1 — one past the cap
  const writer = db.bulkWriter();
  for (let i = 0; i < TOTAL; i++) {
    writer.set(db.collection("paymentLedger").doc(`pi_${nextId()}_${i}`), {
      hostUid: host, state: "held", grossAmount: 100,
    });
  }
  await writer.close();

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(preview.pendingSettlement.truncated, true, "must flag truncation, never silently under-report");
  assert.strictEqual(
    preview.pendingSettlement.count, 1000,
    "should return the full first-cap page, not crash or stop early",
  );
});

test("PDI11 only the truncated category reports truncated:true — others stay false", async () => {
  const host = `host_${nextId()}`;
  const TOTAL = 1001; // forces pendingSettlement.truncated, same seeding as PDI10
  const writer = db.bulkWriter();
  for (let i = 0; i < TOTAL; i++) {
    writer.set(db.collection("paymentLedger").doc(`pi_${nextId()}_${i}`), {
      hostUid: host, state: "held", grossAmount: 100,
    });
  }
  // A single, unambiguously-complete membership for the SAME uid.
  writer.set(db.collection("memberships").doc(`mem_${nextId()}`), {
    userId: `member_${nextId()}`, hostId: host, status: "active",
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 864e5),
  });
  await writer.close();

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(preview.pendingSettlement.truncated, true);
  assert.strictEqual(preview.memberships.count, 1);
  assert.strictEqual(preview.memberships.truncated, false, "an untruncated category must not inherit another's flag");
  assert.strictEqual(preview.pendingGifts.truncated, false);
  assert.strictEqual(preview.activeRentals.truncated, false);
  assert.strictEqual(preview.bookings.truncated, false);
  assert.strictEqual(preview.futureEvents.truncated, false);
});

test("PDI12 one category's query rejecting degrades to unavailable, others stay real, complete=false", async () => {
  const host = `host_${nextId()}`;
  // A real, independently-verifiable membership for the SAME uid — proves
  // the failure of one category doesn't drag down a sibling that resolved fine.
  await db.collection("memberships").doc(`mem_${nextId()}`).set({
    userId: `member_${nextId()}`, hostId: host, status: "active",
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 864e5),
  });

  // Force ONLY the "rentals" collection to reject, as if its index were
  // still CREATING (the exact live failure verified against kinlo-app-dev).
  // Everything else on this fake db passes straight through to the real
  // emulator db.
  const failingQuery = {
    where() {
      return failingQuery;
    },
    orderBy() {
      return failingQuery;
    },
    limit() {
      return failingQuery;
    },
    startAfter() {
      return failingQuery;
    },
    get() {
      return Promise.reject(Object.assign(new Error("simulated index not ready"), {code: 9}));
    },
  };
  const fakeDb = {
    collection: (name) => (name === "rentals" ? failingQuery : db.collection(name)),
    collectionGroup: (name) => db.collectionGroup(name),
  };

  const preview = await previewDeletionImpact(fakeDb, host);

  assert.strictEqual(preview.complete, false, "complete must be false when any category failed");
  assert.strictEqual(preview.activeRentals.unavailable, true);
  assert.strictEqual(preview.activeRentals.count, 0, "a failed category is zeroed, never invented as a real zero");
  assert.strictEqual(preview.activeRentals.truncated, false);

  // The other seven must be REAL results, not swallowed by rentals' failure.
  assert.strictEqual(preview.memberships.count, 1);
  assert.strictEqual(preview.memberships.unavailable, undefined);
  assert.strictEqual(preview.pendingSettlement.unavailable, undefined);
  assert.strictEqual(preview.myPendingPayments.unavailable, undefined);
  assert.strictEqual(preview.pendingGifts.unavailable, undefined);
  assert.strictEqual(preview.myPendingGifts.unavailable, undefined);
  assert.strictEqual(preview.bookings.unavailable, undefined);
  assert.strictEqual(preview.futureEvents.unavailable, undefined);
});

// ── Buyer/counterparty side (KIN-108 Commit B2) ─────────────────────────────

test("PDI13 a held payment where the uid is the BUYER (not host) is detected via myPendingPayments", async () => {
  const buyer = `buyer_${nextId()}`;
  const seller = `seller_${nextId()}`;
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: seller, buyerUid: buyer, state: "held", grossAmount: 25000,
  });

  const preview = await previewDeletionImpact(db, buyer);
  assert.strictEqual(preview.myPendingPayments.count, 1);
  assert.strictEqual(preview.myPendingPayments.amountMinor, 25000);
  assert.strictEqual(preview.myPendingPayments.byState.held.count, 1);
  // The buyer is not the host, so the seller-side category must stay empty.
  assert.strictEqual(preview.pendingSettlement.count, 0);
});

test("PDI14 a held gift where the uid is GIFTER or RECIPIENT (not host) is detected via myPendingGifts", async () => {
  const gifter = `gifter_${nextId()}`;
  const recipient = `recipient_${nextId()}`;
  const seller = `seller_${nextId()}`;
  await db.collection("giftLedger").doc(`pi_gift_${nextId()}`).set({
    hostUid: seller, gifterId: gifter, recipientId: recipient,
    state: "held", grossAmount: 15000,
  });

  const asGifter = await previewDeletionImpact(db, gifter);
  assert.strictEqual(asGifter.myPendingGifts.count, 1);
  assert.strictEqual(asGifter.myPendingGifts.amountMinor, 15000);
  assert.strictEqual(asGifter.pendingGifts.count, 0, "gifter is not the host");

  const asRecipient = await previewDeletionImpact(db, recipient);
  assert.strictEqual(asRecipient.myPendingGifts.count, 1);
  assert.strictEqual(asRecipient.myPendingGifts.amountMinor, 15000);

  const asHost = await previewDeletionImpact(db, seller);
  assert.strictEqual(asHost.pendingGifts.count, 1);
  assert.strictEqual(asHost.myPendingGifts.count, 0, "host is neither gifter nor recipient here");
});

test("PDI15 futurePaidEvents catches both a string-dated AND a Timestamp-dated event (Commit B6)", async () => {
  const host = `host_${nextId()}`;
  await db.collection("events").doc(`evt_${nextId()}`).set({
    creatorId: host,
    title: "String-dated future event",
    price: 300,
    participantCount: 1,
    date: new Date(Date.now() + 5 * 864e5).toISOString(),
  });
  await db.collection("events").doc(`evt_${nextId()}`).set({
    creatorId: host,
    title: "Timestamp-dated future event",
    price: 400,
    participantCount: 1,
    date: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 864e5),
  });

  const preview = await previewDeletionImpact(db, host);
  assert.strictEqual(
    preview.futureEvents.count, 2,
    "a Timestamp-stored date must not be silently excluded by a string-only range filter",
  );
});

// ── deleteUserAccount: never rejects, admin route audited ──────────────────

test("DA1 an account WITH open obligations still deletes normally (no more 409)", async () => {
  const host = `host_${nextId()}`;
  const idToken = await tokenFor(host);
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: host, state: "held", grossAmount: 25000,
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 200, "deletion must never be rejected for open obligations (Rev. 2.1)");
  const body = await res.json();
  assert.strictEqual(body.success, true);
});

test("DA2 admin route force-deletes another uid with open obligations, unblocked, leaves an audit trail", async () => {
  const admin_ = `admin_${nextId()}`;
  const target = `fraud_host_${nextId()}`;
  await db.collection("users").doc(admin_).set({role: "admin"});
  await db.collection("users").doc(target).set({fullName: "Fraudulent Host"});
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: target, state: "held", grossAmount: 99999,
  });
  const adminToken = await tokenFor(admin_);
  await admin.auth().createUser({uid: target, email: `${target}@kinlo.test`, password: "Test123456!"})
    .catch(() => {});

  const res = await deleteAccount(adminToken, {userId: target});
  assert.strictEqual(res.status, 200, "T&S must be able to force-delete a fraudulent host with money in flight");

  const targetAfter = await db.collection("users").doc(target).get();
  assert.strictEqual(targetAfter.exists, false);

  const auditSnap = await db.collection("adminAuditLog")
    .where("targetUid", "==", target).get();
  assert.strictEqual(auditSnap.size, 1, "the admin-forced deletion must leave one audit entry");
  const audit = auditSnap.docs[0].data();
  assert.strictEqual(audit.action, "deleteUserAccount");
  assert.strictEqual(audit.performedBy, admin_);
});

test("DA3 an account with no open obligations still self-deletes into pending_deletion (Commit C)", async () => {
  const user = `clean_${nextId()}`;
  const idToken = await tokenFor(user);
  await db.collection("users").doc(user).set({fullName: "Clean User"});

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.success, true);

  // KIN-108 Commit C: self-delete never fully removes the user doc anymore,
  // clean account or not — it survives with accountStatus:"pending_deletion"
  // (see kin-108-commit-c.test.js AD1/AD2/AD7 for the full behavior).
  const userAfter = await db.collection("users").doc(user).get();
  assert.strictEqual(userAfter.exists, true);
  assert.strictEqual(userAfter.data().accountStatus, "pending_deletion");
});

// ── KIN-108 Commit B3: roster mark-not-remove ───────────────────────────────

test("DA4 KIN-111: self-delete no longer marks the buyer's roster doc synchronously (deferred)", async () => {
  // Superseded by KIN-111 Piece 2: roster mark-not-remove (Commit B3) used to
  // run inline on self-delete. It's now deferred to settleAccountDeletions,
  // which calls the exact same purgeUserPrivacyData code (see
  // kin-111-settlement-queue.test.js K111-8) once the 24h undo window has
  // actually passed — a self-delete's undo window must mean nothing is
  // touched yet, roster included.
  const buyer = `buyer_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const idToken = await tokenFor(buyer);

  await db.collection("events").doc(eventId).set({
    creatorId: `host_${nextId()}`,
    title: "Paid event with a real attendee",
    price: 200,
    participantCount: 1,
    date: new Date(Date.now() + 5 * 864e5).toISOString(),
  });
  await db.collection("events").doc(eventId).collection("roster").doc(buyer).set({
    uid: buyer, eventId, status: "active",
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 200);

  const rosterAfter = await db.collection("events").doc(eventId)
    .collection("roster").doc(buyer).get();
  assert.strictEqual(rosterAfter.exists, true, "roster doc must survive — never removed");
  const r = rosterAfter.data();
  assert.strictEqual(r.accountDeleted, undefined, "not marked yet — deferred to settlement");
  assert.strictEqual(r.uid, buyer, "uid field untouched — activeUids() depends on it");
  assert.strictEqual(r.status, "active", "status untouched");

  const eventAfter = await db.collection("events").doc(eventId).get();
  assert.strictEqual(
    eventAfter.data().participantCount, 1,
    "participantCount must NOT decrement — the seat stays paid, no double-sell",
  );
});

// ── KIN-108 Commit B4: gift decline (recipient) / anonymize (gifter) ───────

test("DA5 KIN-111: a self-delete no longer anonymizes the gifter's gift synchronously (deferred)", async () => {
  // Superseded by KIN-111 Piece 2 — same reasoning as DA4, for gift
  // anonymization (Commit B4). Full behavior once settlement actually runs
  // is unit-tested directly against purgeUserPrivacyData/settleOneAccount
  // Deletion in kin-111-settlement-queue.test.js.
  const gifter = `gifter_${nextId()}`;
  const recipient = `recipient_${nextId()}`;
  const giftId = `gift_${nextId()}`;
  const idToken = await tokenFor(gifter);

  await db.collection("gifts").doc(giftId).set({
    giftId, gifterId: gifter, recipientId: recipient,
    itemId: `evt_${nextId()}`, itemType: "event", status: "sent",
    paymentIntentId: `pi_${nextId()}`,
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 200);

  const giftAfter = await db.collection("gifts").doc(giftId).get();
  assert.strictEqual(giftAfter.exists, true, "the gift must survive — the recipient can still redeem it");
  const g = giftAfter.data();
  assert.strictEqual(g.status, "sent", "still redeemable, unaffected by the gifter's own deletion");
  assert.strictEqual(g.gifterId, gifter, "not anonymized yet — deferred to settlement");
  assert.strictEqual(g.gifterAnonymizedAt, undefined);
});

test("DA6 recipient-decline step never crashes deletion, even when its Stripe call fails (dummy key)", async () => {
  const recipient = `recipient_${nextId()}`;
  const giftId = `gift_${nextId()}`;
  const paymentIntentId = `pi_${nextId()}`;
  const idToken = await tokenFor(recipient);

  await db.collection("gifts").doc(giftId).set({
    giftId, gifterId: `gifter_${nextId()}`, recipientId: recipient,
    itemId: `evt_${nextId()}`, itemType: "event", status: "sent", paymentIntentId,
  });
  await db.collection("giftLedger").doc(paymentIntentId).set({
    paymentIntentId, hostUid: `host_${nextId()}`, gifterId: `gifter_${nextId()}`,
    recipientId: recipient, state: "held", grossAmount: 15000,
  });

  const res = await deleteAccount(idToken);
  // The emulator's Stripe client uses a dummy test key (functions/.secret.local)
  // and this gift's paymentIntentId was never a real Stripe charge, so the
  // ACTUAL refund call inside declineGiftCore fails — deleteUserAccount's
  // per-gift try/catch (matching every other purge step's best-effort
  // pattern) swallows that and moves on. declineGiftCore's OWN correctness
  // (it really does refund + flip status when Stripe succeeds) is unit-
  // tested with an injected mock in gifting.test.js GF4/GF5 — this test only
  // proves the wiring here can't take the whole deletion down with it.
  assert.strictEqual(res.status, 200, "deletion must succeed regardless of this sub-step's outcome");
  const body = await res.json();
  assert.strictEqual(body.success, true);
});
