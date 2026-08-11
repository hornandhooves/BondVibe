/**
 * KIN-212 — a membership credit must not be spendable on an event that ended
 * or was cancelled.
 *
 *   npm run test:payments
 *
 * Three ways into an event, and this was the last one still open. joinEvent
 * always refused both cases; createEventPaymentIntent got the same guard in
 * KIN-211. Until this, a member could still burn a credit on something that
 * already happened — cheaper than the paid path's failure mode, but the same
 * bug, and the member loses the credit for nothing.
 *
 * reserveMembershipCredit is onCall, so rejections arrive as
 * failed-precondition rather than an HTTP status.
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

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();

let uniq = 0;
/** @return {string} a collision-free suffix for seeded ids */
const nextId = () => `k212_${Date.now()}_${uniq++}`;

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
  assert.ok(r.idToken, `no idToken for ${uid}`);
  return r.idToken;
}

/**
 * Call an onCall function the way the SDK does (body wrapped in `data`).
 * @param {string} name function name
 * @param {object} data payload
 * @param {string} token ID token
 * @return {Promise<object>} status + parsed body
 */
const call = (name, data, token) =>
  fetch(`${FN}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({data}),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

/**
 * Seed an event that accepts memberships. Only the field under test differs
 * from a perfectly valid event, so a rejection can't come from anywhere else.
 * @param {object} over fields to override
 * @return {Promise<string>} the event id
 */
async function seedEvent(over = {}) {
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    title: "Clase con membresía",
    price: 0,
    creatorId: `host_${nextId()}`,
    participantCount: 0,
    maxAttendees: 10,
    status: "active",
    acceptsMembership: true,
    creditCost: 1,
    date: new Date(Date.now() + 864e5).toISOString(),
    ...over,
  });
  return eventId;
}

/**
 * @param {object} r a call() result
 * @return {string} the error message
 */
const msg = (r) => (r.body && r.body.error && r.body.error.message) || "";

test("K212-1 a finished event cannot be redeemed with a credit", async () => {
  const token = await tokenFor(`mem_${nextId()}`);
  const eventId = await seedEvent({date: new Date(Date.now() - 864e5).toISOString()});

  const r = await call("reserveMembershipCredit", {eventId}, token);
  assert.strictEqual(r.status, 400, `expected a rejection, got ${JSON.stringify(r)}`);
  assert.match(msg(r), /already happened/i);
});

test("K212-2 a cancelled event cannot be redeemed with a credit", async () => {
  const token = await tokenFor(`mem_${nextId()}`);
  const eventId = await seedEvent({status: "cancelled"});

  const r = await call("reserveMembershipCredit", {eventId}, token);
  assert.strictEqual(r.status, 400, `expected a rejection, got ${JSON.stringify(r)}`);
  assert.match(msg(r), /cancelled/i);
});

test("K212-3 an upcoming active event is NOT rejected by these two guards", async () => {
  // The guard must not become a wall. This event has no membership behind it,
  // so it fails later for a different reason — what matters is that it is not
  // one of ours.
  const token = await tokenFor(`mem_${nextId()}`);
  const eventId = await seedEvent();

  const r = await call("reserveMembershipCredit", {eventId}, token);
  assert.doesNotMatch(
    msg(r),
    /already happened|cancelled/i,
    `an upcoming active event was wrongly rejected: ${JSON.stringify(r.body)}`,
  );
});
