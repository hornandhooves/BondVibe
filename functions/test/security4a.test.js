/**
 * Integration tests for fix/security-functions-4a — function hardening, against
 * the Firebase Emulator Suite (functions + firestore + auth).
 *
 *   npm run test:payments
 *
 * One block per fix:
 *  1. createNotification — type allowlist, per-type gate, message link-stripping.
 *  2. approveOwnerTransfer — CAS transaction stays idempotent under a re-call.
 *  3. releaseMembershipReservation — double release deducts the credit ONCE.
 *  4. joinGroupByCode — email_verified required; assignGroupInviteCode host-only.
 *  5. recordPostEvent — reach deduped per viewer.
 *  6. createLikeAndMaybeMatch — the TARGET must be checked in too.
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
const nextId = () => `s4a${Date.now()}_${uniq++}`;

const tokenFor = async (uid, {admin: adminClaim = false, verified = true} = {}) => {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: verified});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: verified});
  }
  if (adminClaim) await admin.auth().setCustomUserClaims(uid, {admin: true});
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
    headers: {
      "Content-Type": "application/json",
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify({data}),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

// ── 1. createNotification ──────────────────────────────────────────────────
test("N1 an unknown notification type is rejected (allowlist)", async () => {
  const t = await tokenFor(`nu_${nextId()}`);
  const res = await call("createNotification",
    {toUserId: `victim_${nextId()}`, type: "payout_failed",
      title: "Payout failed", message: "tap https://evil.link"}, t);
  assert.strictEqual(res.status, 400); // invalid-argument
});

test("N2 a non-admin cannot send an admin-authored type", async () => {
  const t = await tokenFor(`nu_${nextId()}`);
  const res = await call("createNotification",
    {toUserId: `victim_${nextId()}`, type: "role_change",
      title: "You are now an Admin!", message: "welcome"}, t);
  assert.strictEqual(res.status, 403); // permission-denied
});

test("N3 title is server-derived and the message is link-stripped", async () => {
  const uid = `sender_${nextId()}`;
  const to = `victim_${nextId()}`;
  const t = await tokenFor(uid);
  const res = await call("createNotification",
    {toUserId: to, type: "mention", title: "SPOOFED TITLE",
      message: "hey see http://evil.link and me@evil.com now"}, t);
  assert.strictEqual(res.status, 200);
  const snap = await db.collection("notifications")
    .where("userId", "==", to).limit(1).get();
  const n = snap.docs[0].data();
  assert.strictEqual(n.title, "You were mentioned", "client title ignored");
  assert.ok(!/evil\.link/.test(n.message), "url stripped");
  assert.ok(!/evil\.com/.test(n.message), "email stripped");
});

test("N4 the business_session_* production types are accepted", async () => {
  const t = await tokenFor(`biz_${nextId()}`);
  const to = `mbr_${nextId()}`;
  const r = await call("createNotification",
    {toUserId: to, type: "business_session_confirmed",
      body: "Your session is confirmed"}, t);
  assert.strictEqual(r.status, 200);
  const snap = await db.collection("notifications")
    .where("userId", "==", to).limit(1).get();
  assert.strictEqual(snap.docs[0].data().title, "Session confirmed");
});

// ── 2. approveOwnerTransfer ────────────────────────────────────────────────
test("OT1 approve is idempotent — a re-call doesn't re-decide", async () => {
  const bizId = `biz_${nextId()}`;
  const fromUid = `owner_${nextId()}`;
  const toUid = `newowner_${nextId()}`;
  const transferId = `tr_${nextId()}`;
  const adminUid = `adm_${nextId()}`;
  const at = await tokenFor(adminUid, {admin: true});
  await db.collection("ownerTransfers").doc(transferId).set({
    status: "pending_admin", bizId, fromUid, toUid, businessName: "Gym X",
  });
  await db.collection("businesses").doc(bizId).set({ownerUid: fromUid});

  const r1 = await call("approveOwnerTransfer", {transferId, approve: true}, at);
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r1.body.result.status, "approved");
  const biz = (await db.collection("businesses").doc(bizId).get()).data();
  assert.strictEqual(biz.ownerUid, toUid, "ownership moved");

  // Second call sees status != pending_admin → no-op, no throw.
  const r2 = await call("approveOwnerTransfer", {transferId, approve: true}, at);
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(r2.body.result.status, "approved");
});

// ── 3. releaseMembershipReservation ────────────────────────────────────────
test("RM1 a double release deducts the credit exactly once", async () => {
  const uid = `mem_${nextId()}`;
  const t = await tokenFor(uid);
  const membershipId = `ms_${nextId()}`;
  const eventId = `ev_${nextId()}`;
  const reservationId = `rv_${nextId()}`;
  await db.collection("memberships").doc(membershipId).set({
    userId: uid, type: "credits", creditsRemaining: 5, status: "active",
  });
  // Event starts in 1h → inside the 2h cancellation window → forfeit branch.
  await db.collection("events").doc(eventId).set({
    date: new Date(Date.now() + 3600000).toISOString(), creatorId: "host",
  });
  await db.collection("membershipReservations").doc(reservationId).set({
    userId: uid, hostId: "host", membershipId, eventId,
    creditCost: 1, status: "reserved",
  });

  const [a, b] = await Promise.all([
    call("releaseMembershipReservation", {reservationId}, t),
    call("releaseMembershipReservation", {reservationId}, t),
  ]);
  assert.strictEqual(a.status, 200);
  assert.strictEqual(b.status, 200);
  const mem = (await db.collection("memberships").doc(membershipId).get()).data();
  assert.strictEqual(mem.creditsRemaining, 4, "deducted once, not twice");
});

// ── 4. joinGroupByCode + assignGroupInviteCode ─────────────────────────────
test("JG1 an unverified email cannot join by code", async () => {
  const t = await tokenFor(`unv_${nextId()}`, {verified: false});
  const res = await call("joinGroupByCode", {code: "ABC234"}, t);
  assert.strictEqual(res.status, 403); // email_not_verified
});

test("JG2 assignGroupInviteCode is host-only and mints a 6-char code", async () => {
  const host = `host_${nextId()}`;
  const other = `other_${nextId()}`;
  const groupId = `grp_${nextId()}`;
  await db.collection("hostGroups").doc(groupId).set({hostId: host, name: "G"});
  const ht = await tokenFor(host);
  const ot = await tokenFor(other);

  const denied = await call("assignGroupInviteCode", {groupId}, ot);
  assert.strictEqual(denied.status, 403, "non-host denied");

  const ok = await call("assignGroupInviteCode", {groupId}, ht);
  assert.strictEqual(ok.status, 200);
  assert.match(ok.body.result.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

  // A verified member can now join with that code.
  const joiner = await tokenFor(`joiner_${nextId()}`);
  const joined = await call("joinGroupByCode",
    {code: ok.body.result.code}, joiner);
  assert.strictEqual(joined.status, 200);
  assert.strictEqual(joined.body.result.groupId, groupId);
});

// ── 5. recordPostEvent ──────────────────────────────────────────────────────
test("PS1 reach is deduped per viewer", async () => {
  const author = `auth_${nextId()}`;
  const postId = `post_${nextId()}`;
  await db.collection("posts").doc(postId).set({authorId: author});
  const v1 = await tokenFor(`v1_${nextId()}`);
  const v2 = await tokenFor(`v2_${nextId()}`);

  await call("recordPostEvent", {postId, type: "view"}, v1);
  await call("recordPostEvent", {postId, type: "view"}, v1); // repeat → no-op
  let stats = (await db.collection("postStats").doc(postId).get()).data();
  assert.strictEqual(stats.views, 1, "same viewer counts once");

  await call("recordPostEvent", {postId, type: "view"}, v2);
  stats = (await db.collection("postStats").doc(postId).get()).data();
  assert.strictEqual(stats.views, 2, "a distinct viewer adds one");
});

// ── 6. createLikeAndMaybeMatch ─────────────────────────────────────────────
test("LK1 the TARGET must also be checked in", async () => {
  const from = `liker_${nextId()}`;
  const toUid = `target_${nextId()}`;
  const eventId = `mev_${nextId()}`;
  const t = await tokenFor(from);
  await db.collection("events").doc(eventId).set({
    creatorId: "host", matching: {enabled: true, maxMatches: 20},
  });
  // Only the caller is checked in.
  await db.collection("events").doc(eventId)
    .collection("checkins").doc(from).set({at: Date.now()});

  const denied = await call("createLikeAndMaybeMatch", {eventId, toUid}, t);
  assert.strictEqual(denied.status, 400);
  assert.match(JSON.stringify(denied.body), /target_not_checked_in/);

  // Once the target checks in too, the like goes through.
  await db.collection("events").doc(eventId)
    .collection("checkins").doc(toUid).set({at: Date.now()});
  const ok = await call("createLikeAndMaybeMatch", {eventId, toUid}, t);
  assert.strictEqual(ok.status, 200);
});
