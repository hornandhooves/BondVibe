/**
 * KIN-117 — moderation console backend: moderateReport (admin-gated, both
 * "take" and "resolve" go through this one callable so reviewedBy/reviewedAt
 * are always the CALLER's own identity) + onReportCreated (admin notify
 * trigger, deterministic doc id so a Firestore at-least-once retry never
 * duplicates the notification — the open bug against escrow.js's
 * notifyPayoutStuck, KIN-111, deliberately not repeated here).
 *
 *   npm run test:payments
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
const nextId = () => `k117_${Date.now()}_${uniq++}`;

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
      ...(token ? {"Authorization": `Bearer ${token}`} : {}),
    },
    body: JSON.stringify({data}),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

const seedReport = async (over = {}) => {
  const id = `report_${nextId()}`;
  await db.collection("reports").doc(id).set({
    reporterId: `reporter_${nextId()}`,
    type: "user",
    status: "open",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...over,
  });
  return id;
};

// ===========================================================================
// moderateReport — auth gate
// ===========================================================================

test("K117-1 moderateReport denies a non-admin", async () => {
  const reportId = await seedReport();
  const token = await tokenFor(`u_${nextId()}`, {isAdmin: false});
  const res = await callFn("moderateReport", {reportId, action: "take"}, token);
  assert.strictEqual(res.status, 403);
});

// ===========================================================================
// moderateReport — take / resolve, server-stamped identity
// ===========================================================================

test("K117-2 'take': takenBy is the CALLER's uid, never a client-supplied value; reviewedBy stays unset", async () => {
  const reportId = await seedReport();
  const adminUid = `admin_${nextId()}`;
  const token = await tokenFor(adminUid, {isAdmin: true});
  // Attempt to spoof takenBy via the payload — must be ignored.
  const res = await callFn(
    "moderateReport", {reportId, action: "take", takenBy: "someone_else"}, token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.status, "in_review");
  const after = await db.collection("reports").doc(reportId).get();
  assert.strictEqual(after.data().status, "in_review");
  assert.strictEqual(after.data().takenBy, adminUid, "takenBy must be the caller, not the payload");
  assert.strictEqual(
    after.data().reviewedBy, undefined,
    "'take' must not write reviewedBy — that's a separate field 'resolve' owns (QA fix #4)",
  );
});

test("K117-2b take then resolve by a DIFFERENT admin keeps both audit fields independently", async () => {
  const reportId = await seedReport();
  const takerUid = `admin_${nextId()}`;
  const resolverUid = `admin_${nextId()}`;
  const takerToken = await tokenFor(takerUid, {isAdmin: true});
  const resolverToken = await tokenFor(resolverUid, {isAdmin: true});

  await callFn("moderateReport", {reportId, action: "take"}, takerToken);
  await callFn(
    "moderateReport",
    {reportId, action: "resolve", resolution: "action_taken", adminNotes: "handled"},
    resolverToken,
  );

  const after = await db.collection("reports").doc(reportId).get();
  assert.strictEqual(after.data().takenBy, takerUid, "who took the case must survive the resolve");
  assert.strictEqual(after.data().reviewedBy, resolverUid, "who resolved it is a distinct admin");
  assert.strictEqual(after.data().status, "resolved");
});

test("K117-3 'resolve': writes resolution + adminNotes, reviewedBy = caller", async () => {
  const reportId = await seedReport();
  const adminUid = `admin_${nextId()}`;
  const token = await tokenFor(adminUid, {isAdmin: true});
  const res = await callFn("moderateReport", {
    reportId, action: "resolve", resolution: "action_taken", adminNotes: "banned the user",
  }, token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.status, "resolved");
  const after = await db.collection("reports").doc(reportId).get();
  assert.strictEqual(after.data().status, "resolved");
  assert.strictEqual(after.data().resolution, "action_taken");
  assert.strictEqual(after.data().adminNotes, "banned the user");
  assert.strictEqual(after.data().reviewedBy, adminUid);
});

test("K117-4 resolving an already-resolved report is a no-op", async () => {
  const reportId = await seedReport({
    status: "resolved", resolution: "duplicate", reviewedBy: "admin_orig",
  });
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("moderateReport", {
    reportId, action: "resolve", resolution: "action_taken", adminNotes: "should not apply",
  }, token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.alreadyResolved, true);
  const after = await db.collection("reports").doc(reportId).get();
  assert.strictEqual(after.data().resolution, "duplicate", "must not overwrite the original resolution");
  assert.strictEqual(after.data().reviewedBy, "admin_orig", "must not overwrite who originally resolved it");
});

test("K117-5 'take' on an already-resolved report is also a no-op (can't reopen)", async () => {
  const reportId = await seedReport({
    status: "resolved", resolution: "no_violation", reviewedBy: "admin_orig",
  });
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn("moderateReport", {reportId, action: "take"}, token);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.result.alreadyResolved, true);
  const after = await db.collection("reports").doc(reportId).get();
  assert.strictEqual(after.data().status, "resolved", "must not reopen a resolved case");
});

test("K117-6 an unknown reportId is 404", async () => {
  const token = await tokenFor(`admin_${nextId()}`, {isAdmin: true});
  const res = await callFn(
    "moderateReport", {reportId: `missing_${nextId()}`, action: "take"}, token);
  assert.strictEqual(res.status, 404);
});

// ===========================================================================
// onReportCreated — deterministic id, idempotent
// ===========================================================================

test("K117-7 onReportCreated: re-firing the trigger for the SAME reportId never duplicates it", async () => {
  // QA review: the previous version of this test wrote the notification doc
  // itself twice with .set() and asserted one — that only proves Firestore's
  // .set() is idempotent, not that onReportCreated IS. It would stay green
  // even if the trigger were changed to .add() (the exact bug this test
  // exists to prevent, mirroring KIN-111's notifyPayoutStuck). This version
  // makes the TRIGGER itself run twice for the same reportId: delete the
  // /reports doc and recreate it with the identical id — a real Firestore
  // document-create event the trigger genuinely re-fires for.
  const adminUid = `admin_${nextId()}`;
  await db.collection("users").doc(adminUid).set({role: "admin"});
  const reportId = `report_${nextId()}`;
  const notifRef = db.collection("notifications").doc(`reportNew_${reportId}_${adminUid}`);
  const reportRef = db.collection("reports").doc(reportId);

  const seed = () => reportRef.set({
    reporterId: `reporter_${nextId()}`,
    type: "user",
    status: "open",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const waitForNotif = async () => {
    for (let i = 0; i < 25; i++) {
      const snap = await notifRef.get();
      if (snap.exists) return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  };

  await seed();
  assert.ok(await waitForNotif(), "onReportCreated must fire on the first create");

  // Delete + recreate the SAME reportId — a genuine second "create" event.
  await reportRef.delete();
  await seed();

  // Poll the count across a few checks (not a single fixed sleep) to catch
  // a duplicate that lands slightly late. Filters on userId too — the shared
  // emulator DB accumulates OTHER admins from earlier tests in a full suite
  // run, and onReportCreated legitimately notifies every one of them for
  // the same reportId (correct multi-admin fan-out, not a duplicate).
  let finalCount = 0;
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await db.collection("notifications")
      .where("metadata.reportId", "==", reportId)
      .where("userId", "==", adminUid)
      .get();
    finalCount = snap.size;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.strictEqual(
    finalCount, 1,
    "the same reportId+admin must still yield only one notification doc after the trigger re-fires",
  );
});

test("K117-8 a real report write fires onReportCreated, notifying every admin once", async () => {
  const adminUid = `admin_${nextId()}`;
  await db.collection("users").doc(adminUid).set({role: "admin"});
  const reportId = await seedReport();

  let found = null;
  for (let i = 0; i < 25; i++) {
    const snap = await db.collection("notifications").doc(`reportNew_${reportId}_${adminUid}`).get();
    if (snap.exists) {
      found = snap.data();
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(found, "onReportCreated must have written the admin notification");
  assert.strictEqual(found.type, "report_new");
  assert.strictEqual(found.titleKey, "notifications.moderation.newReport.title");
  assert.strictEqual(found.bodyKey, "notifications.moderation.newReport.body");
  assert.strictEqual(found.metadata.reportId, reportId);
});
