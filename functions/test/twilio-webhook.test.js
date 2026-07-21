/**
 * Integration tests for fix/twilio-webhook-signature (QA gate), against the
 * Firebase Emulator Suite (functions + firestore + auth).
 *
 *   npm run test:payments   (runs everything under functions/test/)
 *
 * The inbound Twilio webhook (twilioSmsWebhook → bizAutomations.twilioWebhook)
 * flips a member's SMS consent on STOP/START. It previously accepted ANY POST, so
 * consent could be forged. The fix verifies X-Twilio-Signature (twilio SDK) with
 * the account auth token and returns 403 otherwise — SMS SENDING stays inert.
 *
 * Two layers:
 *   1. Handler integration (deterministic): drive twilioWebhook(req,res) with a
 *      real signature computed by the twilio SDK over a known URL, writing to the
 *      Firestore emulator. Covers valid→200, invalid/absent/wrong-token→403, and
 *      STOP/START consent flips under a VALID signature.
 *   2. HTTP smoke: POST the real wired endpoint UNSIGNED → 403, end to end.
 */
/* eslint-disable require-jsdoc, valid-jsdoc */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");
const twilio = require("twilio");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

// The handler reads these from its process env (defineSecret exposes the token as
// process.env.TWILIO_AUTH_TOKEN in prod). We set them HERE so the required handler
// sees a known token + the exact public URL Twilio "signed".
const AUTH_TOKEN = "test_auth_token_kinlo_only";
const WEBHOOK_URL = "https://kinlo.test/twilioSmsWebhook";
process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
process.env.TWILIO_WEBHOOK_URL = WEBHOOK_URL;

const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
// Require AFTER admin init + env set (handler reads env at call time; harmless).
const {twilioWebhook} = require("../business/automations");

let uniq = 0;
const nextId = () => `tw${Date.now()}_${uniq++}`;

/** A valid X-Twilio-Signature for `params` over the known webhook URL. */
const sign = (params) =>
  twilio.getExpectedTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params);

/**
 * Build a mock Express request. Omit `signature` for the absent-signature case;
 * host + originalUrl reconstruct to WEBHOOK_URL (matches the override too).
 */
const mockReq = (params, {signature, host = "kinlo.test"} = {}) => ({
  headers: {
    ...(signature !== undefined ? {"x-twilio-signature": signature} : {}),
    host,
  },
  body: params,
  originalUrl: "/twilioSmsWebhook",
  url: "/twilioSmsWebhook",
});

const mockRes = () => ({
  _status: 200,
  _body: null,
  _headers: {},
  set(k, v) {
    this._headers[k] = v;
    return this;
  },
  status(c) {
    this._status = c;
    return this;
  },
  send(b) {
    this._body = b;
    return this;
  },
});

const run = async (req) => {
  const res = mockRes();
  await twilioWebhook(req, res);
  return res;
};

/** Seed a member with a phone + a known consent state; returns a reader. */
const seedMember = async (phone, granted) => {
  const bizId = `biz_${nextId()}`;
  const memberId = `mem_${nextId()}`;
  const ref = db.collection("businesses").doc(bizId).collection("members").doc(memberId);
  await ref.set({
    name: "Test Member", phone,
    smsConsent: {granted, at: "2026-01-01T00:00:00.000Z", purpose: "seed"},
  });
  return {ref, get: async () => (await ref.get()).data()};
};

// ===========================================================================
// signature gate
// ===========================================================================

test("TW1 valid signature → 200 (processes, empty TwiML)", async () => {
  const params = {From: `+52155${nextId().slice(-7)}`, Body: "hola", MessageSid: `SM_${nextId()}`};
  const res = await run(mockReq(params, {signature: sign(params)}));
  assert.strictEqual(res._status, 200);
  assert.match(String(res._body), /<Response><\/Response>/);
});

test("TW2 ABSENT signature → 403 (nothing processed)", async () => {
  const params = {From: `+52155${nextId().slice(-7)}`, Body: "STOP"};
  const res = await run(mockReq(params, {signature: undefined}));
  assert.strictEqual(res._status, 403);
});

test("TW3 INVALID signature → 403", async () => {
  const params = {From: `+52155${nextId().slice(-7)}`, Body: "STOP"};
  const res = await run(mockReq(params, {signature: "bogus_signature_value"}));
  assert.strictEqual(res._status, 403);
});

test("TW4 signature computed with the WRONG token → 403 (token is actually enforced)", async () => {
  const params = {From: `+52155${nextId().slice(-7)}`, Body: "STOP"};
  const wrongSig = twilio.getExpectedTwilioSignature("some_other_token", WEBHOOK_URL, params);
  const res = await run(mockReq(params, {signature: wrongSig}));
  assert.strictEqual(res._status, 403);
});

// ===========================================================================
// STOP / START still work under a VALID signature
// ===========================================================================

test("TW5 valid STOP flips smsConsent.granted → false", async () => {
  const phone = `+52155${nextId().slice(-7)}`;
  const m = await seedMember(phone, true);
  const params = {From: phone, Body: "STOP", MessageSid: `SM_${nextId()}`};
  const res = await run(mockReq(params, {signature: sign(params)}));
  assert.strictEqual(res._status, 200);
  const after = await m.get();
  assert.strictEqual(after.smsConsent.granted, false);
  assert.strictEqual(after.smsConsent.source, "stop");
});

test("TW6 valid START flips smsConsent.granted → true", async () => {
  const phone = `+52155${nextId().slice(-7)}`;
  const m = await seedMember(phone, false);
  const params = {From: phone, Body: "START", MessageSid: `SM_${nextId()}`};
  const res = await run(mockReq(params, {signature: sign(params)}));
  assert.strictEqual(res._status, 200);
  const after = await m.get();
  assert.strictEqual(after.smsConsent.granted, true);
  assert.strictEqual(after.smsConsent.source, "start");
});

test("TW7 forged STOP (no signature) does NOT change consent", async () => {
  const phone = `+52155${nextId().slice(-7)}`;
  const m = await seedMember(phone, true);
  const params = {From: phone, Body: "STOP"};
  const res = await run(mockReq(params, {signature: undefined}));
  assert.strictEqual(res._status, 403);
  const after = await m.get();
  assert.strictEqual(after.smsConsent.granted, true, "consent untouched by a rejected request");
});

// ===========================================================================
// HTTP smoke — the real wired endpoint rejects an unsigned POST end to end
// ===========================================================================

test("TW8 HTTP: POST the deployed webhook UNSIGNED → 403", async () => {
  const res = await fetch(`${FN}/twilioSmsWebhook`, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({From: "+5215500000000", Body: "STOP"}).toString(),
  });
  assert.strictEqual(res.status, 403);
});
