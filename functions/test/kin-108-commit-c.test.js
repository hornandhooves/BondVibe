/**
 * KIN-108 Commit C — deleteUserAccount stops destroying money-adjacent
 * evidence on self-delete (events, paymentLedger-linked data), and
 * releaseOnePayout stops paying out a host who no longer exists or is
 * mid-deletion. Neither commit moves any money — that's the settlement
 * queue, KIN-108's third PR.
 *
 *   npm run test:payments
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");
const escrow = require("../stripe/escrow");
const {selfDeleteGate} = require("../index");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const IDT = `http://127.0.0.1:${
  process.env.FIREBASE_AUTH_EMULATOR_HOST.split(":")[1]
}/identitytoolkit.googleapis.com/v1/accounts`;

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
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

const deleteAccount = (idToken) =>
  fetch(`${FN}/deleteUserAccount`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": `Bearer ${idToken}`},
    body: JSON.stringify({}),
  });

const mockStripe = () => {
  const calls = {transfers: []};
  return {
    _calls: calls,
    transfers: {
      create: async (params, opts) => {
        calls.transfers.push({params, opts});
        return {id: "tr_" + nextId()};
      },
    },
  };
};

test("AD1 self-delete: event survives with ownerPendingDeletion, roster/participantCount untouched", async () => {
  const host = `host_${nextId()}`;
  const buyer = `buyer_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const idToken = await tokenFor(host);

  await db.collection("events").doc(eventId).set({
    creatorId: host, title: "Paid event with a real attendee",
    price: 200, participantCount: 1,
    date: new Date(Date.now() + 5 * 864e5).toISOString(),
  });
  await db.collection("events").doc(eventId).collection("roster").doc(buyer).set({
    uid: buyer, eventId, status: "active",
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: host, state: "held", grossAmount: 20000,
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 200);

  const eventAfter = await db.collection("events").doc(eventId).get();
  assert.strictEqual(eventAfter.exists, true, "event must survive a self-delete");
  assert.strictEqual(eventAfter.data().ownerPendingDeletion, true);
  assert.strictEqual(eventAfter.data().participantCount, 1, "participantCount must not decrement");

  const rosterAfter = await db.collection("events").doc(eventId)
    .collection("roster").doc(buyer).get();
  assert.strictEqual(rosterAfter.exists, true);
  assert.strictEqual(rosterAfter.data().uid, buyer);
  assert.strictEqual(rosterAfter.data().status, "active");
});

test("AD2 self-delete writes accountStatus=pending_deletion + a complete accountDeletions preview", async () => {
  const host = `host_${nextId()}`;
  const idToken = await tokenFor(host);
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: host, state: "held", grossAmount: 20000,
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.accountStatus, "pending_deletion");
  assert.ok(body.deletionScheduledAt);

  const userAfter = await db.collection("users").doc(host).get();
  assert.strictEqual(userAfter.exists, true, "the user doc must survive a self-delete");
  assert.strictEqual(userAfter.data().accountStatus, "pending_deletion");
  assert.ok(userAfter.data().deletionScheduledAt);

  const deletionDoc = await db.collection("accountDeletions").doc(host).get();
  assert.strictEqual(deletionDoc.exists, true);
  const d = deletionDoc.data();
  assert.strictEqual(d.requestedBy, host);
  assert.ok(d.deletionScheduledAt);
  assert.strictEqual(d.preview.complete, true);
  assert.strictEqual(d.preview.pendingSettlement.count, 1);
});

test("AD3 releaseOnePayout: host in pending_deletion -> stays held, zero Stripe transfer calls", async () => {
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
  const ledgerSnap = await db.collection("paymentLedger").doc(pi).get();
  const outcome = await escrow.releaseOnePayout(s, db, ledgerSnap);

  assert.strictEqual(outcome, "held");
  assert.strictEqual(s._calls.transfers.length, 0, "must never call Stripe for a pending_deletion host");
  const after = await db.collection("paymentLedger").doc(pi).get();
  assert.strictEqual(after.data().state, "held");
});

test("AD4 releaseOnePayout: host's users doc is GONE entirely -> stays held, zero Stripe transfer calls", async () => {
  const hostUid = `host_${nextId()}`; // deliberately never created
  const pi = `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, hostUid, hostAccountId: "acct_testhost",
    grossAmount: 27312, hostAmount: 25000, currency: "mxn",
    state: "held", frozen: false, hostPenaltyOwed: 0,
    releaseAt: new Date(Date.now() - 3600000).toISOString(),
    transferId: null, refundId: null,
  });

  const s = mockStripe();
  const ledgerSnap = await db.collection("paymentLedger").doc(pi).get();
  const outcome = await escrow.releaseOnePayout(s, db, ledgerSnap);

  assert.strictEqual(outcome, "held");
  assert.strictEqual(s._calls.transfers.length, 0, "must never call Stripe for a nonexistent host");
  const after = await db.collection("paymentLedger").doc(pi).get();
  assert.strictEqual(after.data().state, "held");
});

test("AD5 selfDeleteGate aborts (writes nothing) when a preview category is unavailable", async () => {
  const host = `host_${nextId()}`;

  // Force ONLY "rentals" to reject, mirroring PDI12's fake-db technique
  // (functions/test/kin-108-deletion-preview.test.js) — the emulator never
  // produces a real Firestore index failure, so this is the only honest way
  // to exercise the abort path.
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

  const gate = await selfDeleteGate(fakeDb, host, host);
  assert.strictEqual(gate.aborted, true);
  assert.strictEqual(gate.reason, "impact_preview_unavailable");
  assert.strictEqual(gate.category, "activeRentals");

  // Nothing must have been written — verified against the REAL db, not the fake.
  const userAfter = await db.collection("users").doc(host).get();
  assert.strictEqual(userAfter.exists, false, "no user doc should have been created/touched at all");
  const deletionDoc = await db.collection("accountDeletions").doc(host).get();
  assert.strictEqual(deletionDoc.exists, false, "accountDeletions/{uid} must not be created");
});

test("AD6 KIN-111 Piece 2: even a moneyless self-delete no longer purges steps 2-9b synchronously", async () => {
  // Superseded by KIN-111: steps 2-9b (posts/notifications/ratings/etc.) used
  // to run unconditionally for both admin and self-delete — this test used to
  // assert they purged immediately even for a user with no money attached.
  // KIN-111 Piece 2 defers ALL of steps 2-9b to settleAccountDeletions
  // (see kin-111-settlement-queue.test.js), regardless of whether money is
  // involved — a self-delete's undo window must mean nothing is purged yet.
  const user = `clean_${nextId()}`;
  const idToken = await tokenFor(user);
  await db.collection("posts").doc(`post_${nextId()}`).set({authorId: user, text: "hi"});
  await db.collection("notifications").doc(`notif_${nextId()}`).set({userId: user, type: "test"});
  await db.collection("ratings").doc(`rating_${nextId()}`).set({raterId: user, stars: 5});

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.deletedData.posts, undefined, "posts purge deferred, not run inline");
  assert.strictEqual(body.deletedData.notifications, undefined);
  assert.strictEqual(body.deletedData.ratings, undefined);

  const postsAfter = await db.collection("posts").where("authorId", "==", user).get();
  assert.strictEqual(postsAfter.size, 1, "post survives until settlement finalizes the account");
});

test("AD7 self-delete: users doc, Auth account, and Storage step all survive (nothing irreversible)", async () => {
  const host = `host_${nextId()}`;
  const idToken = await tokenFor(host);
  await db.collection("paymentLedger").doc(`pi_${nextId()}`).set({
    hostUid: host, state: "held", grossAmount: 20000,
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  const userAfter = await db.collection("users").doc(host).get();
  assert.strictEqual(userAfter.exists, true, "users/{uid} must survive");

  const authAfter = await admin.auth().getUser(host); // throws if deleted
  assert.strictEqual(authAfter.uid, host, "Firebase Auth account must survive (tokens revoked, not deleted)");

  // Storage: no Storage emulator is wired into this harness (calls would hit
  // the real kinlo-app-dev bucket), so rather than upload a real file to
  // production storage just to check it survives, assert the storage-delete
  // step never ran at all for a self-delete — `storageFiles` only appears
  // in deletedData on the admin (full-purge) path.
  assert.strictEqual(body.deletedData.storageFiles, undefined, "the storage-delete step must not run");
});
