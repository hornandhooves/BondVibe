/**
 * Integration tests for feat/admin-payouts-callables
 * (docs/DISENO_admin_payouts_backend.md), against the Firebase Emulator Suite
 * (functions + firestore + auth).
 *
 *   npm run test:payments
 *
 * The 3 admin payouts callables are thin, isAdmin-gated wrappers over the escrow
 * ledger + the REUSED money code (escrow.releaseOnePayout / refunds.processRefund).
 * paymentLedger + hostPayoutAccounts stay DENY-ALL — these run under the Admin SDK.
 *
 * What's tested here:
 *   - auth: a non-admin is denied on all 3;
 *   - adminListPayouts: paginates, filters by state + type, enriches host debt;
 *   - adminReleasePayout: rejects frozen + non-held + not-found (its own gates);
 *   - adminRefundPayout: rejects not-found.
 * The SUCCESS money paths (held→released, held→refunded, released→reversed) are
 * exercised deterministically against the exact REUSED functions with a mock
 * Stripe (the callables can't reach real Stripe in the emulator), matching how
 * escrow.test.js drives releaseOnePayout.
 *
 * ISOLATION: adminListPayouts reads the whole paymentLedger collection, which the
 * other test files also write concurrently. Every list test tags its rows with a
 * UNIQUE `type` and always filters by it, so it only ever sees its own rows.
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
const escrow = require("../stripe/escrow");
const {processRefund} = require("../stripe/refunds");
const db = admin.firestore();
const {Timestamp} = admin.firestore;

let uniq = 0;
const nextId = () => `ap${Date.now()}_${uniq++}`;

// Emulator user + ID token; isAdmin sets the claim isAdminUid reads.
const tokenFor = async (uid, {isAdmin: adminClaim = false} = {}) => {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: true});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: true});
  }
  if (adminClaim) await admin.auth().setCustomUserClaims(uid, {admin: true});
  const r = await fetch(`${IDT}:signInWithPassword?key=fake`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  }).then((x) => x.json());
  return r.idToken;
};

const callFn = (name, data, token) =>
  fetch(`${FN}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify({data}),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

const getLedger = async (id) =>
  (await db.collection("paymentLedger").doc(id).get()).data();

// Seed a ledger row. `over.capturedAtMs` controls the desc ordering.
const seedLedger = async (over = {}) => {
  const pi = over.paymentIntentId || `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi,
    type: "event_ticket",
    sourceId: `src_${nextId()}`,
    bizId: null,
    hostUid: `host_${nextId()}`,
    buyerUid: `buyer_${nextId()}`,
    hostAccountId: "acct_testhost",
    grossAmount: 27312, hostAmount: 25000, platformFee: 1250, stripeFee: 1062,
    currency: "mxn", state: "held", frozen: false, hostPenaltyOwed: 0,
    releaseAt: new Date(Date.now() - 3600000).toISOString(),
    deliveryEndAt: new Date(Date.now() - 7200000).toISOString(),
    transferId: null, refundId: null,
    capturedAt: Timestamp.fromMillis(over.capturedAtMs || Date.now()),
    ...over,
  });
  return pi;
};

// A mock Stripe recording transfers/reversals/refunds, honoring idempotencyKey.
const mockStripe = (pi) => {
  const byKey = new Map();
  const calls = {transfers: [], reversals: [], refunds: []};
  return {
    _calls: calls,
    paymentIntents: {retrieve: async () => pi},
    transfers: {
      create: async (params, opts) => {
        const k = opts && opts.idempotencyKey;
        if (k && byKey.has(k)) return byKey.get(k);
        const tr = {id: "tr_" + nextId(), ...params};
        if (k) byKey.set(k, tr);
        calls.transfers.push({params, opts});
        return tr;
      },
      createReversal: async (id, params) => {
        calls.reversals.push({id, params});
        return {id: "trr_" + nextId()};
      },
    },
    refunds: {
      create: async (params) => {
        calls.refunds.push(params);
        return {id: "re_" + nextId(), status: "succeeded"};
      },
    },
  };
};

// ===========================================================================
// auth — every callable is isAdmin-gated
// ===========================================================================

test("AP1 adminListPayouts denies a non-admin", async () => {
  const token = await tokenFor(`u_${nextId()}`, {isAdmin: false});
  const res = await callFn("adminListPayouts", {}, token);
  assert.strictEqual(res.status, 403);
  assert.match(JSON.stringify(res.body), /Admin only/i);
});

test("AP2 adminReleasePayout denies a non-admin", async () => {
  const token = await tokenFor(`u_${nextId()}`, {isAdmin: false});
  const res = await callFn("adminReleasePayout", {paymentIntentId: "pi_x"}, token);
  assert.strictEqual(res.status, 403);
});

test("AP3 adminRefundPayout denies a non-admin", async () => {
  const token = await tokenFor(`u_${nextId()}`, {isAdmin: false});
  const res = await callFn("adminRefundPayout", {paymentIntentId: "pi_x"}, token);
  assert.strictEqual(res.status, 403);
});

// ===========================================================================
// adminListPayouts — list, filter, paginate, enrich host debt
// ===========================================================================

test("AP4 list: returns the row fields + enriches hostDebtOwed from hostPayoutAccounts", async () => {
  const myType = `t_${nextId()}`;
  const hostUid = `host_${nextId()}`;
  await db.collection("hostPayoutAccounts").doc(hostUid).set({penaltyOwed: 900});
  const pi = await seedLedger({type: myType, hostUid, state: "released", transferId: "tr_1"});
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});

  const res = await callFn("adminListPayouts", {type: myType}, token);
  assert.strictEqual(res.status, 200);
  const rows = res.body.result.payouts;
  assert.strictEqual(rows.length, 1);
  const row = rows[0];
  assert.strictEqual(row.paymentIntentId, pi);
  assert.strictEqual(row.type, myType);
  assert.strictEqual(row.state, "released");
  assert.strictEqual(row.hostUid, hostUid);
  assert.strictEqual(row.grossAmount, 27312);
  assert.strictEqual(row.transferId, "tr_1");
  assert.strictEqual(row.hostDebtOwed, 900, "enriched from hostPayoutAccounts.penaltyOwed");
});

test("AP5 list: paginates via nextCursor (limit)", async () => {
  const myType = `t_${nextId()}`;
  const base = Date.now();
  // 5 rows, strictly decreasing capturedAt so desc order is deterministic.
  for (let i = 0; i < 5; i++) {
    await seedLedger({type: myType, capturedAtMs: base - i * 1000});
  }
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});

  const p1 = await callFn("adminListPayouts", {type: myType, limit: 2}, token);
  assert.strictEqual(p1.body.result.payouts.length, 2);
  assert.ok(p1.body.result.nextCursor, "nextCursor present when the page is full");

  const p2 = await callFn(
    "adminListPayouts", {type: myType, limit: 2, cursor: p1.body.result.nextCursor}, token);
  assert.strictEqual(p2.body.result.payouts.length, 2);

  const p3 = await callFn(
    "adminListPayouts", {type: myType, limit: 2, cursor: p2.body.result.nextCursor}, token);
  assert.strictEqual(p3.body.result.payouts.length, 1, "last page has the 5th row");
  assert.strictEqual(p3.body.result.nextCursor, null, "no cursor past the end");

  // No overlap across pages.
  const ids = new Set([
    ...p1.body.result.payouts, ...p2.body.result.payouts, ...p3.body.result.payouts,
  ].map((r) => r.paymentIntentId));
  assert.strictEqual(ids.size, 5, "all 5 distinct, no dup/skip");
});

test("AP6 list: filters by state", async () => {
  const myType = `t_${nextId()}`;
  await seedLedger({type: myType, state: "held"});
  await seedLedger({type: myType, state: "held"});
  await seedLedger({type: myType, state: "refunded"});
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});

  const res = await callFn("adminListPayouts", {type: myType, status: "held"}, token);
  assert.strictEqual(res.status, 200);
  const rows = res.body.result.payouts;
  assert.strictEqual(rows.length, 2);
  assert.ok(rows.every((r) => r.state === "held"));
});

test("AP7 list: filters by type", async () => {
  const typeA = `t_${nextId()}`;
  const typeB = `t_${nextId()}`;
  await seedLedger({type: typeA});
  await seedLedger({type: typeA});
  await seedLedger({type: typeB});
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});

  const res = await callFn("adminListPayouts", {type: typeA}, token);
  assert.strictEqual(res.body.result.payouts.length, 2);
  assert.ok(res.body.result.payouts.every((r) => r.type === typeA));
});

// ===========================================================================
// adminReleasePayout — gates (frozen / non-held / not-found) before delegating
// ===========================================================================

test("AP8 release: a FROZEN payout is rejected (never pay a disputed hold)", async () => {
  const pi = await seedLedger({state: "held", frozen: true});
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("adminReleasePayout", {paymentIntentId: pi}, token);
  assert.strictEqual(res.status, 400); // failed-precondition → 400
  assert.match(JSON.stringify(res.body), /payout_frozen/);
  assert.strictEqual((await getLedger(pi)).state, "held", "untouched");
});

test("AP9 release: a non-HELD payout is rejected (no re-pay of refunded/released)", async () => {
  const pi = await seedLedger({state: "released", transferId: "tr_done"});
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("adminReleasePayout", {paymentIntentId: pi}, token);
  assert.strictEqual(res.status, 400);
  assert.match(JSON.stringify(res.body), /not_releasable/);
});

test("AP10 release: an unknown paymentIntentId is 404", async () => {
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("adminReleasePayout", {paymentIntentId: `pi_missing_${nextId()}`}, token);
  assert.strictEqual(res.status, 404);
});

test("AP11 refund: an unknown paymentIntentId is 404", async () => {
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("adminRefundPayout", {paymentIntentId: `pi_missing_${nextId()}`}, token);
  assert.strictEqual(res.status, 404);
});

// ===========================================================================
// money paths — the REUSED functions the callables delegate to (mock Stripe)
// ===========================================================================

test("AP12 release money path: releaseOnePayout on a HELD ledger → released + transfer", async () => {
  const pi = await seedLedger({state: "held", hostAmount: 25000});
  const snap = await db.collection("paymentLedger").doc(pi).get();
  const s = mockStripe();
  const outcome = await escrow.releaseOnePayout(s, db, snap);
  assert.strictEqual(outcome, "released");
  assert.strictEqual(s._calls.transfers.length, 1);
  assert.strictEqual(s._calls.transfers[0].params.amount, 25000);
  assert.strictEqual((await getLedger(pi)).state, "released");
});

test("AP13 refund money path (HELD): processRefund → refund from balance, no reversal, refunded", async () => {
  const pi = await seedLedger({state: "held", transferId: null});
  const s = mockStripe({status: "succeeded", amount: 27312, amount_refunded: 0, metadata: {}});
  const result = await processRefund(s, pi, 1.0, "admin_refund", true);
  assert.strictEqual(result.success, true);
  assert.strictEqual(s._calls.reversals.length, 0);
  assert.strictEqual(s._calls.refunds.length, 1);
  assert.strictEqual((await getLedger(pi)).state, "refunded");
});

test("AP14 refund money path (RELEASED): processRefund → reversal + refund, reversed", async () => {
  const pi = await seedLedger({state: "released", transferId: "tr_paid", hostAmount: 25000});
  const s = mockStripe({status: "succeeded", amount: 27312, amount_refunded: 0, metadata: {}});
  const result = await processRefund(s, pi, 1.0, "admin_refund", true);
  assert.strictEqual(result.success, true);
  assert.strictEqual(s._calls.reversals.length, 1);
  assert.strictEqual(s._calls.reversals[0].id, "tr_paid");
  assert.strictEqual((await getLedger(pi)).state, "reversed");
});
