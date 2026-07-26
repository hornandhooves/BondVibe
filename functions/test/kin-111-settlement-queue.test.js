/**
 * KIN-111 — the settlement queue. Once selfDeleteGate's 24h undo window
 * passes, this is what actually finalizes a self-delete: cancels+refunds any
 * event starting within 72h (Piece 4), releases whatever the host still
 * earned (Piece 6), then runs the exact purge the admin path always did
 * (Piece 2/3). Also covers Piece 1 (hostCancelEventCore extraction), Piece 7
 * (missing hostUid guard), Piece 8 (stuck-notification throttle), Piece 5
 * (cancel/status callables), and Piece 9 (adminReleasePayout's `reason`).
 *
 *   npm run test:payments
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const IDT = `http://127.0.0.1:${
  process.env.FIREBASE_AUTH_EMULATOR_HOST.split(":")[1]
}/identitytoolkit.googleapis.com/v1/accounts`;

// index.js calls admin.initializeApp() (no args) itself at require time, and
// its OWN require of stripe/refunds.js (which calls admin.firestore() at
// module load) happens after that — so ../index must be required FIRST,
// before this file's own guarded initializeApp call AND before requiring
// stripe/escrow or stripe/refunds directly (same ordering as
// kin-108-commit-c.test.js; requiring them again below is just a cache hit).
const {settleOneAccountDeletion} = require("../index");
const escrow = require("../stripe/escrow");
const {hostCancelEventCore} = require("../stripe/refunds");

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const {Timestamp} = admin.firestore;

let uniq = 0;
const nextId = () => `k111_${Date.now()}_${uniq++}`;

const tokenFor = async (uid, {isAdmin = false} = {}) => {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: true});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: true});
  }
  if (isAdmin) await admin.auth().setCustomUserClaims(uid, {admin: true});
  const r = await fetch(`${IDT}:signInWithPassword?key=fake`, {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  }).then((x) => x.json());
  return r.idToken;
};

const callFn = (name, data, token) =>
  fetch(`${FN}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify({data}),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

const deleteAccountHttp = (idToken, body = {}) =>
  fetch(`${FN}/deleteUserAccount`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": `Bearer ${idToken}`},
    body: JSON.stringify(body),
  });

// Mock Stripe covering everything hostCancelEventCore + escrow.releaseOnePayout
// touch: paymentIntents.retrieve (per-id, via _setPi), refunds.create,
// transfers.create/createReversal. Same shape as escrow.test.js / admin-payouts.test.js.
const mockStripe = () => {
  const piMap = new Map();
  const transfersByKey = new Map();
  const calls = {transfers: [], reversals: [], refunds: []};
  return {
    _calls: calls,
    _setPi: (id, obj) => piMap.set(id, obj),
    paymentIntents: {
      retrieve: async (id) =>
        piMap.get(id) || {status: "succeeded", amount: 0, amount_refunded: 0, metadata: {}},
    },
    refunds: {
      create: async (params) => {
        calls.refunds.push(params);
        return {id: "re_" + nextId(), status: "succeeded"};
      },
    },
    transfers: {
      create: async (params, opts) => {
        const key = opts && opts.idempotencyKey;
        if (key && transfersByKey.has(key)) return transfersByKey.get(key);
        const tr = {id: "tr_" + nextId(), ...params};
        if (key) transfersByKey.set(key, tr);
        calls.transfers.push({params, opts});
        return tr;
      },
      createReversal: async (id, params) => {
        calls.reversals.push({id, params});
        return {id: "trr_" + nextId()};
      },
    },
  };
};

// ===========================================================================
// Piece 1 — hostCancelEventCore extraction
// ===========================================================================

test("K111-1 hostCancelEvent onCall: not-found still wraps as internal (pre-extraction quirk preserved)", async () => {
  const host = `host_${nextId()}`;
  const idToken = await tokenFor(host);
  const res = await callFn("hostCancelEvent", {eventId: `missing_${nextId()}`}, idToken);
  assert.strictEqual(res.status, 500, "not-found must still surface as internal, not 404");
  assert.match(JSON.stringify(res.body), /Event not found/);
});

test("K111-2 hostCancelEventCore: refunds succeeded payments and cancels the event", async () => {
  const host = `host_${nextId()}`;
  const buyer = `buyer_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const pi = `pi_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: host, title: "Cancel me", participantCount: 1,
    date: new Date(Date.now() + 2 * 3600000).toISOString(),
  });
  await db.collection("payments").doc(`pay_${nextId()}`).set({
    eventId, userId: buyer, status: "succeeded", paymentIntentId: pi, amount: 20000,
  });
  const s = mockStripe();
  s._setPi(pi, {
    status: "succeeded", amount: 20000, amount_refunded: 0,
    metadata: {eventPrice: "20000"},
  });

  const out = await hostCancelEventCore(eventId, {stripe: s, actorUid: host, reason: "test"});
  assert.strictEqual(out.success, true);
  assert.strictEqual(out.refundsProcessed, 1);
  assert.strictEqual(s._calls.refunds.length, 1);

  const eventAfter = await db.collection("events").doc(eventId).get();
  assert.strictEqual(eventAfter.data().status, "cancelled");
  assert.strictEqual(eventAfter.data().cancelledBy, host);
});

test("K111-2b hostCancelEventCore: an unknown eventId returns success:false, reason not_found (no throw)", async () => {
  const s = mockStripe();
  const out = await hostCancelEventCore(`missing_${nextId()}`, {stripe: s, actorUid: "someone"});
  assert.strictEqual(out.success, false);
  assert.strictEqual(out.reason, "not_found");
});

// ===========================================================================
// Piece 6/7/8 — escrow.js releaseOnePayout options + missing-hostUid guard +
// notifyPayoutStuck throttle
// ===========================================================================

test("K111-3 releaseOnePayout: allowPendingDeletionHost:true pays what a pending_deletion host earned", async () => {
  const hostUid = `host_${nextId()}`;
  await db.collection("users").doc(hostUid).set({accountStatus: "pending_deletion"});
  const pi = `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, hostUid, hostAccountId: "acct_testhost",
    grossAmount: 27312, hostAmount: 25000, currency: "mxn",
    state: "held", frozen: false, hostPenaltyOwed: 0,
    releaseAt: new Date(Date.now() - 3600000).toISOString(),
    transferId: null, refundId: null,
  });
  const s = mockStripe();
  const snap = await db.collection("paymentLedger").doc(pi).get();
  const out = await escrow.releaseOnePayout(s, db, snap, {allowPendingDeletionHost: true});
  assert.strictEqual(out, "released");
  assert.strictEqual(s._calls.transfers.length, 1);
  assert.strictEqual((await db.collection("paymentLedger").doc(pi).get()).data().state, "released");
});

test("K111-4 releaseOnePayout: a ledger row with no hostUid doesn't crash — held + missing_host_uid", async () => {
  const pi = `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, hostAccountId: "acct_testhost",
    grossAmount: 27312, hostAmount: 25000, currency: "mxn",
    state: "held", frozen: false, hostPenaltyOwed: 0,
    releaseAt: new Date(Date.now() - 3600000).toISOString(),
    transferId: null, refundId: null,
    // hostUid intentionally omitted.
  });
  const s = mockStripe();
  const snap = await db.collection("paymentLedger").doc(pi).get();
  const out = await escrow.releaseOnePayout(s, db, snap);
  assert.strictEqual(out, "held");
  assert.strictEqual(s._calls.transfers.length, 0);
  const after = await db.collection("paymentLedger").doc(pi).get();
  assert.strictEqual(after.data().lastStuckReason, "missing_host_uid");
});

test("K111-5 notifyPayoutStuck: throttles repeat notifications for the same stuck ledger row", async () => {
  const hostUid = `host_${nextId()}`;
  await db.collection("users").doc(hostUid).set({seeded: true});
  const pi = `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, hostUid, hostAccountId: null,
    grossAmount: 27312, hostAmount: 25000, currency: "mxn",
    state: "held", frozen: false, hostPenaltyOwed: 0,
    releaseAt: new Date(Date.now() - 3600000).toISOString(),
    transferId: null, refundId: null,
  });
  const s = mockStripe();
  const getSnap = () => db.collection("paymentLedger").doc(pi).get();
  const countNotifs = async () => (await db.collection("notifications")
    .where("metadata.paymentIntentId", "==", pi).get()).size;

  await escrow.releaseOnePayout(s, db, await getSnap());
  const firstCount = await countNotifs();
  assert.ok(firstCount >= 1, "the host must be notified at least once");

  await escrow.releaseOnePayout(s, db, await getSnap());
  const secondCount = await countNotifs();
  assert.strictEqual(secondCount, firstCount, "a run within 24h must not add more notifications");
  assert.strictEqual((await getSnap()).data().lastStuckReason, "no_connect_account");
});

// ===========================================================================
// Piece 2 — admin force-delete unchanged; self-delete no longer purges 2-9b
// (self-delete side is covered by AD6, functions/test/kin-108-commit-c.test.js)
// ===========================================================================

test("K111-6 admin force-delete still purges steps 2-9b immediately (unchanged)", async () => {
  const target = `target_${nextId()}`;
  await tokenFor(target);
  const adminToken = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  await db.collection("posts").doc(`post_${nextId()}`).set({authorId: target, text: "hi"});

  const res = await deleteAccountHttp(adminToken, {userId: target});
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.deletedData.posts, 1, "admin path still purges immediately");

  const postsAfter = await db.collection("posts").where("authorId", "==", target).get();
  assert.strictEqual(postsAfter.size, 0);
});

// ===========================================================================
// Piece 3+4 — settleOneAccountDeletion: stray rows, full settlement, 72h
// proximity exception
// ===========================================================================

test("K111-7 settleOneAccountDeletion: a stray row (no longer pending_deletion) is dropped, not settled", async () => {
  const uid = `stray_${nextId()}`;
  await db.collection("users").doc(uid).set({accountStatus: "active"});
  const delRef = db.collection("accountDeletions").doc(uid);
  await delRef.set({requestedBy: uid, deletionScheduledAt: Timestamp.fromMillis(Date.now() - 1000)});

  const outcome = await settleOneAccountDeletion(await delRef.get(), mockStripe());
  assert.strictEqual(outcome, "stray");
  assert.strictEqual((await delRef.get()).exists, false, "the stray row must be dropped");
});

test("K111-8 full settlement: releases payout, purges privacy data + events + user + Auth", async () => {
  const host = `settle_${nextId()}`;
  await tokenFor(host);
  await db.collection("users").doc(host).set({accountStatus: "pending_deletion"}, {merge: true});
  await db.collection("accountDeletions").doc(host).set({
    requestedBy: host, deletionScheduledAt: Timestamp.fromMillis(Date.now() - 1000),
  });
  await db.collection("posts").doc(`post_${nextId()}`).set({authorId: host, text: "hi"});
  const pi = `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, hostUid: host, hostAccountId: "acct_testhost",
    grossAmount: 27312, hostAmount: 25000, currency: "mxn",
    state: "held", frozen: false, hostPenaltyOwed: 0,
    releaseAt: new Date(Date.now() - 3600000).toISOString(),
    transferId: null, refundId: null,
  });

  const s = mockStripe();
  const delDoc = await db.collection("accountDeletions").doc(host).get();
  const outcome = await settleOneAccountDeletion(delDoc, s);
  assert.strictEqual(outcome, "settled");

  assert.strictEqual(s._calls.transfers.length, 1, "the earned payout was released despite pending_deletion");
  assert.strictEqual((await db.collection("paymentLedger").doc(pi).get()).data().state, "released");

  const postsAfter = await db.collection("posts").where("authorId", "==", host).get();
  assert.strictEqual(postsAfter.size, 0, "privacy data purged at finalization");

  const userAfter = await db.collection("users").doc(host).get();
  assert.strictEqual(userAfter.exists, false, "user doc purged at finalization");

  await assert.rejects(() => admin.auth().getUser(host), "Auth account must be deleted at finalization");

  const delAfter = await db.collection("accountDeletions").doc(host).get();
  assert.strictEqual(delAfter.exists, false, "accountDeletions row removed after settling");
});

test("K111-9 a paid event within 72h is cancelled+refunded now, settlement deferred", async () => {
  const host = `imminent_${nextId()}`;
  const buyer = `buyer_${nextId()}`;
  await tokenFor(host);
  await db.collection("users").doc(host).set({accountStatus: "pending_deletion"}, {merge: true});
  await db.collection("accountDeletions").doc(host).set({
    requestedBy: host, deletionScheduledAt: Timestamp.fromMillis(Date.now() - 1000),
  });
  const eventId = `evt_${nextId()}`;
  const pi = `pi_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: host, title: "Soon", price: 200, participantCount: 1,
    date: new Date(Date.now() + 24 * 3600000).toISOString(), // within the 72h window
    ownerPendingDeletion: true,
  });
  await db.collection("payments").doc(`pay_${nextId()}`).set({
    eventId, userId: buyer, status: "succeeded", paymentIntentId: pi, amount: 20000,
  });

  const s = mockStripe();
  s._setPi(pi, {status: "succeeded", amount: 20000, amount_refunded: 0, metadata: {eventPrice: "20000"}});

  const delDoc = await db.collection("accountDeletions").doc(host).get();
  const outcome = await settleOneAccountDeletion(delDoc, s);
  assert.strictEqual(outcome, "deferred");

  const eventAfter = await db.collection("events").doc(eventId).get();
  assert.strictEqual(eventAfter.data().status, "cancelled", "the imminent event is cancelled now");
  assert.strictEqual(s._calls.refunds.length, 1, "the attendee is refunded now");

  const userAfter = await db.collection("users").doc(host).get();
  assert.strictEqual(userAfter.exists, true, "the user doc must survive — settlement deferred");
  const delAfter = await db.collection("accountDeletions").doc(host).get();
  assert.strictEqual(delAfter.exists, true, "the accountDeletions row stays for the next cron cycle");
});

// ===========================================================================
// Piece 5 — cancelAccountDeletion / getAccountDeletionStatus
// ===========================================================================

test("K111-10 cancelAccountDeletion: restores the account and unmarks events", async () => {
  const uid = `undo_${nextId()}`;
  const idToken = await tokenFor(uid);
  await db.collection("users").doc(uid).set({
    accountStatus: "pending_deletion",
    deletionScheduledAt: Timestamp.fromMillis(Date.now() + 3600000),
  }, {merge: true});
  await db.collection("accountDeletions").doc(uid).set({
    requestedBy: uid, deletionScheduledAt: Timestamp.now(),
  });
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({creatorId: uid, title: "mine", ownerPendingDeletion: true});

  const res = await callFn("cancelAccountDeletion", {}, idToken);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.ok, true);

  const userAfter = await db.collection("users").doc(uid).get();
  assert.strictEqual(userAfter.data().accountStatus, undefined);
  assert.strictEqual(userAfter.data().deletionScheduledAt, undefined);

  const delAfter = await db.collection("accountDeletions").doc(uid).get();
  assert.strictEqual(delAfter.exists, false);

  const eventAfter = await db.collection("events").doc(eventId).get();
  assert.strictEqual(eventAfter.data().ownerPendingDeletion, undefined);
});

test("K111-11 cancelAccountDeletion: no pending deletion -> failed-precondition, nothing touched", async () => {
  const uid = `nopending_${nextId()}`;
  const idToken = await tokenFor(uid);
  const res = await callFn("cancelAccountDeletion", {}, idToken);
  assert.strictEqual(res.status, 400); // failed-precondition -> 400
  assert.match(JSON.stringify(res.body), /no_pending_deletion/);
});

test("K111-12 getAccountDeletionStatus: reflects the current accountStatus + deletionScheduledAt", async () => {
  const uid = `status_${nextId()}`;
  const idToken = await tokenFor(uid);
  const scheduledAt = Timestamp.fromMillis(Date.now() + 3600000);
  await db.collection("users").doc(uid).set({accountStatus: "pending_deletion", deletionScheduledAt: scheduledAt});

  const res = await callFn("getAccountDeletionStatus", {}, idToken);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.status, "pending_deletion");
  assert.ok(res.body.result.deletionScheduledAt);
});

// ===========================================================================
// Piece 9 — adminReleasePayout surfaces `reason` when the outcome stays held
// ===========================================================================

test("K111-13 adminReleasePayout: outcome 'held' surfaces the stuck reason", async () => {
  const hostUid = `host_${nextId()}`; // deliberately never given a users/{uid} doc
  const pi = `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, hostUid, hostAccountId: "acct_testhost",
    grossAmount: 27312, hostAmount: 25000, currency: "mxn",
    state: "held", frozen: false, hostPenaltyOwed: 0,
    releaseAt: new Date(Date.now() - 3600000).toISOString(),
    transferId: null, refundId: null,
  });
  const adminToken = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("adminReleasePayout", {paymentIntentId: pi}, adminToken);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.outcome, "held");
  assert.strictEqual(res.body.result.reason, "host_pending_deletion");
});
