/**
 * Escrow tests (feat/payments-escrow · docs/DISENO_escrow_pagos.md).
 * Run: npm run test:payments (node --test vs the emulator suite).
 *
 * Two layers:
 *   1. Money-STATE logic — deterministic, no Stripe network:
 *      retention math (§4/§7), ledger-on-capture (signed webhook, local HMAC),
 *      dispute freeze (§8), releaseAt recompute (§8), and the release engine
 *      (escrow.releaseOnePayout) driven by a MOCK Stripe so every branch —
 *      transfer, penalty netting (§6), no-Connect (§8), idempotency — is
 *      exercised exactly as the cron runs it.
 *   2. The raw Stripe TEST API sequences (PI without transfer_data + transfer_group,
 *      refund-held, transfer + reversal) live in functions/test/escrow-live.mjs,
 *      run against real test keys.
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");
const escrow = require("../stripe/escrow");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const WEBHOOK_SECRET = "whsec_dummy_emulator_only";

admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();

let uniq = 0;
const nextId = () => `esc${Date.now()}_${uniq++}`;
const HOUR = 3600000;

// A mock Stripe that records transfer/reversal calls and honors idempotencyKey
// (same key → same transfer), so the release engine's idempotency is testable.
const mockStripe = () => {
  const transfersByKey = new Map();
  const calls = {transfers: [], reversals: []};
  return {
    _calls: calls,
    transfers: {
      create: async (params, opts) => {
        const key = opts && opts.idempotencyKey;
        if (key && transfersByKey.has(key)) return transfersByKey.get(key);
        const tr = {id: "tr_" + nextId(), ...params};
        if (key) transfersByKey.set(key, tr);
        calls.transfers.push({params, opts});
        return tr;
      },
      createReversal: async (id, params) => {
        calls.reversals.push({id, params});
        return {id: "trr_" + nextId()};
      },
    },
  };
};

const getLedger = async (id) =>
  (await db.collection("paymentLedger").doc(id).get()).data();

const IDT = `http://127.0.0.1:${
  process.env.FIREBASE_AUTH_EMULATOR_HOST.split(":")[1]
}/identitytoolkit.googleapis.com/v1/accounts`;

// Emulator user + ID token; isAdmin sets the custom claim isAdminUid reads.
const tokenFor = async (uid, {isAdmin = false} = {}) => {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: true});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: true});
  }
  if (isAdmin) await admin.auth().setCustomUserClaims(uid, {admin: true});
  const r = await fetch(`${IDT}:signInWithPassword?key=fake`, {
    method: "POST", headers: {"Content-Type": "application/json"},
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

// Deliver a signed Stripe webhook to the emulator function.
const sendWebhook = async (type, object) => {
  const stripe = require("stripe")("sk_test_dummy_emulator_only");
  const payload = JSON.stringify({
    id: "evt_" + nextId(), object: "event", type,
    data: {object},
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

// ===========================================================================
// §4/§7 — retention math (pure)
// ===========================================================================

test("ESC1 retention: global default is 24h when settings/payouts absent", async () => {
  await db.collection("settings").doc("payouts").delete().catch(() => {});
  const h = await escrow.effectiveRetentionHours(db, {});
  assert.strictEqual(h, 24);
});

test("ESC2 retention: a super host is 0h (paid at event end)", async () => {
  const h = await escrow.effectiveRetentionHours(db, {payoutTier: "super"});
  assert.strictEqual(h, 0);
});

test("ESC3 retention: HARD FLOOR 0 — a negative stored value clamps to 0", async () => {
  await db.collection("settings").doc("payouts").set({retentionHours: -5});
  const h = await escrow.effectiveRetentionHours(db, {payoutTier: "standard"});
  assert.strictEqual(h, 0);
  await db.collection("settings").doc("payouts").delete();
});

test("ESC4 retention: an explicit positive global value is honored", async () => {
  await db.collection("settings").doc("payouts").set({retentionHours: 48});
  const h = await escrow.effectiveRetentionHours(db, {});
  assert.strictEqual(h, 48);
  await db.collection("settings").doc("payouts").delete();
});

test("ESC5 releaseAt = eventEnd + retention; eventEnd = start + durationMinutes", () => {
  const start = new Date("2026-08-01T18:00:00.000Z").getTime();
  const end = escrow.eventEndAtMs({date: new Date(start).toISOString(), durationMinutes: 120});
  assert.strictEqual(end, start + 120 * 60000);
  const releaseAt = escrow.computeReleaseAtISO(end, 24);
  assert.strictEqual(releaseAt, new Date(end + 24 * HOUR).toISOString());
  // Floor: negative retention never pulls releaseAt before the event ends.
  assert.strictEqual(escrow.computeReleaseAtISO(end, -10), new Date(end).toISOString());
});

test("ESC5b date parsing: eventEndAtMs handles Firestore Timestamp AND ISO", () => {
  const start = new Date("2026-09-10T15:00:00.000Z").getTime();
  const expectedEnd = start + 90 * 60000; // 90-min event
  // ISO string (already covered) …
  assert.strictEqual(
    escrow.eventEndAtMs({date: new Date(start).toISOString(), durationMinutes: 90}),
    expectedEnd);
  // … a real Firestore Timestamp instance (.toDate()) — new Date(ts) would be NaN.
  const ts = admin.firestore.Timestamp.fromMillis(start);
  assert.strictEqual(escrow.eventEndAtMs({date: ts, durationMinutes: 90}), expectedEnd);
  // … a serialized timestamp ({_seconds}) as it can arrive across boundaries.
  assert.strictEqual(
    escrow.eventEndAtMs({date: {_seconds: start / 1000, _nanoseconds: 0}, durationMinutes: 90}),
    expectedEnd);
  // Regression guard: a Timestamp must NOT collapse to NaN (→ null releaseAt).
  assert.ok(Number.isFinite(escrow.dateToMillis(ts)));
});

// ===========================================================================
// §2/§3 — ledger written 'held' on capture (signed webhook, no Stripe network)
// ===========================================================================

test("ESC6 capture: webhook writes a HELD ledger with releaseAt = end + 24h", async () => {
  const eventId = `evt_${nextId()}`;
  const hostUid = `host_${nextId()}`;
  const buyer = `buyer_${nextId()}`;
  const pi = `pi_${nextId()}`;
  const start = new Date(Date.now() + 3 * 24 * HOUR).toISOString();
  await db.collection("events").doc(eventId).set({
    creatorId: hostUid, title: "Escrow event", attendees: [],
    date: start, durationMinutes: 180, maxAttendees: 50,
  });
  await db.collection("users").doc(hostUid).set({role: "host", payoutTier: "standard"});
  const eventEndAt = new Date(new Date(start).getTime() + 180 * 60000).toISOString();

  const status = await sendWebhook("payment_intent.succeeded", {
    id: pi, object: "payment_intent", amount: 27312, currency: "mxn",
    metadata: {
      type: "event_ticket", eventId, eventTitle: "Escrow event",
      userId: buyer, hostId: hostUid,
      eventPrice: "25000", platformFee: "1250", stripeFee: "1062",
      totalAmount: "27312", hostReceives: "25000",
      hostAccountId: "acct_testhost", eventEndAt,
    },
  });
  assert.strictEqual(status, 200);

  const led = await getLedger(pi);
  assert.ok(led, "ledger should exist");
  assert.strictEqual(led.state, "held");
  assert.strictEqual(led.frozen, false);
  assert.strictEqual(led.hostUid, hostUid);
  assert.strictEqual(led.attendeeUid, buyer);
  assert.strictEqual(led.hostAmount, 25000);
  assert.strictEqual(led.grossAmount, 27312);
  assert.strictEqual(led.stripeFee, 1062);
  assert.strictEqual(led.hostAccountId, "acct_testhost");
  assert.strictEqual(led.hostPenaltyOwed, 0);
  const expected = new Date(new Date(eventEndAt).getTime() + 24 * HOUR).toISOString();
  assert.strictEqual(led.releaseAt, expected);
});

test("ESC6b capture: a Firestore Timestamp `date` still yields a non-null releaseAt", async () => {
  // The bug: eventEndAtMs did new Date(timestampObject) → NaN → releaseAt:null,
  // breaking the release cron. Exercise the webhook FALLBACK (no eventEndAt in
  // metadata → reads the event doc, whose date is a Timestamp).
  const eventId = `evt_${nextId()}`;
  const hostUid = `host_${nextId()}`;
  const pi = `pi_${nextId()}`;
  const startMs = Date.now() + 4 * 24 * HOUR;
  await db.collection("events").doc(eventId).set({
    creatorId: hostUid, title: "TS event", attendees: [],
    date: admin.firestore.Timestamp.fromMillis(startMs),
    durationMinutes: 120, maxAttendees: 50,
  });
  await db.collection("users").doc(hostUid).set({role: "host", payoutTier: "standard"});

  const status = await sendWebhook("payment_intent.succeeded", {
    id: pi, object: "payment_intent", amount: 27312, currency: "mxn",
    metadata: {
      type: "event_ticket", eventId, eventTitle: "TS event",
      userId: `buyer_${nextId()}`, hostId: hostUid,
      hostReceives: "25000", stripeFee: "1062", totalAmount: "27312",
      hostAccountId: "acct_testhost",
      // eventEndAt intentionally omitted → forces the Timestamp fallback.
    },
  });
  assert.strictEqual(status, 200);

  const led = await getLedger(pi);
  const wantEnd = new Date(startMs + 120 * 60000).toISOString();
  const wantRelease = new Date(startMs + 120 * 60000 + 24 * HOUR).toISOString();
  assert.notStrictEqual(led.releaseAt, null, "releaseAt must NOT be null for a Timestamp date");
  assert.strictEqual(led.eventEndAt, wantEnd);
  assert.strictEqual(led.releaseAt, wantRelease);
});

test("ESC7 dispute: charge.dispute.created FREEZES the ledger (§8)", async () => {
  const pi = `pi_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, eventId: "e", hostUid: "h", state: "held", frozen: false,
  });
  const status = await sendWebhook("charge.dispute.created", {
    id: "dp_" + nextId(), object: "dispute", payment_intent: pi,
  });
  assert.strictEqual(status, 200);
  const led = await getLedger(pi);
  assert.strictEqual(led.frozen, true);
});

// ===========================================================================
// §8 — releaseAt recomputed when the event end moves
// ===========================================================================

test("ESC8 event edit: moving durationMinutes recomputes held ledgers' releaseAt", async () => {
  const eventId = `evt_${nextId()}`;
  const hostUid = `host_${nextId()}`;
  const pi = `pi_${nextId()}`;
  const start = new Date(Date.now() + 5 * 24 * HOUR).toISOString();
  await db.collection("users").doc(hostUid).set({role: "host"});
  await db.collection("events").doc(eventId).set({
    creatorId: hostUid, title: "Edit me", date: start, durationMinutes: 60,
  });
  const end0 = new Date(new Date(start).getTime() + 60 * 60000).toISOString();
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, eventId, hostUid, state: "held", frozen: false,
    hostAmount: 25000, eventEndAt: end0,
    releaseAt: new Date(new Date(end0).getTime() + 24 * HOUR).toISOString(),
  });

  // Move the event 2h longer → onEventWritten should recompute releaseAt.
  await db.collection("events").doc(eventId).update({durationMinutes: 180});

  // Give the trigger a moment (poll).
  const wantEnd = new Date(new Date(start).getTime() + 180 * 60000).toISOString();
  const wantRelease = new Date(new Date(wantEnd).getTime() + 24 * HOUR).toISOString();
  let led;
  for (let i = 0; i < 25; i++) {
    led = await getLedger(pi);
    if (led.releaseAt === wantRelease) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.strictEqual(led.eventEndAt, wantEnd);
  assert.strictEqual(led.releaseAt, wantRelease);
});

// ===========================================================================
// §4/§6 — release engine (mock Stripe): every branch
// ===========================================================================

// Seed a held ledger ready to release (past releaseAt).
const seedHeld = async (over = {}) => {
  const pi = `pi_${nextId()}`;
  const hostUid = over.hostUid || `host_${nextId()}`;
  await db.collection("paymentLedger").doc(pi).set({
    paymentIntentId: pi, eventId: `evt_${nextId()}`, hostUid,
    hostAccountId: "acct_testhost", attendeeUid: `a_${nextId()}`,
    grossAmount: 27312, hostAmount: 25000, platformFee: 1250, stripeFee: 1062,
    currency: "mxn", state: "held", frozen: false, hostPenaltyOwed: 0,
    releaseAt: new Date(Date.now() - HOUR).toISOString(),
    transferId: null, refundId: null, ...over,
  });
  return {pi, hostUid, ref: db.collection("paymentLedger").doc(pi)};
};

test("ESC9 release: held+account → transfer hostAmount, state released, transferId set", async () => {
  const {pi, ref} = await seedHeld();
  const s = mockStripe();
  const out = await escrow.releaseOnePayout(s, db, await ref.get());
  assert.strictEqual(out, "released");
  assert.strictEqual(s._calls.transfers.length, 1);
  assert.strictEqual(s._calls.transfers[0].params.amount, 25000);
  assert.strictEqual(s._calls.transfers[0].params.destination, "acct_testhost");
  const led = await getLedger(pi);
  assert.strictEqual(led.state, "released");
  assert.ok(led.transferId && led.transferId.startsWith("tr_"));
});

test("ESC10 release: per-host penalty (§6) netted from the transfer + debt reduced", async () => {
  const hostUid = `host_${nextId()}`;
  await db.collection("hostPayoutAccounts").doc(hostUid).set({penaltyOwed: 400});
  const {pi, ref} = await seedHeld({hostUid});
  const s = mockStripe();
  await escrow.releaseOnePayout(s, db, await ref.get());
  assert.strictEqual(s._calls.transfers[0].params.amount, 25000 - 400);
  const led = await getLedger(pi);
  assert.strictEqual(led.hostPenaltyOwed, 400);
  const acc = (await db.collection("hostPayoutAccounts").doc(hostUid).get()).data();
  assert.strictEqual(acc.penaltyOwed, 0);
});

test("ESC11 release: no Connect account → stays HELD, no transfer (§8)", async () => {
  const {pi, ref} = await seedHeld({hostAccountId: null, hostUid: `nohost_${nextId()}`});
  const s = mockStripe();
  const out = await escrow.releaseOnePayout(s, db, await ref.get());
  assert.strictEqual(out, "held");
  assert.strictEqual(s._calls.transfers.length, 0);
  assert.strictEqual((await getLedger(pi)).state, "held");
});

test("ESC12 release: idempotent — a second run does not re-transfer or double-net", async () => {
  const hostUid = `host_${nextId()}`;
  await db.collection("hostPayoutAccounts").doc(hostUid).set({penaltyOwed: 500});
  const {pi, ref} = await seedHeld({hostUid});
  const s = mockStripe();
  await escrow.releaseOnePayout(s, db, await ref.get());
  // Re-fetch (now 'released') and run again — must be a no-op.
  await escrow.releaseOnePayout(s, db, await ref.get());
  assert.strictEqual((await getLedger(pi)).state, "released");
  const acc = (await db.collection("hostPayoutAccounts").doc(hostUid).get()).data();
  assert.strictEqual(acc.penaltyOwed, 0, "penalty netted once, not twice");
});

test("ESC13 release: penalty >= hostAmount → no transfer, released, whole amount netted", async () => {
  const hostUid = `host_${nextId()}`;
  await db.collection("hostPayoutAccounts").doc(hostUid).set({penaltyOwed: 30000});
  const {pi, ref} = await seedHeld({hostUid});
  const s = mockStripe();
  const out = await escrow.releaseOnePayout(s, db, await ref.get());
  assert.strictEqual(out, "released");
  assert.strictEqual(s._calls.transfers.length, 0, "nothing to transfer");
  const led = await getLedger(pi);
  assert.strictEqual(led.hostPenaltyOwed, 25000); // capped at hostAmount
  const acc = (await db.collection("hostPayoutAccounts").doc(hostUid).get()).data();
  assert.strictEqual(acc.penaltyOwed, 5000); // 30000 - 25000 remains as debt
});

test("ESC14 cron query: excludes frozen and future releaseAt", async () => {
  const eligible = await seedHeld();
  const frozen = await seedHeld({frozen: true});
  const future = await seedHeld({releaseAt: new Date(Date.now() + 24 * HOUR).toISOString()});
  const nowISO = new Date().toISOString();
  const snap = await db.collection("paymentLedger")
    .where("state", "==", "held")
    .where("frozen", "==", false)
    .where("releaseAt", "<=", nowISO)
    .orderBy("releaseAt", "asc")
    .get();
  const ids = snap.docs.map((d) => d.id);
  assert.ok(ids.includes(eligible.pi), "eligible included");
  assert.ok(!ids.includes(frozen.pi), "frozen excluded");
  assert.ok(!ids.includes(future.pi), "future excluded");
});

// ===========================================================================
// §7 — admin freeze control (setPayoutFrozen callable)
// ===========================================================================

test("ESC15 setPayoutFrozen: an admin can freeze/unfreeze a payout", async () => {
  const {pi} = await seedHeld();
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const froze = await callFn("setPayoutFrozen", {paymentIntentId: pi, frozen: true}, token);
  assert.strictEqual(froze.status, 200);
  assert.strictEqual((await getLedger(pi)).frozen, true);
  const un = await callFn("setPayoutFrozen", {paymentIntentId: pi, frozen: false}, token);
  assert.strictEqual(un.status, 200);
  assert.strictEqual((await getLedger(pi)).frozen, false);
});

test("ESC16 setPayoutFrozen: a non-admin is denied", async () => {
  const {pi} = await seedHeld();
  const token = await tokenFor(`user_${nextId()}`, {isAdmin: false});
  const res = await callFn("setPayoutFrozen", {paymentIntentId: pi, frozen: true}, token);
  assert.strictEqual(res.status, 403); // permission-denied → 403
  assert.match(JSON.stringify(res.body), /Admin only/i);
});
