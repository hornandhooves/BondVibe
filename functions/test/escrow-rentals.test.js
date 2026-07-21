/**
 * Escrow B3 tests — rentals + slot service bookings + tips
 * (feat/payments-escrow-rentals · docs/DISENO_escrow_rentas.md §8).
 * Run: npm run test:payments (node --test vs the emulator suite).
 *
 * B3 extends the event escrow (#45) to two more sources. The mechanics
 * (ledger, cron, refunds) are REUSED from functions/stripe/escrow.js +
 * refunds.js; these tests exercise the DELTAS:
 *   - capture writes a generalized HELD ledger for `rental` / `service_booking`,
 *     reading amounts from the DOC (not the PI metadata), with a non-null
 *     releaseAt parsed from the ISO deliveryEndAt (§4 — NOT eventEndAtMs).
 *   - the +retention math generalizes to the new sources (writeHeldLedger).
 *   - the ledger-aware refund path (refunds.processRefund) works for a rental in
 *     `held` (refund, no reversal) and in `released` (reversal + refund).
 * The real-Stripe PI shapes (no transfer_data + transfer_group) and the tip
 * on_behalf_of chargeback routing (§6) are covered by escrow-rentals-live.mjs,
 * run against real test keys.
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

// Init the app BEFORE requiring refunds.js — it calls admin.firestore() at
// module load, which throws if the default app doesn't exist yet.
if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const escrow = require("../stripe/escrow");
const {processRefund} = require("../stripe/refunds");

const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const WEBHOOK_SECRET = "whsec_dummy_emulator_only";

const db = admin.firestore();

let uniq = 0;
const nextId = () => `escr${Date.now()}_${uniq++}`;
const HOUR = 3600000;

const getLedger = async (id) =>
  (await db.collection("paymentLedger").doc(id).get()).data();

// Deliver a signed Stripe webhook to the emulator function (local HMAC).
const sendWebhook = async (type, object) => {
  const stripe = require("stripe")("sk_test_dummy_emulator_only");
  const payload = JSON.stringify({
    id: "evt_" + nextId(), object: "event", type, data: {object},
  });
  const sig = stripe.webhooks.generateTestHeaderString({
    payload, secret: WEBHOOK_SECRET,
  });
  const r = await fetch(`${FN}/stripePaymentWebhook`, {
    method: "POST",
    headers: {"Content-Type": "application/json", "stripe-signature": sig},
    body: payload,
  });
  return r.status;
};

/**
 * A mock Stripe for the REFUND path: retrieve returns a fixed PI, and refund /
 * reversal calls are recorded so the ledger-aware branching is observable.
 * @param {object} pi the PaymentIntent retrieve() should return
 * @return {object} a stripe-shaped stub with a `_calls` recorder
 */
const refundMock = (pi) => {
  const calls = {refunds: [], reversals: [], retrieves: []};
  return {
    _calls: calls,
    paymentIntents: {
      retrieve: async (id) => {
        calls.retrieves.push(id);
        return pi;
      },
    },
    refunds: {
      create: async (params) => {
        calls.refunds.push(params);
        return {id: "re_" + nextId(), status: "succeeded"};
      },
    },
    transfers: {
      createReversal: async (id, params) => {
        calls.reversals.push({id, params});
        return {id: "trr_" + nextId()};
      },
    },
  };
};

// ===========================================================================
// §4/§5 — capture writes a generalized HELD ledger (signed webhook)
// ===========================================================================

test("ESCR1 rental capture: webhook writes a HELD `rental` ledger, releaseAt from endAt", async () => {
  const rentalId = `rent_${nextId()}`;
  const hostUid = `bizowner_${nextId()}`; // businessOwnerUid = payout host
  const ownerUid = `owner_${nextId()}`;
  const renter = `renter_${nextId()}`;
  const pi = `pi_${nextId()}`;
  // Return time is an ISO string (design §4). Super host → retention 0 →
  // releaseAt === endAt exactly (deterministic; proves the ISO end parses to a
  // NON-null releaseAt without eventEndAtMs / durationMinutes).
  const endAt = new Date(Date.now() + 2 * 24 * HOUR).toISOString();
  await db.collection("users").doc(hostUid).set({role: "host", payoutTier: "super"});
  await db.collection("rentals").doc(rentalId).set({
    vehicleId: "veh_1", ownerId: ownerUid, businessOwnerUid: hostUid,
    renterId: renter, endAt, currency: "mxn",
    totalCentavos: 120000, hostReceivesCentavos: 100000,
    platformFeeCentavos: 12000, stripeFeeCentavos: 8000,
    stripeAccountId: "acct_rentalhost", status: "reserved",
  });

  const status = await sendWebhook("payment_intent.succeeded", {
    id: pi, object: "payment_intent", amount: 120000, currency: "mxn",
    metadata: {type: "rental", rentalId, vehicleId: "veh_1", renterId: renter},
  });
  assert.strictEqual(status, 200);

  const led = await getLedger(pi);
  assert.ok(led, "rental ledger should exist");
  assert.strictEqual(led.state, "held");
  assert.strictEqual(led.type, "rental");
  assert.strictEqual(led.sourceId, rentalId);
  assert.strictEqual(led.hostUid, hostUid, "payout host = businessOwnerUid");
  assert.strictEqual(led.buyerUid, renter);
  assert.strictEqual(led.hostAmount, 100000, "amount read from the rental DOC");
  assert.strictEqual(led.grossAmount, 120000);
  assert.strictEqual(led.stripeFee, 8000);
  assert.strictEqual(led.hostAccountId, "acct_rentalhost");
  assert.strictEqual(led.deliveryEndAt, endAt);
  assert.strictEqual(led.eventId, null, "not an event ledger");
  // releaseAt = deliveryEnd + 0h (super) — the key B3 assertion: NON-null.
  assert.notStrictEqual(led.releaseAt, null, "releaseAt must NOT be null");
  assert.strictEqual(led.releaseAt, new Date(new Date(endAt).getTime()).toISOString());
});

test("ESCR2 service capture: webhook writes a HELD `service_booking` ledger with bizId", async () => {
  const bizId = `biz_${nextId()}`;
  const bookingId = `bk_${nextId()}`;
  const ownerUid = `svcowner_${nextId()}`;
  const buyer = `buyer_${nextId()}`;
  const pi = `pi_${nextId()}`;
  const end = new Date(Date.now() + 1 * 24 * HOUR).toISOString(); // slot end (ISO)
  await db.collection("users").doc(ownerUid).set({role: "host", payoutTier: "super"});
  await db.collection("businesses").doc(bizId).collection("bookings").doc(bookingId).set({
    ownerUid, buyerUid: buyer, end, currency: "mxn", sessionTypeId: "st_1",
    totalCentavos: 60000, hostReceivesCentavos: 51000,
    platformFeeCentavos: 6000, stripeFeeCentavos: 3000,
    stripeAccountId: "acct_svchost", status: "reserved",
  });

  const status = await sendWebhook("payment_intent.succeeded", {
    id: pi, object: "payment_intent", amount: 60000, currency: "mxn",
    metadata: {type: "service_booking", bizId, bookingId, buyerId: buyer},
  });
  assert.strictEqual(status, 200);

  const led = await getLedger(pi);
  assert.ok(led, "service ledger should exist");
  assert.strictEqual(led.state, "held");
  assert.strictEqual(led.type, "service_booking");
  assert.strictEqual(led.sourceId, bookingId);
  assert.strictEqual(led.bizId, bizId, "bizId preserved (subcollection)");
  assert.strictEqual(led.hostUid, ownerUid, "payout host = ownerUid");
  assert.strictEqual(led.hostAmount, 51000);
  assert.strictEqual(led.deliveryEndAt, end);
  assert.strictEqual(led.eventId, null);
  assert.strictEqual(led.releaseAt, new Date(new Date(end).getTime()).toISOString());
});

// ===========================================================================
// §4 — the +retention math generalizes to the new sources (pure)
// ===========================================================================

test("ESCR3 ledger math: writeHeldLedger applies retention to a rental's ISO endAt", async () => {
  const pi = `pi_${nextId()}`;
  const endAt = new Date(Date.now() + 3 * 24 * HOUR).toISOString();
  const releaseAt = await escrow.writeHeldLedger(db, {
    paymentIntentId: pi, type: "rental", sourceId: "rent_x",
    deliveryEndAt: endAt, buyerUid: "renter_x", hostUid: "host_x",
    hostAccountId: "acct_x", grossAmount: 120000, hostAmount: 100000,
    platformFee: 12000, stripeFee: 8000, currency: "mxn", retentionHours: 12,
  });
  const want = new Date(new Date(endAt).getTime() + 12 * HOUR).toISOString();
  assert.strictEqual(releaseAt, want, "releaseAt = endAt + 12h");
  const led = await getLedger(pi);
  assert.strictEqual(led.releaseAt, want);
  assert.strictEqual(led.type, "rental");
  assert.strictEqual(led.eventId, null);
});

// ===========================================================================
// §7 — ledger-aware refund path works for a rental (held + released)
// ===========================================================================

test("ESCR4 rental refund (HELD): refund straight from balance, NO reversal, ledger→refunded", async () => {
  const pi = `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, type: "rental", sourceId: "rent_y",
    hostUid: "host_y", buyerUid: "renter_y", state: "held", frozen: false,
    grossAmount: 100000, hostAmount: 80000, platformFee: 12000, stripeFee: 8000,
    hostPenaltyOwed: 0, transferId: null, refundId: null,
  });
  const s = refundMock({
    status: "succeeded", amount: 100000, amount_refunded: 0,
    metadata: {type: "rental", rentalId: "rent_y"},
  });

  const out = await processRefund(s, pi, 1.0, "renter_cancelled");
  assert.strictEqual(out.success, true);
  assert.strictEqual(s._calls.reversals.length, 0, "held → NO transfer reversal");
  assert.strictEqual(s._calls.refunds.length, 1, "one refund from Kinlo's balance");
  const led = await getLedger(pi);
  assert.strictEqual(led.state, "refunded");
  assert.ok(led.refundId && led.refundId.startsWith("re_"));
});

test("ESCR5 rental refund (RELEASED): claw the transfer back (reversal) + refund, ledger→reversed", async () => {
  const pi = `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, type: "rental", sourceId: "rent_z",
    hostUid: "host_z", buyerUid: "renter_z", state: "released", frozen: false,
    grossAmount: 100000, hostAmount: 80000, platformFee: 12000, stripeFee: 8000,
    hostPenaltyOwed: 0, transferId: "tr_alreadypaid", refundId: null,
  });
  const s = refundMock({
    status: "succeeded", amount: 100000, amount_refunded: 0,
    metadata: {type: "rental", rentalId: "rent_z"},
  });

  const out = await processRefund(s, pi, 1.0, "host_cancelled", true);
  assert.strictEqual(out.success, true);
  assert.strictEqual(s._calls.reversals.length, 1, "released → claw the transfer back");
  assert.strictEqual(s._calls.reversals[0].id, "tr_alreadypaid");
  assert.strictEqual(s._calls.reversals[0].params.amount, 80000, "reverse the host's cut");
  assert.strictEqual(s._calls.refunds.length, 1);
  const led = await getLedger(pi);
  assert.strictEqual(led.state, "reversed");
  assert.ok(led.refundId && led.refundId.startsWith("re_"));
});
