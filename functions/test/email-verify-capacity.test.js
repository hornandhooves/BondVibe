/**
 * Integration tests for fix/email-verify-and-capacity, against the Firebase
 * Emulator Suite (functions + firestore + auth).
 *
 *   npm run test:payments   (runs everything under functions/test/)
 *
 * Two things under test:
 *   1. Email-verified enforcement — payment callables + activateHost reject a
 *      caller whose token says email_verified != true (browsing stays open).
 *   2. Oversell — paid joins (createEventPaymentIntent + the webhook) and
 *      membership joins (reserveMembershipCredit) enforce maxAttendees, which
 *      they skipped before.
 *
 * All assertions land before any Stripe network call (auth/capacity checks run
 * first; the webhook's constructEvent is local HMAC), so this runs in Stripe
 * TEST posture with dummy secrets and never makes a real charge.
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
const nextId = () => `t${Date.now()}_${uniq++}`;

/**
 * Emulator user with a chosen emailVerified state; returns its ID token.
 * @param {string} uid desired uid
 * @param {object} [opts] options
 * @param {boolean} [opts.verified] emailVerified state (default true)
 * @return {Promise<string>} the user's ID token
 */
async function tokenFor(uid, {verified = true} = {}) {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: verified});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: verified});
  }
  const r = await fetch(`${IDT}:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  }).then((x) => x.json());
  assert.ok(r.idToken, `no idToken for ${uid}: ${JSON.stringify(r)}`);
  return r.idToken;
}

const post = (path, body, token) =>
  fetch(`${FN}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

// ===========================================================================
// EMAIL-VERIFIED ENFORCEMENT
// ===========================================================================

test("EV1 createEventPaymentIntent (onRequest) rejects an unverified email", async () => {
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: `host_${nextId()}`, title: "X", price: 100, date: new Date(Date.now() + 864e5).toISOString(),
  });
  const token = await tokenFor(`buyer_${nextId()}`, {verified: false});
  const res = await post("createEventPaymentIntent", {eventId}, token);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, "email_not_verified");
});

test("EV2 verified caller passes the email gate (reaches business logic)", async () => {
  const token = await tokenFor(`buyer_${nextId()}`, {verified: true});
  // No event → 404, i.e. we got PAST the 403 email gate.
  const res = await post("createEventPaymentIntent", {eventId: `missing_${nextId()}`}, token);
  assert.notStrictEqual(res.status, 403);
  assert.strictEqual(res.status, 404);
});

test("EV3 activateHost (onCall) rejects an unverified email", async () => {
  const uid = `u_${nextId()}`;
  const token = await tokenFor(uid, {verified: false});
  await db.collection("users").doc(uid).set({role: "user"});
  const res = await post("activateHost", {data: {type: "free"}}, token);
  assert.strictEqual(res.status, 403); // permission-denied → 403
  assert.match(JSON.stringify(res.body), /email_not_verified/);
});

test("EV4 activateHost succeeds for a verified caller", async () => {
  const uid = `u_${nextId()}`;
  const token = await tokenFor(uid, {verified: true});
  await db.collection("users").doc(uid).set({role: "user"});
  const res = await post("activateHost", {data: {type: "free"}}, token);
  assert.strictEqual(res.status, 200);
  const after = (await db.collection("users").doc(uid).get()).data();
  assert.strictEqual(after.role, "host");
});

test("EV5 reserveMembershipCredit (onCall) rejects an unverified email", async () => {
  const token = await tokenFor(`u_${nextId()}`, {verified: false});
  const res = await post("reserveMembershipCredit", {data: {eventId: `e_${nextId()}`}}, token);
  assert.strictEqual(res.status, 403);
  assert.match(JSON.stringify(res.body), /email_not_verified/);
});

// ===========================================================================
// OVERSELL / CAPACITY
// ===========================================================================

test("CAP1 createEventPaymentIntent rejects a sold-out event (409) before charging", async () => {
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: `host_${nextId()}`, title: "Full", price: 250,
    maxAttendees: 1, attendees: ["someone_else"],
    date: new Date(Date.now() + 864e5).toISOString(),
  });
  const token = await tokenFor(`buyer_${nextId()}`, {verified: true});
  const res = await post("createEventPaymentIntent", {eventId}, token);
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.error, "event_full");
});

test("CAP2 reserveMembershipCredit rejects a sold-out event", async () => {
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: `host_${nextId()}`, title: "Full class", acceptsMembership: true,
    creditCost: 1, maxAttendees: 1, attendees: ["someone_else"],
    date: new Date(Date.now() + 864e5).toISOString(),
  });
  const token = await tokenFor(`u_${nextId()}`, {verified: true});
  const res = await post("reserveMembershipCredit", {data: {eventId}}, token);
  assert.strictEqual(res.status, 400); // failed-precondition → 400
  assert.match(JSON.stringify(res.body), /event_full/);
});

test("CAP3 paid-ticket webhook waitlists (does not oversell) when the event is full", async () => {
  const stripe = require("stripe")("sk_test_dummy_emulator_only");
  const eventId = `evt_${nextId()}`;
  const buyer = `buyer_${nextId()}`;
  const host = `host_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: host, title: "Sold out", attendees: ["already_in"],
    maxAttendees: 1, date: new Date(Date.now() + 864e5).toISOString(),
  });

  const payload = JSON.stringify({
    id: `evt_stripe_${nextId()}`, object: "event", type: "payment_intent.succeeded",
    data: {object: {
      id: `pi_${nextId()}`, object: "payment_intent", amount: 25000, currency: "mxn",
      metadata: {type: "event_ticket", eventId, eventTitle: "Sold out", userId: buyer, hostId: host},
    }},
  });
  const res = await fetch(`${FN}/stripePaymentWebhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": stripe.webhooks.generateTestHeaderString({payload, secret: WEBHOOK_SECRET}),
    },
    body: payload,
  });
  assert.strictEqual(res.status, 200);

  const e = (await db.collection("events").doc(eventId).get()).data();
  // Attendees NOT oversold past capacity…
  assert.deepStrictEqual(e.attendees, ["already_in"]);
  // …the paid buyer is waitlisted instead.
  assert.ok(Array.isArray(e.waitlist) && e.waitlist.includes(buyer),
    `expected ${buyer} on waitlist, got ${JSON.stringify(e.waitlist)}`);
});

test("CAP4 paid-ticket webhook adds the attendee when there IS room", async () => {
  const stripe = require("stripe")("sk_test_dummy_emulator_only");
  const eventId = `evt_${nextId()}`;
  const buyer = `buyer_${nextId()}`;
  const host = `host_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: host, title: "Open", attendees: [],
    maxAttendees: 10, date: new Date(Date.now() + 864e5).toISOString(),
  });

  const payload = JSON.stringify({
    id: `evt_stripe_${nextId()}`, object: "event", type: "payment_intent.succeeded",
    data: {object: {
      id: `pi_${nextId()}`, object: "payment_intent", amount: 25000, currency: "mxn",
      metadata: {type: "event_ticket", eventId, eventTitle: "Open", userId: buyer, hostId: host},
    }},
  });
  const res = await fetch(`${FN}/stripePaymentWebhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": stripe.webhooks.generateTestHeaderString({payload, secret: WEBHOOK_SECRET}),
    },
    body: payload,
  });
  assert.strictEqual(res.status, 200);
  const e = (await db.collection("events").doc(eventId).get()).data();
  assert.ok(e.attendees.includes(buyer), "buyer should be an attendee");
});
