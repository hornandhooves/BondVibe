/**
 * KIN-108 phase 1 — deleteUserAccount must reject (409 obligations_open)
 * when the account has any open financial obligation, instead of purging the
 * event/rental/membership/gift docs a paying attendee/renter/member depends
 * on for a refund or redemption.
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

const deleteAccount = (idToken) =>
  fetch(`${FN}/deleteUserAccount`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": `Bearer ${idToken}`},
    body: JSON.stringify({}),
  });

test("DA1 a future paid event with a held ledger row blocks deletion (exact ticket scenario)", async () => {
  const host = `host_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const paymentIntentId = `pi_${nextId()}`;
  const idToken = await tokenFor(host);

  await db.collection("events").doc(eventId).set({
    creatorId: host,
    title: "Clase pagada",
    price: 250,
    participantCount: 1,
    date: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  await db.collection("paymentLedger").doc(paymentIntentId).set({
    paymentIntentId,
    type: "event_ticket",
    sourceId: eventId,
    hostUid: host,
    buyerUid: `buyer_${nextId()}`,
    state: "held",
    grossAmount: 25000,
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 409);
  const body = await res.json();
  assert.strictEqual(body.error, "obligations_open");
  assert.ok(body.details.heldLedger >= 1, "should report at least one held ledger row");

  const eventAfter = await db.collection("events").doc(eventId).get();
  assert.strictEqual(eventAfter.exists, true, "event must survive the rejected delete");
});

test("DA2 an active rental blocks deletion", async () => {
  const host = `host_${nextId()}`;
  const rentalId = `rental_${nextId()}`;
  const idToken = await tokenFor(host);

  await db.collection("rentals").doc(rentalId).set({
    ownerId: host,
    renterId: `renter_${nextId()}`,
    status: "active",
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 409);
  const body = await res.json();
  assert.strictEqual(body.error, "obligations_open");
  assert.ok(body.details.activeRentals >= 1);
});

test("DA3 a still-valid sold membership blocks deletion", async () => {
  const host = `host_${nextId()}`;
  const membershipId = `mem_${nextId()}`;
  const idToken = await tokenFor(host);

  await db.collection("memberships").doc(membershipId).set({
    userId: `member_${nextId()}`,
    hostId: host,
    status: "active",
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 864e5),
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 409);
  const body = await res.json();
  assert.strictEqual(body.error, "obligations_open");
  assert.ok(body.details.activeMemberships >= 1);
});

test("DA4 an unredeemed (held) gift blocks deletion", async () => {
  const host = `host_${nextId()}`;
  const paymentIntentId = `pi_gift_${nextId()}`;
  const idToken = await tokenFor(host);

  await db.collection("giftLedger").doc(paymentIntentId).set({
    paymentIntentId,
    type: "gift",
    hostUid: host,
    gifterId: `gifter_${nextId()}`,
    recipientId: `recipient_${nextId()}`,
    state: "held",
    redeemed: false,
    grossAmount: 15000,
  });

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 409);
  const body = await res.json();
  assert.strictEqual(body.error, "obligations_open");
  assert.ok(body.details.heldGifts >= 1);
});

test("DA5 an account with no open obligations still deletes normally", async () => {
  const user = `clean_${nextId()}`;
  const idToken = await tokenFor(user);
  await db.collection("users").doc(user).set({fullName: "Clean User"});

  const res = await deleteAccount(idToken);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.success, true);

  const userAfter = await db.collection("users").doc(user).get();
  assert.strictEqual(userAfter.exists, false);
});
