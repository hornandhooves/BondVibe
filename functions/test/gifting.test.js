/**
 * Integration tests for feat/social-gifting Fase 1 (money), against the Firebase
 * Emulator Suite (functions + firestore + auth).
 *
 *   npm run test:payments
 *
 * The Stripe-touching entry points (createGiftPaymentIntent + the refund SDK call)
 * can't reach real Stripe from the emulator, so:
 *  - handleGiftPurchase (webhook, Firestore-only) is exercised in-process.
 *  - redeemGift (onCall, Firestore-only) is driven over HTTP.
 *  - refundGiftToGifter takes an INJECTED stripe client → unit-tested with a mock.
 *  - cancelGift/declineGift GUARD failures (wrong user / wrong status) are driven
 *    over HTTP (they reject before any Stripe call).
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
const {Timestamp} = admin.firestore;
const gifting = require("../stripe/gifting"); // in-process (Firestore-only paths)

let uniq = 0;
const nextId = () => `gf${Date.now()}_${uniq++}`;

const tokenFor = async (uid, {verified = true} = {}) => {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: verified});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: verified});
  }
  const r = await fetch(`${IDT}:signInWithPassword?key=fake`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  }).then((x) => x.json());
  return r.idToken;
};

const call = (name, data, token) =>
  fetch(`${FN}/${name}`, {
    method: "POST",
    headers: {"Content-Type": "application/json",
      ...(token ? {Authorization: `Bearer ${token}`} : {})},
    body: JSON.stringify({data}),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

// A confirmed gift PaymentIntent as Stripe would deliver it to the webhook.
const fakeGiftPI = (over = {}) => ({
  id: over.id || `pi_${nextId()}`,
  amount: 55000,
  currency: "mxn",
  metadata: {
    type: "gift",
    giftId: over.giftId || `gift_${nextId()}`,
    gifterId: over.gifterId || `gifter_${nextId()}`,
    recipientId: over.recipientId || `recip_${nextId()}`,
    itemId: over.itemId || `evt_${nextId()}`,
    itemType: "event",
    itemTitle: "Yoga at dawn",
    hostUid: over.hostUid || `host_${nextId()}`,
    hostAccountId: "acct_test",
    totalAmount: "55000", hostReceives: "50000",
    platformFee: "2500", stripeFee: "2500",
    fromMode: over.fromMode || "named",
    message: "happy birthday!",
    ...(over.metadata || {}),
  },
});

const seedEvent = async (eventId, {max = 0, count = 0} = {}) => {
  await db.collection("events").doc(eventId).set({
    creatorId: "host", title: "Yoga at dawn", price: 500,
    date: new Date(Date.now() + 7 * 86400000).toISOString(),
    durationMinutes: 60, participantCount: count,
    ...(max ? {maxAttendees: max} : {}),
  });
};

// ── handleGiftPurchase (webhook) ────────────────────────────────────────────
test("GP1 handleGiftPurchase writes a held ledger (releaseAt:null) + gift doc + notif", async () => {
  const pi = fakeGiftPI();
  await gifting.handleGiftPurchase(pi);

  const ledger = (await db.collection("giftLedger").doc(pi.id).get()).data();
  assert.strictEqual(ledger.state, "held");
  assert.strictEqual(ledger.releaseAt, null, "invisible to the payout cron");
  assert.strictEqual(ledger.type, "gift");
  assert.strictEqual(ledger.gifterId, pi.metadata.gifterId);

  const gift = (await db.collection("gifts").doc(pi.metadata.giftId).get()).data();
  assert.strictEqual(gift.status, "sent");
  assert.ok(gift.expiresAt.toMillis() > Date.now(), "expiry in the future (~30d)");
  // The recipient-facing doc carries NO amount.
  assert.strictEqual(gift.amount, undefined);
  assert.strictEqual(gift.grossAmount, undefined);

  const notif = await db.collection("notifications")
    .where("userId", "==", pi.metadata.recipientId).limit(1).get();
  assert.strictEqual(notif.size, 1);
  assert.ok(!/\d{3}/.test(notif.docs[0].data().message || ""), "no amount in notif");
});

test("GP2 handleGiftPurchase is idempotent (webhook re-delivery)", async () => {
  const pi = fakeGiftPI();
  await gifting.handleGiftPurchase(pi);
  await gifting.handleGiftPurchase(pi); // replay
  const gifts = await db.collection("gifts")
    .where("paymentIntentId", "==", pi.id).get();
  assert.strictEqual(gifts.size, 1, "no duplicate gift");
});

// ── redeemGift (onCall, Firestore-only) ─────────────────────────────────────
test("GR1 redeem enrolls the recipient (active) and stamps releaseAt for the host", async () => {
  const recipient = `recip_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const pi = fakeGiftPI({recipientId: recipient, itemId: eventId, hostUid: "host"});
  await db.collection("users").doc("host").set({stripeConnect: {accountId: "acct"}});
  await seedEvent(eventId, {max: 10, count: 0});
  await gifting.handleGiftPurchase(pi);

  const rt = await tokenFor(recipient);
  const res = await call("redeemGift", {giftId: pi.metadata.giftId}, rt);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.placement, "active");

  const gift = (await db.collection("gifts").doc(pi.metadata.giftId).get()).data();
  assert.strictEqual(gift.status, "redeemed");
  const ledger = (await db.collection("giftLedger").doc(pi.id).get()).data();
  assert.ok(ledger.releaseAt, "releaseAt now set → cron will pay the host after the event");
  assert.strictEqual(ledger.attendeeUid, recipient);
  const roster = (await db.collection("events").doc(eventId)
    .collection("roster").doc(recipient).get()).data();
  assert.strictEqual(roster.status, "active");
});

test("GR2 a full event waitlists — the host is NOT paid (releaseAt stays null)", async () => {
  const recipient = `recip_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const pi = fakeGiftPI({recipientId: recipient, itemId: eventId, hostUid: "host"});
  await db.collection("users").doc("host").set({stripeConnect: {accountId: "acct"}});
  await seedEvent(eventId, {max: 1, count: 1}); // already full
  await gifting.handleGiftPurchase(pi);

  const rt = await tokenFor(recipient);
  const res = await call("redeemGift", {giftId: pi.metadata.giftId}, rt);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.placement, "waitlist");
  const ledger = (await db.collection("giftLedger").doc(pi.id).get()).data();
  assert.strictEqual(ledger.releaseAt, null, "waitlisted → host not paid");
});

test("GR3 only the recipient may redeem", async () => {
  const eventId = `evt_${nextId()}`;
  const pi = fakeGiftPI({itemId: eventId, hostUid: "host"});
  await seedEvent(eventId, {max: 10});
  await gifting.handleGiftPurchase(pi);
  const stranger = await tokenFor(`stranger_${nextId()}`);
  const res = await call("redeemGift", {giftId: pi.metadata.giftId}, stranger);
  assert.strictEqual(res.status, 403);
});

test("GR4 an expired gift can't be redeemed", async () => {
  const recipient = `recip_${nextId()}`;
  const eventId = `evt_${nextId()}`;
  const pi = fakeGiftPI({recipientId: recipient, itemId: eventId, hostUid: "host"});
  await seedEvent(eventId, {max: 10});
  await gifting.handleGiftPurchase(pi);
  // Force it past expiry.
  await db.collection("gifts").doc(pi.metadata.giftId)
    .set({expiresAt: Timestamp.fromMillis(Date.now() - 1000)}, {merge: true});
  const rt = await tokenFor(recipient);
  const res = await call("redeemGift", {giftId: pi.metadata.giftId}, rt);
  assert.strictEqual(res.status, 400);
  assert.match(JSON.stringify(res.body), /gift_expired/);
});

// ── refundGiftToGifter (money math + ledger transition, mock stripe) ─────────
test("GF1 refund returns item+platform, RETAINS the Stripe fee, flips the ledger", async () => {
  const pi = fakeGiftPI();
  await gifting.handleGiftPurchase(pi);
  const ledger = (await db.collection("giftLedger").doc(pi.id).get()).data();

  const calls = [];
  const mockStripe = {refunds: {create: async (a) => {
    calls.push(a); return {id: "re_1", status: "succeeded"};
  }}};
  const out = await gifting._internal.refundGiftToGifter(mockStripe, ledger);

  // gross 55000 − stripeFee 2500 = 52500 (item 50000 + platform 2500).
  assert.strictEqual(out.refunded, 52500);
  assert.strictEqual(calls[0].amount, 52500);
  assert.strictEqual(calls[0].payment_intent, pi.id);
  const after = (await db.collection("giftLedger").doc(pi.id).get()).data();
  assert.strictEqual(after.state, "refunded");
  assert.strictEqual(after.refundId, "re_1");
});

test("GF2 refund is idempotent by ledger state (no double refund)", async () => {
  const pi = fakeGiftPI();
  await gifting.handleGiftPurchase(pi);
  await db.collection("giftLedger").doc(pi.id).set({state: "refunded"}, {merge: true});
  const ledger = (await db.collection("giftLedger").doc(pi.id).get()).data();
  let called = false;
  const mockStripe = {refunds: {create: async () => {
    called = true; return {id: "x"};
  }}};
  const out = await gifting._internal.refundGiftToGifter(mockStripe, ledger);
  assert.strictEqual(called, false, "no Stripe call when already refunded");
  assert.strictEqual(out.refunded, 0);
});

// ── cancel/decline guard failures (reject before Stripe) ────────────────────
test("GC1 a non-gifter cannot cancel; a non-recipient cannot decline", async () => {
  const pi = fakeGiftPI();
  await gifting.handleGiftPurchase(pi);
  const stranger = await tokenFor(`stranger_${nextId()}`);
  const c = await call("cancelGift", {giftId: pi.metadata.giftId}, stranger);
  assert.strictEqual(c.status, 403);
  const d = await call("declineGift", {giftId: pi.metadata.giftId}, stranger);
  assert.strictEqual(d.status, 403);
});

// ── review C/G: anonymity projection + anti-double-refund ───────────────────
test("GP3 the recipient reveal carries NO gifterId (anonymity projection)", async () => {
  const pi = fakeGiftPI({fromMode: "anonymous"});
  await gifting.handleGiftPurchase(pi);
  const reveal = (await db.collection("giftReveals").doc(pi.metadata.giftId).get()).data();
  assert.ok(reveal, "reveal doc written");
  assert.strictEqual(reveal.gifterId, undefined, "no gifterId in the recipient view");
  assert.strictEqual(reveal.gifterName, null, "anonymous → no name");
  assert.strictEqual(reveal.status, "sent");
  assert.strictEqual(reveal.itemTitle, pi.metadata.itemTitle);
  // The gifter doc keeps the id.
  const gift = (await db.collection("gifts").doc(pi.metadata.giftId).get()).data();
  assert.strictEqual(gift.gifterId, pi.metadata.gifterId);
});

test("GF3 concurrent refunds settle only ONCE (CAS claim)", async () => {
  const pi = fakeGiftPI();
  await gifting.handleGiftPurchase(pi);
  const ledger = (await db.collection("giftLedger").doc(pi.id).get()).data();
  let calls = 0;
  const mockStripe = {refunds: {create: async (a) => {
    calls++; return {id: `re_${calls}`, status: "succeeded"};
  }}};
  // Fire two refunds against the SAME held ledger at once.
  const [a, b] = await Promise.all([
    gifting._internal.refundGiftToGifter(mockStripe, ledger),
    gifting._internal.refundGiftToGifter(mockStripe, ledger),
  ]);
  assert.strictEqual(calls, 1, "Stripe refund created exactly once");
  const refundedCount = [a, b].filter((x) => x.refunded > 0).length;
  assert.strictEqual(refundedCount, 1, "only one path actually refunds");
  const after = (await db.collection("giftLedger").doc(pi.id).get()).data();
  assert.strictEqual(after.state, "refunded");
});
