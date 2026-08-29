/**
 * KIN-244/245/246 — the three notification gaps in the staff lifecycle,
 * against the Firebase Emulator Suite (functions + firestore + auth):
 *
 *   npm run test:payments   (runs everything under functions/test/)
 *
 * Invite already had an in-app notification (KIN-238); this closes: invite's
 * missing push, accept/decline notifying nobody, and remove notifying nobody.
 * The trickiest part is onStaffWritten: it fires identically whether the
 * invitee declined (doc deleted) or the owner removed them (doc also
 * deleted) — SL5 is the test that pins the two are told apart correctly and
 * that a decline never produces two notifications.
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
const nextId = () => `sl${Date.now()}_${uniq++}`;

/**
 * Same helper as staff-invite.test.js (see that file for the full rationale),
 * plus an optional `language` to seed `users/{uid}.language` for the locale
 * tests here.
 * @param {string} uid desired uid
 * @param {object} [opts] options
 * @param {boolean} [opts.verified] emailVerified state (default true)
 * @param {string} [opts.email] override the account email
 * @param {string} [opts.language] if given, sets users/{uid}.language
 * @return {Promise<string>} the user's ID token
 */
async function tokenFor(uid, {verified = true, email, language} = {}) {
  const mail = (email || `${uid}@kinlo.test`).toLowerCase();
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email: mail, password, emailVerified: verified});
  } catch (e) {
    await admin.auth().updateUser(uid, {email: mail, password, emailVerified: verified});
  }
  if (language) await db.collection("users").doc(uid).set({language}, {merge: true});
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

const notifsFor = async (uid, type) => {
  let q = db.collection("notifications").where("userId", "==", uid);
  if (type) q = q.where("type", "==", type);
  return (await q.get()).docs.map((d) => d.data());
};

/**
 * Invite `targetUid` by handle from `ownerUid`.
 * @param {string} ownerUid the inviting owner's uid
 * @param {string} ownerToken the owner's ID token
 * @param {string} targetUid the invitee's uid
 * @param {string} [role] the role to grant
 * @return {Promise<object>} the callable's result payload
 */
async function inviteByHandle(ownerUid, ownerToken, targetUid, role = "reception") {
  const handle = `h_${targetUid}`;
  await db.collection("handles").doc(handle).set({uid: targetUid});
  const res = await post("inviteBusinessStaff", {data: {handle, role}}, ownerToken);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  return res.body.result;
}

// ===========================================================================
// SL1 — Invitar (KIN-244): the invitee is notified, the owner is not.
// ===========================================================================

test("SL1 inviting by handle notifies the invitee (staff_invite), not the owner", async () => {
  const ownerUid = `owner_${nextId()}`;
  const ownerToken = await tokenFor(ownerUid, {verified: true});
  const targetUid = `staff_${nextId()}`;
  await tokenFor(targetUid, {verified: true});

  await inviteByHandle(ownerUid, ownerToken, targetUid);

  const invited = await notifsFor(targetUid, "staff_invite");
  assert.strictEqual(invited.length, 1);
  assert.strictEqual(invited[0].userId, targetUid);

  const ownerGotAnything = await notifsFor(ownerUid);
  assert.strictEqual(ownerGotAnything.length, 0, "the inviting owner must not be notified of their own action");
});

// ===========================================================================
// SL2 — Aceptar (KIN-246): the owner (invitedBy) is notified, the acceptor
// is not notified of their own acceptance.
// ===========================================================================

test("SL2 accepting notifies the owner (staff_accepted), not the acceptor", async () => {
  const ownerUid = `owner_${nextId()}`;
  const ownerToken = await tokenFor(ownerUid, {verified: true});
  const targetUid = `staff_${nextId()}`;
  const targetToken = await tokenFor(targetUid, {verified: true});

  await inviteByHandle(ownerUid, ownerToken, targetUid, "instructor");

  const resp = await post("respondToStaffInvite", {data: {bizId: ownerUid, accept: true}}, targetToken);
  assert.strictEqual(resp.status, 200);
  assert.strictEqual(resp.body.result.status, "active");

  const ownerNotifs = await notifsFor(ownerUid, "staff_accepted");
  assert.strictEqual(ownerNotifs.length, 1);
  assert.strictEqual(ownerNotifs[0].params.role, "instructor");
  assert.match(ownerNotifs[0].title, /accepted/i);

  const acceptorGotAccepted = await notifsFor(targetUid, "staff_accepted");
  assert.strictEqual(acceptorGotAccepted.length, 0, "the acceptor must not be notified of their own acceptance");

  // KIN-245's trigger must NOT treat "invited -> active" as a removal.
  const acceptorGotRemoved = await notifsFor(targetUid, "staff_removed");
  assert.strictEqual(acceptorGotRemoved.length, 0);
});

test("SL2b the owner's stored language is respected for the accepted notification", async () => {
  const ownerUid = `owner_${nextId()}`;
  const ownerToken = await tokenFor(ownerUid, {verified: true, language: "es"});
  const targetUid = `staff_${nextId()}`;
  const targetToken = await tokenFor(targetUid, {verified: true});

  await inviteByHandle(ownerUid, ownerToken, targetUid);
  await post("respondToStaffInvite", {data: {bizId: ownerUid, accept: true}}, targetToken);

  const [n] = await notifsFor(ownerUid, "staff_accepted");
  assert.strictEqual(n.title, "Invitación aceptada ✅");
});

// ===========================================================================
// SL3/SL4 — Declinar (KIN-246): the owner is notified; the trigger fired by
// the same delete must NOT also notify (that's SL5, the sharper version).
// ===========================================================================

test("SL3 declining notifies the owner (staff_declined), not the decliner", async () => {
  const ownerUid = `owner_${nextId()}`;
  const ownerToken = await tokenFor(ownerUid, {verified: true});
  const targetUid = `staff_${nextId()}`;
  const targetToken = await tokenFor(targetUid, {verified: true});

  await inviteByHandle(ownerUid, ownerToken, targetUid, "reception");

  const resp = await post("respondToStaffInvite", {data: {bizId: ownerUid, accept: false}}, targetToken);
  assert.strictEqual(resp.status, 200);
  assert.strictEqual(resp.body.result.status, "declined");

  const ownerNotifs = await notifsFor(ownerUid, "staff_declined");
  assert.strictEqual(ownerNotifs.length, 1);
  assert.match(ownerNotifs[0].title, /declined/i);

  const declinerGotDeclined = await notifsFor(targetUid, "staff_declined");
  assert.strictEqual(declinerGotDeclined.length, 0);
});

test("SL4 responding when already handled (not status:invited) notifies nobody", async () => {
  // Idempotent-success branch (functions/index.js — the `data.status !==
  // "invited"` early return in respondToStaffInvite): already active, calling
  // accept again must not re-notify.
  const ownerUid = `owner_${nextId()}`;
  const ownerToken = await tokenFor(ownerUid, {verified: true});
  const targetUid = `staff_${nextId()}`;
  const targetToken = await tokenFor(targetUid, {verified: true});

  await inviteByHandle(ownerUid, ownerToken, targetUid);
  await post("respondToStaffInvite", {data: {bizId: ownerUid, accept: true}}, targetToken);
  const beforeCount = (await notifsFor(ownerUid, "staff_accepted")).length;
  assert.strictEqual(beforeCount, 1);

  // Same accept call again — status is already "active", idempotent no-op.
  const again = await post("respondToStaffInvite", {data: {bizId: ownerUid, accept: true}}, targetToken);
  assert.strictEqual(again.status, 200);
  assert.strictEqual(again.body.result.status, "active");

  const afterCount = (await notifsFor(ownerUid, "staff_accepted")).length;
  assert.strictEqual(afterCount, 1, "an idempotent re-accept must not send a second notification");
});

// ===========================================================================
// SL5 — the trap: distinguishing decline from removal in onStaffWritten, and
// making sure a decline is never double-notified.
// ===========================================================================

test("SL5 decline vs remove: the trigger notifies removal only, never doubles the decline", async () => {
  const ownerUid = `owner_${nextId()}`;
  const ownerToken = await tokenFor(ownerUid, {verified: true});

  // Branch A: decline. before.status === "invited" when the doc is deleted.
  const declinerUid = `staff_${nextId()}`;
  const declinerToken = await tokenFor(declinerUid, {verified: true});
  await inviteByHandle(ownerUid, ownerToken, declinerUid);
  await post("respondToStaffInvite", {data: {bizId: ownerUid, accept: false}}, declinerToken);

  // Give the async trigger a moment to run (it fires on the same delete).
  await new Promise((r) => setTimeout(r, 1500));

  const ownerDeclined = await notifsFor(ownerUid, "staff_declined");
  assert.strictEqual(ownerDeclined.length, 1, "exactly one decline notification, not doubled by the trigger");
  const declinerRemoved = await notifsFor(declinerUid, "staff_removed");
  assert.strictEqual(declinerRemoved.length, 0, "a decline must never look like a removal to the decliner");

  // Branch B: removal. before.status === "active" when the doc is deleted —
  // the client's removeStaff does a direct deleteDoc (Part B); mirrored here.
  const removedUid = `staff_${nextId()}`;
  const removedUserToken = await tokenFor(removedUid, {verified: true});
  await inviteByHandle(ownerUid, ownerToken, removedUid, "reception");
  await post("respondToStaffInvite", {data: {bizId: ownerUid, accept: true}}, removedUserToken);

  // Owner removes them — exactly what StaffScreen's removeStaff does (Part B:
  // "no hay Cloud Function de remoción... deleteDoc directo desde el cliente").
  await db.collection("businesses").doc(ownerUid).collection("staff").doc(removedUid).delete();
  await new Promise((r) => setTimeout(r, 1500));

  const removedNotifs = await notifsFor(removedUid, "staff_removed");
  assert.strictEqual(removedNotifs.length, 1, "the removed person gets exactly one removal notification");
  const ownerGotRemovedEcho = await notifsFor(ownerUid, "staff_removed");
  assert.strictEqual(ownerGotRemovedEcho.length, 0, "the owner who removed them is not notified of their own action");
});

test("SL6 the removed person's stored language is respected for the removal notification", async () => {
  const ownerUid = `owner_${nextId()}`;
  const ownerToken = await tokenFor(ownerUid, {verified: true});
  const removedUid = `staff_${nextId()}`;
  const removedToken = await tokenFor(removedUid, {verified: true, language: "es"});

  await inviteByHandle(ownerUid, ownerToken, removedUid);
  await post("respondToStaffInvite", {data: {bizId: ownerUid, accept: true}}, removedToken);
  await db.collection("businesses").doc(ownerUid).collection("staff").doc(removedUid).delete();
  await new Promise((r) => setTimeout(r, 1500));

  const [n] = await notifsFor(removedUid, "staff_removed");
  assert.strictEqual(n.title, "Ya no eres parte del equipo");
});
