/**
 * Integration tests for feat/host-approval-gate — the host grant moves entirely
 * behind admin approval. Runs against the Firebase Emulator Suite (functions +
 * firestore + auth):
 *
 *   npm run test:payments
 *
 * The security invariant under test: role:"host" is reachable ONLY through
 * approveHostRequest (admin). A normal authenticated user cannot self-grant
 * hosting via the direct callable API — the bug the UI change alone would NOT
 * have closed. The mandated negative cases (a–e):
 *   (a) a pending request does NOT make the applicant a host (no self-grant);
 *   (b) approveHostRequest and rejectHostRequest reject a non-admin caller;
 *   (c) reject leaves the applicant's role intact (no lingering host access);
 *   (d) approveHostRequest is the ONLY onboarding path to role:"host";
 *   (e) activateHost invoked by a normal user → permission-denied.
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
const nextId = () => `ha${Date.now()}_${uniq++}`;

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

// Seed an applicant: a real Auth user (verified by default — approveHostRequest
// re-checks the applicant's Auth record) + a Firestore user doc + a pending host
// request. Pass {verified: false} to seed an unverified applicant.
const seedApplicant = async (over = {}) => {
  const applicantUid = `applicant_${nextId()}`;
  const verified = over.verified !== false;
  try {
    await admin.auth().createUser({
      uid: applicantUid,
      email: `${applicantUid}@kinlo.test`,
      password: "Test123456!",
      emailVerified: verified,
    });
  } catch (e) {
    await admin.auth().updateUser(applicantUid, {emailVerified: verified});
  }
  await db.collection("users").doc(applicantUid).set({
    role: "user", emailVerified: verified, ...(over.user || {}),
  });
  const reqRef = await db.collection("hostRequests").add({
    userId: applicantUid,
    communityType: "sports",
    description: "x".repeat(130),
    status: "pending",
    createdAt: new Date().toISOString(),
    ...(over.request || {}),
  });
  return {applicantUid, requestId: reqRef.id};
};

const roleOf = async (uid) =>
  ((await db.collection("users").doc(uid).get()).data() || {}).role;
const userDoc = async (uid) =>
  (await db.collection("users").doc(uid).get()).data() || {};
const latestNotif = async (uid) => {
  const s = await db.collection("notifications").where("userId", "==", uid).get();
  return s.docs.map((d) => d.data());
};

// ===========================================================================
// (a) A pending request does NOT grant hosting — no self-grant on submit.
// ===========================================================================
test("HA-a: a pending host request leaves the applicant role !== host", async () => {
  const {applicantUid} = await seedApplicant();
  // Nothing but the admin approval may change the role: it's still "user".
  assert.strictEqual(await roleOf(applicantUid), "user");
  const doc = await userDoc(applicantUid);
  assert.notStrictEqual(doc.role, "host");
  assert.strictEqual(doc.hostApproved, undefined);
});

// ===========================================================================
// (b) approve / reject reject a non-admin caller.
// ===========================================================================
test("HA-b1: approveHostRequest denies a non-admin", async () => {
  const {requestId} = await seedApplicant();
  const token = await tokenFor(`u_${nextId()}`, {isAdmin: false});
  const res = await callFn("approveHostRequest", {requestId}, token);
  assert.strictEqual(res.status, 403);
  assert.match(JSON.stringify(res.body), /admin only/i);
});

test("HA-b2: rejectHostRequest denies a non-admin", async () => {
  const {requestId} = await seedApplicant();
  const token = await tokenFor(`u_${nextId()}`, {isAdmin: false});
  const res = await callFn("rejectHostRequest", {requestId, reason: "no"}, token);
  assert.strictEqual(res.status, 403);
});

test("HA-b3: a non-admin cannot approve their OWN pending request", async () => {
  const applicantUid = `selfapprove_${nextId()}`;
  await db.collection("users").doc(applicantUid).set({role: "user"});
  const reqRef = await db.collection("hostRequests").add({
    userId: applicantUid, status: "pending", createdAt: new Date().toISOString(),
  });
  const token = await tokenFor(applicantUid, {isAdmin: false});
  const res = await callFn("approveHostRequest", {requestId: reqRef.id}, token);
  assert.strictEqual(res.status, 403);
  assert.strictEqual(await roleOf(applicantUid), "user");
});

// ===========================================================================
// (c) reject leaves role intact and grants no access; stamps reason + notif.
// ===========================================================================
test("HA-c: reject sets status+reason, leaves role untouched, notifies", async () => {
  const {applicantUid, requestId} = await seedApplicant();
  const adminToken = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn(
    "rejectHostRequest", {requestId, reason: "Need more detail."}, adminToken);
  assert.strictEqual(res.status, 200);
  // role untouched — the whole point of the fix.
  assert.strictEqual(await roleOf(applicantUid), "user");
  const req = (await db.collection("hostRequests").doc(requestId).get()).data();
  assert.strictEqual(req.status, "rejected");
  assert.strictEqual(req.rejectionReason, "Need more detail.");
  const notifs = await latestNotif(applicantUid);
  assert.ok(notifs.some((n) => n.type === "host_rejected"));
});

// ===========================================================================
// (d) approveHostRequest is the ONLY onboarding path to role:"host".
// ===========================================================================
test("HA-d: approveHostRequest grants role:host + free hostConfig + notif", async () => {
  const {applicantUid, requestId} = await seedApplicant();
  const adminToken = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn(
    "approveHostRequest", {requestId, message: "Welcome!"}, adminToken);
  assert.strictEqual(res.status, 200);
  const doc = await userDoc(applicantUid);
  assert.strictEqual(doc.role, "host");
  assert.strictEqual(doc.hostConfig.type, "free");
  assert.strictEqual(doc.hostConfig.canCreatePaidEvents, false);
  const req = (await db.collection("hostRequests").doc(requestId).get()).data();
  assert.strictEqual(req.status, "approved");
  assert.ok(req.approvedBy && req.approvedAt);
  const notifs = await latestNotif(applicantUid);
  assert.ok(notifs.some((n) => n.type === "host_approved"));
});

test("HA-d2: approve preserves an admin applicant's role (no degrade)", async () => {
  const {applicantUid, requestId} = await seedApplicant({user: {role: "admin"}});
  const adminToken = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("approveHostRequest", {requestId}, adminToken);
  assert.strictEqual(res.status, 200);
  const doc = await userDoc(applicantUid);
  assert.strictEqual(doc.role, "admin"); // not downgraded to host
  assert.strictEqual(doc.hostApproved, true);
});

// ===========================================================================
// (f) INVARIANT: an unverified applicant can't be granted host (email gate).
// ===========================================================================
test("HA-f: approveHostRequest rejects an applicant with an unverified email", async () => {
  const {applicantUid, requestId} = await seedApplicant({verified: false});
  const adminToken = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("approveHostRequest", {requestId}, adminToken);
  assert.strictEqual(res.status, 400); // failed-precondition → 400
  assert.match(JSON.stringify(res.body), /email_not_verified/);
  // No grant happened — still a plain user, request still pending.
  assert.strictEqual(await roleOf(applicantUid), "user");
  const req = (await db.collection("hostRequests").doc(requestId).get()).data();
  assert.strictEqual(req.status, "pending");
});

// ===========================================================================
// (e) activateHost invoked by a normal user → permission-denied.
// ===========================================================================
test("HA-e: activateHost by a normal user is permission-denied", async () => {
  const uid = `normal_${nextId()}`;
  await db.collection("users").doc(uid).set({role: "user"});
  const token = await tokenFor(uid, {isAdmin: false});
  const res = await callFn("activateHost", {type: "free"}, token);
  assert.strictEqual(res.status, 403);
  assert.match(JSON.stringify(res.body), /admin only/i);
  // The direct-API self-grant is closed: role is still "user".
  assert.strictEqual(await roleOf(uid), "user");
});

test("HA-e2: activateHost by an admin (with targetUid) still works", async () => {
  const target = `target_${nextId()}`;
  await db.collection("users").doc(target).set({role: "user"});
  const adminToken = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("activateHost", {type: "free", targetUid: target}, adminToken);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await roleOf(target), "host");
});
