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

// EV3/EV4 (activateHost email gate) were removed with feat/host-approval-gate:
// activateHost is now ADMIN-ONLY, so a normal caller is rejected by the admin
// gate before any email check. Coverage moved to functions/test/host-approval.
// test.js — HA-e (normal user → permission-denied), HA-e2 (admin → success), and
// the email invariant now lives on the host GRANT (approveHostRequest rejects an
// unverified applicant: HA-f) which is the only path to role:"host".

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
  // ROSTER: capacity is participantCount (source of truth), not the array.
  await db.collection("events").doc(eventId).set({
    creatorId: `host_${nextId()}`, title: "Full", price: 250,
    maxAttendees: 1, participantCount: 1,
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
    creditCost: 1, maxAttendees: 1, participantCount: 1,
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
    creatorId: host, title: "Sold out", maxAttendees: 1, participantCount: 1,
    date: new Date(Date.now() + 864e5).toISOString(),
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
  // participantCount NOT oversold past capacity…
  assert.strictEqual(e.participantCount, 1);
  // …the paid buyer is waitlisted in the roster instead (no active spot taken).
  const r = (await db.collection("events").doc(eventId)
    .collection("roster").doc(buyer).get()).data();
  assert.ok(r && r.status === "waitlist",
    `expected ${buyer} waitlisted, got ${JSON.stringify(r)}`);
});

test("CAP4 paid-ticket webhook adds the attendee when there IS room", async () => {
  const stripe = require("stripe")("sk_test_dummy_emulator_only");
  const eventId = `evt_${nextId()}`;
  const buyer = `buyer_${nextId()}`;
  const host = `host_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: host, title: "Open", maxAttendees: 10, participantCount: 0,
    date: new Date(Date.now() + 864e5).toISOString(),
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
  assert.strictEqual(e.participantCount, 1, "participantCount incremented");
  const r = (await db.collection("events").doc(eventId)
    .collection("roster").doc(buyer).get()).data();
  assert.ok(r && r.status === "active", "buyer should be an active roster member");
});
