/**
 * KIN-107 — an event with no resolvable host (no businessOwnerUid,
 * creatorId, createdBy, or hostId) must be rejected BEFORE the PaymentIntent
 * is created, and a payment_intent.succeeded that still lands with missing
 * event_ticket metadata must be parked for review instead of retried forever.
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
const WEBHOOK_SECRET = "whsec_dummy_emulator_only";

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

const post = (path, body, headers = {}) =>
  fetch(`${FN}/${path}`, {
    method: "POST",
    headers: {"Content-Type": "application/json", ...headers},
    body: JSON.stringify(body),
  });

test("HU1 an event with no resolvable host is rejected before charging", async () => {
  const buyer = `buyer_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const idToken = await tokenFor(buyer);

  // Deliberately no businessOwnerUid, creatorId, createdBy, or hostId.
  await db.collection("events").doc(eventId).set({
    title: "Evento huérfano",
    price: 250,
    date: new Date(Date.now() + 864e5).toISOString(),
  });

  const res = await post(
    "createEventPaymentIntent",
    {eventId},
    {Authorization: `Bearer ${idToken}`},
  );
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).error, "host_unresolved");
});

test("HU2 a payment_intent.succeeded with missing event_ticket metadata is parked, not retried", async () => {
  const stripe = require("stripe")("sk_test_dummy_emulator_only");
  const paymentIntentId = `pi_${nextId()}`;

  const payload = JSON.stringify({
    id: `evt_stripe_${nextId()}`,
    object: "event",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: paymentIntentId,
        object: "payment_intent",
        amount: 25000,
        currency: "mxn",
        // type: event_ticket but missing hostId (e.g. a pre-KIN-107 orphaned
        // event whose ticket was bought before this guard existed).
        metadata: {type: "event_ticket", eventId: `evt_${nextId()}`, userId: `u_${nextId()}`},
      },
    },
  });
  const sig = stripe.webhooks.generateTestHeaderString({payload, secret: WEBHOOK_SECRET});

  const res = await fetch(`${FN}/stripePaymentWebhook`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "stripe-signature": sig},
    body: payload,
  });

  // 200, not 500 — Stripe must stop retrying this.
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).handled, true);

  const review = await db.collection("paymentsNeedingReview").doc(paymentIntentId).get();
  assert.ok(review.exists, "missing-metadata payment should be parked for review");
  assert.strictEqual(review.data().reason, "missing_required_metadata");
  assert.strictEqual(review.data().paymentIntent.id, paymentIntentId);

  // And it must NOT have been recorded as a normal succeeded payment.
  const payment = await db.collection("payments").doc(paymentIntentId).get();
  assert.strictEqual(payment.exists, false);
});
