/**
 * KIN-211 — a finished or cancelled event must be rejected BEFORE the
 * PaymentIntent exists.
 *
 *   npm run test:payments
 *
 * The client hid its main CTA for past events but a second entry point (the
 * Reserve button inside the locked-location card) did not, and this function
 * validated neither date nor status — so a real QA payment reached the card
 * form for an event that had ended 12 hours earlier. Only the crash in
 * CardField stopped the charge from going through.
 *
 * joinEvent (the free path) has always had both checks, which is why only paid
 * joins were exposed. These tests pin the paid path to the same behaviour.
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
const nextId = () => `k211_${Date.now()}_${uniq++}`;

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

const post = (path, body, headers = {}) =>
  fetch(`${FN}/${path}`, {
    method: "POST",
    headers: {"Content-Type": "application/json", ...headers},
    body: JSON.stringify(body),
  });

/**
 * Seed a payable event. Everything is valid except what a test overrides, so a
 * rejection can only come from the field under test — not from a missing host
 * or a full roster.
 * @param {object} over fields to override
 * @return {Promise<string>} the event id
 */
async function seedEvent(over = {}) {
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    title: "Evento de prueba",
    price: 250,
    creatorId: `host_${nextId()}`,
    participantCount: 0,
    maxAttendees: 10,
    status: "active",
    date: new Date(Date.now() + 864e5).toISOString(),
    ...over,
  });
  return eventId;
}

test("K211-1 an event that already happened is rejected before charging", async () => {
  const idToken = await tokenFor(`buyer_${nextId()}`);
  // Yesterday — the shape of the event that was still payable in QA.
  const eventId = await seedEvent({date: new Date(Date.now() - 864e5).toISOString()});

  const res = await post("createEventPaymentIntent", {eventId}, {Authorization: `Bearer ${idToken}`});
  assert.strictEqual(res.status, 409);
  assert.strictEqual((await res.json()).error, "event_ended");
});

test("K211-2 a cancelled event is rejected before charging", async () => {
  const idToken = await tokenFor(`buyer_${nextId()}`);
  const eventId = await seedEvent({status: "cancelled"});

  const res = await post("createEventPaymentIntent", {eventId}, {Authorization: `Bearer ${idToken}`});
  assert.strictEqual(res.status, 409);
  assert.strictEqual((await res.json()).error, "event_cancelled");
});

test("K211-3 a cancelled event that is ALSO in the past reports the cancellation", async () => {
  // Order matters for the message the buyer sees: "this was called off" is more
  // informative than "this is over".
  const idToken = await tokenFor(`buyer_${nextId()}`);
  const eventId = await seedEvent({
    status: "cancelled",
    date: new Date(Date.now() - 864e5).toISOString(),
  });

  const res = await post("createEventPaymentIntent", {eventId}, {Authorization: `Bearer ${idToken}`});
  assert.strictEqual(res.status, 409);
  assert.strictEqual((await res.json()).error, "event_cancelled");
});

test("K211-4 an upcoming active event still gets past these guards", async () => {
  // The guard must not become a wall: a normal event has to reach the later
  // stages. It fails on Stripe keys in the emulator, but NOT with our codes —
  // which is what proves the rejection above was about date/status.
  const idToken = await tokenFor(`buyer_${nextId()}`);
  const eventId = await seedEvent();

  const res = await post("createEventPaymentIntent", {eventId}, {Authorization: `Bearer ${idToken}`});
  const body = await res.json().catch(() => ({}));
  assert.ok(
    !["event_ended", "event_cancelled"].includes(body.error),
    `an upcoming active event was wrongly rejected: ${JSON.stringify(body)}`,
  );
});
