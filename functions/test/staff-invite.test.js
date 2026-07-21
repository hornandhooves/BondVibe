/**
 * Integration tests for fix/staff-invite-email-verified (QA P1), against the
 * Firebase Emulator Suite (functions + firestore + auth).
 *
 *   npm run test:payments   (runs everything under functions/test/)
 *
 * P1: staff invites could be HIJACKED. inviteBusinessStaff creates a "pending"
 * invite for an email with no account; claimStaffInvites read the caller's email
 * from the token WITHOUT checking email_verified, so an attacker who registered a
 * Firebase account with the invitee's email (email_verified:false) could claim →
 * respond → become ACTIVE staff of a business they don't belong to.
 *
 * The fix gates all three callables on email_verified === true, and validates the
 * role against the business's REAL assignable set (never "owner"/"admin"). These
 * tests cover: the gate on each callable, role rejection, the honest happy path
 * (invite → claim → accept), and role-skip on claim.
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
const nextId = () => `si${Date.now()}_${uniq++}`;

/**
 * Emulator user with a chosen emailVerified state; returns its ID token. The
 * token's email_verified claim mirrors the account, which is what the callables
 * gate on. An explicit `email` lets the invitee's account match the invited
 * address (invites are keyed by email, not uid).
 * @param {string} uid desired uid
 * @param {object} [opts] options
 * @param {boolean} [opts.verified] emailVerified state (default true)
 * @param {string} [opts.email] override the account email
 * @return {Promise<string>} the user's ID token
 */
async function tokenFor(uid, {verified = true, email} = {}) {
  const mail = (email || `${uid}@kinlo.test`).toLowerCase();
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email: mail, password, emailVerified: verified});
  } catch (e) {
    await admin.auth().updateUser(uid, {email: mail, password, emailVerified: verified});
  }
  const r = await fetch(`${IDT}:signInWithPassword?key=fake-api-key`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email: mail, password, returnSecureToken: true}),
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
// email_verified gate on each callable (P1)
// ===========================================================================

test("SI1 inviteBusinessStaff rejects an UNVERIFIED owner (email_not_verified)", async () => {
  const token = await tokenFor(`owner_${nextId()}`, {verified: false});
  const res = await post("inviteBusinessStaff",
    {data: {email: `x_${nextId()}@kinlo.test`, role: "reception"}}, token);
  assert.strictEqual(res.status, 403);
  assert.match(JSON.stringify(res.body), /email_not_verified/);
});

test("SI2 claimStaffInvites rejects an UNVERIFIED caller (the hijack entry point)", async () => {
  const token = await tokenFor(`squatter_${nextId()}`, {verified: false});
  const res = await post("claimStaffInvites", {data: {}}, token);
  assert.strictEqual(res.status, 403);
  assert.match(JSON.stringify(res.body), /email_not_verified/);
});

test("SI3 respondToStaffInvite rejects an UNVERIFIED caller (last gate before active)", async () => {
  const token = await tokenFor(`squatter_${nextId()}`, {verified: false});
  const res = await post("respondToStaffInvite",
    {data: {bizId: `biz_${nextId()}`, accept: true}}, token);
  assert.strictEqual(res.status, 403);
  assert.match(JSON.stringify(res.body), /email_not_verified/);
});

// ===========================================================================
// role allowlist (P1 #2) — block privesc roles, keep the real set
// ===========================================================================

test("SI4 inviteBusinessStaff rejects role 'owner' (ownership privesc)", async () => {
  const token = await tokenFor(`owner_${nextId()}`, {verified: true});
  const res = await post("inviteBusinessStaff",
    {data: {email: `x_${nextId()}@kinlo.test`, role: "owner"}}, token);
  assert.strictEqual(res.status, 400);
  assert.match(JSON.stringify(res.body), /invalid_role/);
});

test("SI5 inviteBusinessStaff rejects role 'Admin' (case-insensitive, platform privesc)", async () => {
  const token = await tokenFor(`owner_${nextId()}`, {verified: true});
  const res = await post("inviteBusinessStaff",
    {data: {email: `x_${nextId()}@kinlo.test`, role: "Admin"}}, token);
  assert.strictEqual(res.status, 400);
  assert.match(JSON.stringify(res.body), /invalid_role/);
});

test("SI6 inviteBusinessStaff rejects an unknown role (not built-in, no such custom role)", async () => {
  const token = await tokenFor(`owner_${nextId()}`, {verified: true});
  const res = await post("inviteBusinessStaff",
    {data: {email: `x_${nextId()}@kinlo.test`, role: "superuser"}}, token);
  assert.strictEqual(res.status, 400);
  assert.match(JSON.stringify(res.body), /invalid_role/);
});

test("SI7 inviteBusinessStaff ACCEPTS a real custom role the business defined", async () => {
  const ownerUid = `owner_${nextId()}`;
  const token = await tokenFor(ownerUid, {verified: true});
  // Owner defines a custom role (Firestore auto-id, mixed case) under their biz.
  const roleRef = await db.collection("businesses").doc(ownerUid)
    .collection("roles").add({name: "Trainer", editableName: true, removable: true, perms: {}});
  const res = await post("inviteBusinessStaff",
    {data: {email: `x_${nextId()}@kinlo.test`, role: roleRef.id}}, token);
  assert.strictEqual(res.status, 200);
  assert.match(JSON.stringify(res.body), new RegExp(roleRef.id));
});

// ===========================================================================
// the honest happy path stays green (verified invite → claim → accept)
// ===========================================================================

test("SI8 happy path: verified owner invites → verified invitee claims → accepts → ACTIVE", async () => {
  const ownerUid = `owner_${nextId()}`;
  const ownerToken = await tokenFor(ownerUid, {verified: true});
  const staffEmail = `newstaff_${nextId()}@kinlo.test`;

  // 1) Invite an email with NO account yet → a pending staffInvite is stored.
  const inv = await post("inviteBusinessStaff",
    {data: {email: staffEmail, role: "reception"}}, ownerToken);
  assert.strictEqual(inv.status, 200);
  assert.match(JSON.stringify(inv.body), /"pending":true/);

  // 2) The real invitee now registers with that email (verified) and claims.
  const inviteeUid = `staff_${nextId()}`;
  const inviteeToken = await tokenFor(inviteeUid, {verified: true, email: staffEmail});
  const claim = await post("claimStaffInvites", {data: {}}, inviteeToken);
  assert.strictEqual(claim.status, 200);
  assert.match(JSON.stringify(claim.body), /"claimed":1/);

  // The staff record exists but is NOT active yet (consent still required).
  const staffRef = db.collection("businesses").doc(ownerUid).collection("staff").doc(inviteeUid);
  let staff = (await staffRef.get()).data();
  assert.strictEqual(staff.status, "invited");
  assert.strictEqual(staff.role, "reception");

  // 3) Invitee accepts → active.
  const resp = await post("respondToStaffInvite",
    {data: {bizId: ownerUid, accept: true}}, inviteeToken);
  assert.strictEqual(resp.status, 200);
  assert.match(JSON.stringify(resp.body), /"status":"active"/);
  staff = (await staffRef.get()).data();
  assert.strictEqual(staff.status, "active");
});

test("SI9 claim SKIPS a poisoned invite whose stored role is forbidden ('owner')", async () => {
  const bizId = `biz_${nextId()}`;
  const inviteeUid = `staff_${nextId()}`;
  const staffEmail = `poison_${nextId()}@kinlo.test`;
  // A tampered/legacy pending invite with a forbidden role.
  await db.collection("staffInvites").doc(`${bizId}_${staffEmail}`).set({
    bizId, email: staffEmail, role: "owner", status: "pending", invitedBy: bizId,
  });
  const inviteeToken = await tokenFor(inviteeUid, {verified: true, email: staffEmail});

  const claim = await post("claimStaffInvites", {data: {}}, inviteeToken);
  assert.strictEqual(claim.status, 200);
  assert.match(JSON.stringify(claim.body), /"claimed":0/, "forbidden-role invite is not claimed");
  // No staff record was materialized.
  const staffSnap = await db.collection("businesses").doc(bizId).collection("staff").doc(inviteeUid).get();
  assert.strictEqual(staffSnap.exists, false);
});
