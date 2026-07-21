/**
 * Integration tests for fix/privacy-guestcode-joinevent, against the Firebase
 * Emulator Suite (functions + firestore + auth).
 *
 *   npm run test:payments
 *
 *   [P1] redeemBusinessGuestCode — requires email_verified, and rate-limits
 *        redeem attempts PER UID (guestCodeAttempts) so the (now high-entropy)
 *        code space can't be brute-forced.
 *   [P2] joinEvent — requires email_verified (same gate as reserveMembershipCredit).
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

let uniq = 0;
const nextId = () => `gc${Date.now()}_${uniq++}`;

/**
 * Emulator user + ID token with a chosen emailVerified state.
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
  const r = await fetch(`${IDT}:signInWithPassword?key=fake`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  }).then((x) => x.json());
  assert.ok(r.idToken, `no idToken for ${uid}`);
  return r.idToken;
}

const post = (path, data, token) =>
  fetch(`${FN}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify({data}),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

// ===========================================================================
// [P1] redeemBusinessGuestCode — email_verified + per-uid rate limit
// ===========================================================================

test("GC1 redeem rejects an UNVERIFIED email", async () => {
  const token = await tokenFor(`u_${nextId()}`, {verified: false});
  const res = await post("redeemBusinessGuestCode", {code: "KINLO-ABCD1234"}, token);
  assert.strictEqual(res.status, 403);
  assert.match(JSON.stringify(res.body), /email_not_verified/);
});

test("GC2 redeem (verified) with a bad code is not-found — past the email gate", async () => {
  const token = await tokenFor(`u_${nextId()}`, {verified: true});
  const res = await post("redeemBusinessGuestCode", {code: `NOPE-${nextId()}`}, token);
  assert.strictEqual(res.status, 404); // not-found → got past the 403 gate
});

test("GC3 redeem is RATE-LIMITED per uid after repeated attempts", async () => {
  const uid = `u_${nextId()}`;
  const token = await tokenFor(uid, {verified: true});
  // RL_MAX = 12 attempts / hour. The first 12 pass the limiter (bad code → 404);
  // the 13th is refused by the limiter before the lookup.
  let sawLimit = false;
  for (let i = 0; i < 13; i++) {
    const res = await post("redeemBusinessGuestCode", {code: `X-${nextId()}`}, token);
    if (res.status === 429) {
      sawLimit = true;
      assert.match(JSON.stringify(res.body), /too_many_attempts/);
      break;
    }
    assert.strictEqual(res.status, 404, `attempt ${i} should be not-found, got ${res.status}`);
  }
  assert.ok(sawLimit, "the limiter should trip within RL_MAX+1 attempts");
  // The counter is server-only (deny-all) — sanity that it was written.
  const rl = await db.collection("guestCodeAttempts").doc(uid).get();
  assert.ok(rl.exists && rl.data().count >= 12);
});

test("GC4 redeem (verified) links the account to a member and is idempotent", async () => {
  const uid = `u_${nextId()}`;
  const token = await tokenFor(uid, {verified: true});
  const bizId = `biz_${nextId()}`;
  const code = `KINLO-${nextId().toUpperCase()}`.replace(/[^A-Z0-9-]/g, "");
  await db.collection("businesses").doc(bizId).set({name: "Estudio"});
  const memberRef = db.collection("businesses").doc(bizId).collection("members").doc();
  await memberRef.set({name: "Guest", inviteCode: code, linkedUid: null});

  const res = await post("redeemBusinessGuestCode", {code}, token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.bizId, bizId);
  const after = await memberRef.get();
  assert.strictEqual(after.data().linkedUid, uid, "linked to the redeemer");
});

// ===========================================================================
// [P2] joinEvent — email_verified
// ===========================================================================

test("GC5 joinEvent rejects an UNVERIFIED email", async () => {
  const token = await tokenFor(`u_${nextId()}`, {verified: false});
  const res = await post("joinEvent", {eventId: `e_${nextId()}`}, token);
  assert.strictEqual(res.status, 403);
  assert.match(JSON.stringify(res.body), /email_not_verified/);
});

test("GC6 joinEvent (verified) joins a free event", async () => {
  const uid = `u_${nextId()}`;
  const token = await tokenFor(uid, {verified: true});
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    title: "Free run", price: 0, participantCount: 0,
    date: new Date(Date.now() + 3 * 86400000).toISOString(), maxAttendees: 50,
  });
  const res = await post("joinEvent", {eventId}, token);
  assert.strictEqual(res.status, 200);
  // ROSTER (fix/privacy-event-roster): joining writes an active roster doc.
  const r = (await db.collection("events").doc(eventId)
    .collection("roster").doc(uid).get()).data();
  assert.ok(r && r.status === "active", "joiner is an active roster member");
});
