/**
 * createNotification (KIN-244) — the shared write-doc + send-push helper.
 * Pure Firestore-emulator tests: no HTTPS callable involved, `createNotification`
 * is required and called directly. Needs the firestore emulator (Auth isn't
 * used here, unlike staff-invite.test.js).
 *
 * Deliberately does NOT exercise a successful push send — that would hit the
 * real Expo API over the network from a test, which nothing else in this repo
 * does either (there's no pushService test). The malformed-token path below
 * covers "push fails" without any network call, since sendPushNotification
 * rejects a bad token BEFORE it ever calls fetch.
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();

const {createNotification} = require("../notifications/createNotification");

let uniq = 0;
const nextId = () => `cn${Date.now()}_${uniq++}`;

const notifsFor = async (uid) =>
  (await db.collection("notifications").where("userId", "==", uid).get()).docs.map((d) => d.data());

test("CN1 writes the doc with the documented shape", async () => {
  const uid = `user_${nextId()}`;
  await db.collection("users").doc(uid).set({language: "en"});

  const res = await createNotification({
    userId: uid,
    type: "staff_removed",
    titleKey: "notifications.staff.removed.title",
    bodyKey: "notifications.staff.removed.body",
    params: {business: "Casa Azul"},
    metadata: {bizId: "biz1"},
    push: false,
  });

  assert.ok(res.id);
  assert.strictEqual(res.pushed, false);
  const docs = await notifsFor(uid);
  assert.strictEqual(docs.length, 1);
  const d = docs[0];
  assert.strictEqual(d.userId, uid);
  assert.strictEqual(d.type, "staff_removed");
  assert.strictEqual(d.titleKey, "notifications.staff.removed.title");
  assert.strictEqual(d.bodyKey, "notifications.staff.removed.body");
  assert.deepStrictEqual(d.params, {business: "Casa Azul"});
  assert.deepStrictEqual(d.metadata, {bizId: "biz1"});
  assert.strictEqual(d.read, false);
  assert.strictEqual(d.resolved, false);
  assert.ok(d.createdAt);
  assert.ok(d.title, "title must be rendered, not blank");
  assert.ok(d.message, "message must be rendered, not blank");
});

test("CN2 resolves the recipient's stored language, not a hardcoded 'en'", async () => {
  const uid = `user_${nextId()}`;
  await db.collection("users").doc(uid).set({language: "es"});

  const res = await createNotification({
    userId: uid,
    type: "staff_removed",
    titleKey: "notifications.staff.removed.title",
    bodyKey: "notifications.staff.removed.body",
    params: {business: "Casa Azul"},
    push: false,
  });

  const [d] = await notifsFor(uid);
  // The ES catalog title for this key — asserting the actual Spanish string
  // (not just "not English") so a catalog regression would fail this test.
  assert.strictEqual(d.title, "Ya no eres parte del equipo");
  assert.ok(res.id);
});

test("CN3 defaults to English when the user has no language field", async () => {
  const uid = `user_${nextId()}`;
  await db.collection("users").doc(uid).set({}); // no `language`

  await createNotification({
    userId: uid,
    type: "staff_removed",
    titleKey: "notifications.staff.removed.title",
    bodyKey: "notifications.staff.removed.body",
    params: {business: "Casa Azul"},
    push: false,
  });

  const [d] = await notifsFor(uid);
  assert.strictEqual(d.title, "Removed from the team");
});

test("CN4 an explicit locale overrides the stored user language", async () => {
  const uid = `user_${nextId()}`;
  await db.collection("users").doc(uid).set({language: "en"});

  await createNotification({
    userId: uid,
    type: "staff_removed",
    titleKey: "notifications.staff.removed.title",
    bodyKey: "notifications.staff.removed.body",
    params: {business: "Casa Azul"},
    locale: "es",
    push: false,
  });

  const [d] = await notifsFor(uid);
  assert.strictEqual(d.title, "Ya no eres parte del equipo");
});

test("CN5 no pushToken on the recipient: doc is written, push is skipped (no throw)", async () => {
  const uid = `user_${nextId()}`;
  await db.collection("users").doc(uid).set({language: "en"}); // no pushToken

  const res = await createNotification({
    userId: uid,
    type: "staff_removed",
    titleKey: "notifications.staff.removed.title",
    bodyKey: "notifications.staff.removed.body",
    params: {business: "Casa Azul"},
    push: true,
  });

  assert.strictEqual(res.pushed, false);
  const docs = await notifsFor(uid);
  assert.strictEqual(docs.length, 1, "the doc must exist even though push was skipped");
});

test("CN6 a push-service failure never stops the document from being written", async () => {
  const uid = `user_${nextId()}`;
  // Malformed token: sendPushNotification rejects it on format BEFORE any
  // network call — this is "push fails" without hitting the real Expo API.
  await db.collection("users").doc(uid).set({language: "en", pushToken: "not-a-real-expo-token"});

  const res = await createNotification({
    userId: uid,
    type: "staff_removed",
    titleKey: "notifications.staff.removed.title",
    bodyKey: "notifications.staff.removed.body",
    params: {business: "Casa Azul"},
    push: true,
  });

  assert.strictEqual(res.pushed, false, "a rejected push must not report success");
  const docs = await notifsFor(uid);
  assert.strictEqual(docs.length, 1, "the doc must still be written despite the push failure");
});

test("CN7 actorUid === userId is a no-op: nothing is written, nothing is sent", async () => {
  const uid = `user_${nextId()}`;
  await db.collection("users").doc(uid).set({language: "en", pushToken: "not-a-real-expo-token"});

  const res = await createNotification({
    userId: uid,
    actorUid: uid, // self-notify
    type: "staff_removed",
    titleKey: "notifications.staff.removed.title",
    bodyKey: "notifications.staff.removed.body",
    params: {business: "Casa Azul"},
  });

  assert.deepStrictEqual(res, {id: null, pushed: false, skipped: "self"});
  const docs = await notifsFor(uid);
  assert.strictEqual(docs.length, 0);
});

test("CN8 a different actorUid does not block the notification", async () => {
  const uid = `user_${nextId()}`;
  const otherUid = `owner_${nextId()}`;
  await db.collection("users").doc(uid).set({language: "en"});

  const res = await createNotification({
    userId: uid,
    actorUid: otherUid,
    type: "staff_removed",
    titleKey: "notifications.staff.removed.title",
    bodyKey: "notifications.staff.removed.body",
    params: {business: "Casa Azul"},
    push: false,
  });

  assert.ok(res.id);
  assert.strictEqual((await notifsFor(uid)).length, 1);
});

test("CN9 push data defaults to metadata + type + notificationId when not given explicitly", async () => {
  // Can't observe the outbound push payload without hitting the network (see
  // file header), so this asserts the DOC side of the same contract instead:
  // metadata is exactly what was passed, unmodified — the default `data` the
  // helper builds for push is documented to derive from it plus type/id.
  const uid = `user_${nextId()}`;
  await db.collection("users").doc(uid).set({language: "en"});

  await createNotification({
    userId: uid,
    type: "staff_removed",
    titleKey: "notifications.staff.removed.title",
    bodyKey: "notifications.staff.removed.body",
    params: {business: "Casa Azul"},
    metadata: {bizId: "biz1", role: "reception"},
    push: false,
  });

  const [d] = await notifsFor(uid);
  assert.deepStrictEqual(d.metadata, {bizId: "biz1", role: "reception"});
});
