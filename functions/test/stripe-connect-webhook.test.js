/**
 * KIN-10 — stripeConnectWebhook now verifies against its own bound secret
 * (STRIPE_WEBHOOK_SECRET_CONNECT) instead of process.env.STRIPE_WEBHOOK_SECRET,
 * which was never set in any deployed environment (the secret always bound to
 * paymentWebhook.js's STRIPE_WEBHOOK_SECRET_PAYMENTS, not this one). Run
 * against the Firebase Emulator Suite:
 *
 *   npm run test:payments
 *
 * Local dummy value lives in functions/.secret.local (gitignored).
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const WEBHOOK_SECRET = "whsec_dummy_connect_emulator_only";

admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();

let uniq = 0;
/** @return {string} a collision-free suffix for seeded ids */
const nextId = () => `t${Date.now()}_${uniq++}`;

test("account.updated passes constructEvent and syncs the matching user", async () => {
  const stripe = require("stripe")("sk_test_dummy_emulator_only");
  const userId = `host_${nextId()}`;
  const accountId = `acct_${nextId()}`;

  await db.collection("users").doc(userId).set({
    stripeConnect: {accountId, status: "pending"},
  });

  const payload = JSON.stringify({
    id: `evt_stripe_${nextId()}`,
    object: "event",
    type: "account.updated",
    data: {
      object: {
        id: accountId,
        object: "account",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
    },
  });
  const sig = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });

  const res = await fetch(`${FN}/stripeConnectWebhook`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "stripe-signature": sig},
    body: payload,
  });

  assert.strictEqual(res.status, 200, "constructEvent should not reject a correctly-signed event");
  assert.deepStrictEqual(await res.json(), {received: true});

  const after = await db.collection("users").doc(userId).get();
  assert.strictEqual(after.data().stripeConnect.status, "active");
  assert.strictEqual(after.data().hostConfig.canCreatePaidEvents, true);
});

test("a bad signature is rejected before touching Firestore", async () => {
  const payload = JSON.stringify({
    id: `evt_stripe_${nextId()}`,
    object: "event",
    type: "account.updated",
    data: {object: {id: `acct_${nextId()}`, object: "account"}},
  });

  const res = await fetch(`${FN}/stripeConnectWebhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "t=1,v1=deadbeef",
    },
    body: payload,
  });

  assert.strictEqual(res.status, 400);
});
