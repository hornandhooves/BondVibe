/**
 * KIN-221 — integration tests for the client-error sink, against the Firebase
 * Emulator Suite (functions + firestore + auth).
 *
 *   npm run test:payments   (runs everything under functions/test/)
 *
 * Two units, tested the way each is actually reached:
 *   - reportClientError is an onRequest endpoint, so it is exercised over real
 *     HTTP with real ID tokens. Its auth, its method gate and its rate limit
 *     are the parts a mock would happily lie about.
 *   - overLimit is a plain exported function over a Firestore transaction, so
 *     it is called directly. The interesting cases are the boundaries — the
 *     call that hits the limit exactly, and the one that arrives after the
 *     window rolled over.
 *
 * This endpoint is the reason a $99 promotion (pi_3U3TqARZsYFCeXAc0BxkLiX7)
 * could be invisible for days: before KIN-221, a failing client query logged to
 * a phone and nothing else. That makes "does the sink actually accept a report,
 * and refuse the things it should refuse" worth pinning down rather than
 * assuming.
 *
 * The rate-limit state lives in a Firestore doc, so CE8/CE9 seed the counter
 * directly instead of making 30 real HTTP calls — same code path, a fraction of
 * the wall clock.
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

const {overLimit} = require("../lib/rateLimit");

/** The limits the endpoint declares; mirrored here so a drift shows up as a failure. */
const RL_MAX = 30;
const HOUR_MS = 60 * 60 * 1000;

let uniq = 0;
/** @return {string} a collision-free suffix (the emulator is shared by the suite) */
const nextId = () => `k221_${Date.now()}_${uniq++}`;

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

/**
 * @param {string} path function name
 * @param {object} body JSON body
 * @param {string} [token] bearer token
 * @return {Promise<{status:number, body:object}>} response
 */
const post = (path, body, token) =>
  fetch(`${FN}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify(body),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

/**
 * @param {string} path function name
 * @param {string} [token] bearer token
 * @return {Promise<{status:number, body:object}>} response
 */
const get = (path, token) =>
  fetch(`${FN}/${path}`, {
    method: "GET",
    headers: {...(token ? {Authorization: `Bearer ${token}`} : {})},
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

/**
 * A complete, valid report body.
 * @return {object} the request payload
 */
const validBody = () => ({
  surface: "promotionService.getFeaturedEventsNearby",
  message: "permission-denied",
  stack: "Error: permission-denied\n    at getDocs (firestore.js:1:1)",
  meta: {city: "tulum"},
  platform: "ios",
});

/**
 * @param {string} uid the caller
 * @return {FirebaseFirestore.DocumentReference} that caller's rate-limit bucket
 */
const bucketRef = (uid) => db.doc(`rateLimit/clienterr_${uid}`);

// ===========================================================================
// reportClientError — over real HTTP
// ===========================================================================

test("CE1 a non-POST method is refused", async () => {
  const res = await get("reportClientError");
  assert.strictEqual(res.status, 405);
});

test("CE2 no Authorization header → 401", async () => {
  const res = await post("reportClientError", validBody());
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, "unauthenticated");
});

test("CE3 a garbage bearer token → 401", async () => {
  // Identity comes from a verified token, never the body — a forged one buys
  // nothing.
  const res = await post("reportClientError", validBody(), "not-a-real-token");
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, "unauthenticated");
});

test("CE4 missing `surface` → 400", async () => {
  const token = await tokenFor(`u_${nextId()}`);
  const body = validBody();
  delete body.surface;
  const res = await post("reportClientError", body, token);
  assert.strictEqual(res.status, 400);
});

test("CE5 missing `message` → 400", async () => {
  const token = await tokenFor(`u_${nextId()}`);
  const body = validBody();
  delete body.message;
  const res = await post("reportClientError", body, token);
  assert.strictEqual(res.status, 400);
});

test("CE6 a complete report is accepted", async () => {
  const token = await tokenFor(`u_${nextId()}`);
  const res = await post("reportClientError", validBody(), token);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, {ok: true});
});

test("CE7 an UNVERIFIED email is still allowed to report", async () => {
  // Deliberate, and pinned here as a regression: an unverified account hits
  // real bugs too, and its reports are the ones we'd miss most. Every other
  // authed endpoint in this codebase gates on email_verified — this one must
  // not start doing it by copy-paste.
  const token = await tokenFor(`u_${nextId()}`, {verified: false});
  const res = await post("reportClientError", validBody(), token);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, {ok: true});
});

test("CE8 a caller at the limit is rate limited", async () => {
  const uid = `u_${nextId()}`;
  const token = await tokenFor(uid);
  // Seed the bucket rather than making 30 real calls: the limiter's whole state
  // is this document, so writing it exercises the same branch far faster.
  await bucketRef(uid).set({windowStart: Date.now(), count: RL_MAX});
  const res = await post("reportClientError", validBody(), token);
  assert.strictEqual(res.status, 429);
  assert.strictEqual(res.body.error, "rate_limited");
});

test("CE9 one under the limit still gets through", async () => {
  // Pins the boundary as >= 30, not > 30. Off by one here means either a
  // silently dropped report or a limit that never bites.
  const uid = `u_${nextId()}`;
  const token = await tokenFor(uid);
  await bucketRef(uid).set({windowStart: Date.now(), count: RL_MAX - 1});
  const res = await post("reportClientError", validBody(), token);
  assert.strictEqual(res.status, 200);
  // ...and that call consumed the last slot.
  const after = (await bucketRef(uid).get()).data();
  assert.strictEqual(after.count, RL_MAX);
});

// ===========================================================================
// overLimit — called directly
// ===========================================================================

test("RL1 a fresh key is under the limit and starts counting", async () => {
  const key = `rl_${nextId()}`;
  assert.strictEqual(await overLimit(key, 3, HOUR_MS), false);
  const d = (await db.doc(`rateLimit/${key}`).get()).data();
  assert.strictEqual(d.count, 1);
  assert.ok(d.windowStart > 0);
});

test("RL2 successive calls under the limit keep passing and keep counting", async () => {
  const key = `rl_${nextId()}`;
  assert.strictEqual(await overLimit(key, 3, HOUR_MS), false); // 1
  assert.strictEqual(await overLimit(key, 3, HOUR_MS), false); // 2
  const d = (await db.doc(`rateLimit/${key}`).get()).data();
  assert.strictEqual(d.count, 2);
});

test("RL3 the call that reaches the limit exactly is refused", async () => {
  const key = `rl_${nextId()}`;
  assert.strictEqual(await overLimit(key, 3, HOUR_MS), false); // 1
  assert.strictEqual(await overLimit(key, 3, HOUR_MS), false); // 2
  assert.strictEqual(await overLimit(key, 3, HOUR_MS), false); // 3 → count hits 3
  assert.strictEqual(await overLimit(key, 3, HOUR_MS), true); // refused
  // Refusing must not also increment — otherwise a client hammering the
  // endpoint would push the window's count arbitrarily high for no reason.
  const d = (await db.doc(`rateLimit/${key}`).get()).data();
  assert.strictEqual(d.count, 3);
});

test("RL4 an elapsed window resets instead of staying locked out", async () => {
  // Without this, a user who tripped the limit once would be silenced forever.
  const key = `rl_${nextId()}`;
  const stale = Date.now() - HOUR_MS - 1000;
  await db.doc(`rateLimit/${key}`).set({windowStart: stale, count: 3});
  assert.strictEqual(await overLimit(key, 3, HOUR_MS), false);
  const d = (await db.doc(`rateLimit/${key}`).get()).data();
  assert.strictEqual(d.count, 1);
  assert.ok(d.windowStart > stale, "windowStart should have moved to now");
});
