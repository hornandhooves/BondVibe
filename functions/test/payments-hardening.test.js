/**
 * Integration tests for fix/payments-hardening, run against the Firebase
 * Emulator Suite (functions + firestore + auth).
 *
 *   npm run test:payments
 *
 * Stripe/MP note: every assertion here lands BEFORE any Stripe network call —
 * the 401/403 checks run before paymentIntents.create, reserveMembershipCredit
 * touches only Firestore, and Stripe's constructEvent is local HMAC. So these
 * run in Stripe TEST posture with dummy secrets (functions/.secret.local) and
 * never create a real charge. Nothing here exercises refunds: memberships and
 * packages are immediate, non-refundable purchases per T&C.
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
  // emailVerified:true — payment callables now require a verified email
  // (fix/email-verify-and-capacity); these tests exercise the auth-from-token
  // and capacity logic, not the email gate, so their users must be verified.
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

// ===========================================================================
// FIX 1 — createMembershipPaymentIntent / createPromotionPaymentIntent:
// verifyBearer + identity derived from the token, never from the body.
// ===========================================================================

test("F1a createMembershipPaymentIntent rejects an unauthenticated caller", async () => {
  // Pre-fix this endpoint had NO auth: this exact request minted a real
  // PaymentIntent whose metadata.userId decided who got the membership.
  const res = await post("createMembershipPaymentIntent", {
    planId: "any-plan",
    userId: "victim-uid",
  });
  assert.strictEqual(res.status, 401);
  assert.strictEqual((await res.json()).error, "unauthenticated");
});

test("F1b createPromotionPaymentIntent rejects an unauthenticated caller", async () => {
  const res = await post("createPromotionPaymentIntent", {
    eventId: "any-event",
    planId: "feat_7",
    userId: "victim-uid",
  });
  assert.strictEqual(res.status, 401);
  assert.strictEqual((await res.json()).error, "unauthenticated");
});

test("F1c membership: a body userId is ignored — identity comes from the token", async () => {
  const buyer = `buyer_${nextId()}`;
  const idToken = await tokenFor(buyer);

  // Body carries NO userId at all. Pre-fix this returned 400 "Missing required
  // fields" because identity was read from the body; now the token supplies it,
  // so we get past validation and fail later on the (absent) plan instead.
  const res = await post(
    "createMembershipPaymentIntent",
    {planId: `missing_${nextId()}`},
    {Authorization: `Bearer ${idToken}`},
  );
  assert.notStrictEqual(res.status, 401);
  assert.notStrictEqual(res.status, 400);
  assert.strictEqual(res.status, 404, "should reach the plan lookup");
  assert.strictEqual((await res.json()).error, "Plan not found");
});

test("F1d promotion: the host check now keys off the TOKEN, not the body", async () => {
  // The sharpest proof of the identity fix and it needs no Stripe call.
  // The endpoint allows only the event's own host to promote it. Pre-fix that
  // compared the creator against a body-supplied userId, so an attacker simply
  // sent the victim's uid and sailed past. Now the comparison uses the token.
  const host = `host_${nextId()}`;
  const attacker = `attacker_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: host,
    title: "Clase de yoga",
    date: new Date(Date.now() + 864e5).toISOString(),
  });

  const attackerToken = await tokenFor(attacker);
  const res = await post(
    "createPromotionPaymentIntent",
    // The pre-fix bypass verbatim: claim to be the host in the body.
    {eventId, planId: "feat_7", userId: host},
    {Authorization: `Bearer ${attackerToken}`},
  );
  assert.strictEqual(res.status, 403);
  assert.match((await res.json()).error, /Only the host/i);
});

// ===========================================================================
// FIX 2 — reserveMembershipCredit: check + hold in one transaction.
// ===========================================================================

test("F2 concurrent RSVPs cannot over-book a 1-credit membership", async () => {
  const user = `member_${nextId()}`;
  const host = `host_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const membershipId = `mem_${nextId()}`;
  const idToken = await tokenFor(user);

  await db.collection("events").doc(eventId).set({
    creatorId: host,
    title: "Clase con créditos",
    acceptsMembership: true,
    creditCost: 1,
    date: new Date(Date.now() + 864e5).toISOString(),
  });
  await db.collection("memberships").doc(membershipId).set({
    userId: user,
    hostId: host,
    type: "credits",
    status: "active",
    creditsRemaining: 1, // exactly one credit
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 864e5),
  });

  // Fire the same RSVP concurrently. Read-then-write let each call observe
  // "0 holds, 1 credit" and all of them reserve; the transaction serialises it.
  const CONCURRENCY = 6;
  const results = await Promise.all(
    Array.from({length: CONCURRENCY}, () =>
      post(
        "reserveMembershipCredit",
        {data: {eventId}},
        {Authorization: `Bearer ${idToken}`},
      ).then(async (r) => ({status: r.status, body: await r.json()})),
    ),
  );

  const holds = await db
    .collection("membershipReservations")
    .where("membershipId", "==", membershipId)
    .where("status", "==", "reserved")
    .get();

  assert.strictEqual(
    holds.size,
    1,
    `expected exactly 1 hold for 1 credit, got ${holds.size} ` +
      `(statuses: ${results.map((r) => r.status).join(",")})`,
  );

  // Whatever the interleaving, no call may report a *new* distinct reservation
  // beyond the single winner — the rest either lose or report alreadyReserved.
  const ids = new Set(
    results
      .map((r) => r.body && r.body.result && r.body.result.reservationId)
      .filter(Boolean),
  );
  assert.ok(ids.size <= 1, `multiple distinct reservations handed out: ${[...ids]}`);
});

// ===========================================================================
// FIX 3 — handleEventTicketPurchase idempotency guard.
// ===========================================================================

test("F3 a replayed event-ticket webhook does not clobber the payment record", async () => {
  const stripe = require("stripe")("sk_test_dummy_emulator_only");
  const userId = `buyer_${nextId()}`;
  const hostId = `host_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const paymentIntentId = `pi_${nextId()}`;

  await db.collection("events").doc(eventId).set({
    creatorId: hostId,
    title: "Concierto",
    attendees: [],
    date: new Date(Date.now() + 864e5).toISOString(),
  });

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
        metadata: {type: "event_ticket", eventId, eventTitle: "Concierto", userId, hostId},
      },
    },
  });
  const sign = () =>
    stripe.webhooks.generateTestHeaderString({payload, secret: WEBHOOK_SECRET});

  // First delivery — processes normally.
  const first = await fetch(`${FN}/stripePaymentWebhook`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "stripe-signature": sign()},
    body: payload,
  });
  assert.strictEqual(first.status, 200);

  const afterFirst = await db.collection("payments").doc(paymentIntentId).get();
  assert.ok(afterFirst.exists, "first delivery should record the payment");
  assert.strictEqual(afterFirst.data().status, "succeeded");

  // Simulate later state on the payment doc (a refund/dispute recorded by ops).
  // Pre-fix the retry's blind .set() stamped this straight back to "succeeded".
  await db
    .collection("payments")
    .doc(paymentIntentId)
    .set({status: "refunded", refundedBy: "ops"}, {merge: true});

  // Stripe retries the same event (slow endpoint / non-2xx / at-least-once).
  const replay = await fetch(`${FN}/stripePaymentWebhook`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "stripe-signature": sign()},
    body: payload,
  });
  assert.strictEqual(replay.status, 200);

  const afterReplay = await db.collection("payments").doc(paymentIntentId).get();
  assert.strictEqual(
    afterReplay.data().status,
    "refunded",
    "replay must not resurrect status: succeeded",
  );
  assert.strictEqual(afterReplay.data().refundedBy, "ops");
});
