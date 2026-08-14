/**
 * KIN-218 — the host changed the plan; the attendees have to hear about it.
 *
 *   npm run test:payments
 *
 * Two halves. The decision (does this edit deserve a notification?) is pure and
 * tested directly — it's the part that decides whether someone finds out their
 * event moved, and it should be provable without an emulator. The fan-out (who
 * gets it, and does the host get spammed by their own edit) runs against the
 * emulator, because "one bubble per active attendee" is a claim about
 * Firestore, not about a function's return value.
 *
 * The case that motivates the whole ticket is `date`: a date move changes
 * neither searchKeywords nor the location-gating fields, so onEventWritten's
 * steady-state `return` would swallow it. That's why the hook sits above it,
 * and why "date alone notifies" is asserted rather than assumed.
 */
const test = require("node:test");
const assert = require("node:assert");
const admin = require("firebase-admin");

const PROJECT = process.env.GCLOUD_PROJECT || "kinlo-app-dev";
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

if (!admin.apps.length) admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();

// KIN-224: intercept the push transport BEFORE the module under test captures
// it — eventEditNotifications destructures sendBatchPushNotifications at require
// time, so patching afterwards would do nothing. This is the only thing stubbed
// in this file, and it exists to read the payload without POSTing to Expo.
const pushService = require("../notifications/pushService");
const sentPushes = [];
pushService.sendBatchPushNotifications = async (entries) => {
  sentPushes.push(...entries);
};

const {
  changedEventFields,
  notifyRosterOfEventEdit,
  WATCHED_FIELDS,
} = require("../notifications/eventEditNotifications");

/**
 * A complete event doc; each test overrides only what it's about.
 * @param {object} [over] fields to override
 * @return {object} an events/{id} document
 */
const evt = (over = {}) => ({
  title: "Clase de yoga",
  description: "Una clase tranquila",
  date: "2026-09-01T15:00:00.000Z",
  time: "10:00",
  durationMinutes: 60,
  location: "Playa Paraiso",
  venueAddress: "Carretera Tulum-Boca Paila km 7",
  status: "active",
  creatorId: "host1",
  ...over,
});

let uniq = 0;
const nextId = () => `k218_${Date.now()}_${uniq++}`;

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

test("(a) nothing watched changed → no notification", () => {
  // Only description moved, and description is deliberately out of this round.
  const before = evt();
  const after = evt({description: "Ahora con música en vivo"});
  assert.deepStrictEqual(changedEventFields(before, after), []);
});

test("(b) title alone → notifies", () => {
  // Even a typo fix counts: the attendee's saved event just changed name.
  const changed = changedEventFields(evt(), evt({title: "Clase de yoga al atardecer"}));
  assert.deepStrictEqual(changed, ["title"]);
});

test("(c) date alone → notifies", () => {
  // The case the steady-state return would have swallowed.
  const changed = changedEventFields(evt(), evt({date: "2026-09-08T15:00:00.000Z"}));
  assert.deepStrictEqual(changed, ["date"]);
});

test("(d) venue/address alone → notifies", () => {
  assert.deepStrictEqual(
    changedEventFields(evt(), evt({location: "Cenote Calavera"})),
    ["location"],
  );
  assert.deepStrictEqual(
    changedEventFields(evt(), evt({venueAddress: "Av. Coba 12"})),
    ["venueAddress"],
  );
});

test("(e) the 'all future' save path notifies too", () => {
  // That path writes updateData WITHOUT date/time (EditEventScreen only adds
  // those in the single-event branch), so the trigger has to fire on the fields
  // it does write, or a series-wide venue move is silent.
  const before = evt();
  const after = evt({
    title: "Clase de yoga (nuevo horario)",
    durationMinutes: 90,
    location: "Cenote Calavera",
    venueAddress: "Carretera Tulum-Cobá km 3",
  });
  assert.deepStrictEqual(
    changedEventFields(before, after),
    ["title", "durationMinutes", "location", "venueAddress"],
  );
  // ...and date/time genuinely did not move on that path.
  assert.strictEqual(before.date, after.date);
  assert.strictEqual(before.time, after.time);
});

test("every watched field notifies on its own", () => {
  // Guards against a field silently dropping out of the list later.
  const bumped = {
    title: "otro", date: "2026-10-01T15:00:00.000Z", time: "18:00",
    durationMinutes: 120, location: "otro lugar", venueAddress: "otra dirección",
  };
  for (const f of WATCHED_FIELDS) {
    assert.deepStrictEqual(
      changedEventFields(evt(), evt({[f]: bumped[f]})), [f],
      `${f} should notify on its own`,
    );
  }
});

test("a creation notifies nobody", () => {
  // No beforeData: there is no roster yet, and nothing 'changed'.
  assert.deepStrictEqual(changedEventFields(null, evt()), []);
});

test("a type migration is not a schedule change", () => {
  // durationMinutes has been written as both 60 and "60" over this collection's
  // life. Nobody should be pushed because a backfill normalized it.
  assert.deepStrictEqual(changedEventFields(evt({durationMinutes: "60"}), evt()), []);
});

test("absent, null and empty all mean the same thing", () => {
  // An older doc simply lacks venueAddress; Edit writes null when it's blank.
  const noKey = evt(); delete noKey.venueAddress;
  assert.deepStrictEqual(changedEventFields(noKey, evt({venueAddress: null})), []);
  assert.deepStrictEqual(changedEventFields(evt({venueAddress: ""}), evt({venueAddress: null})), []);
  // But going from nothing to a real address IS a change.
  assert.deepStrictEqual(
    changedEventFields(noKey, evt({venueAddress: "Av. Coba 12"})),
    ["venueAddress"],
  );
});

// ---------------------------------------------------------------------------
// The fan-out
// ---------------------------------------------------------------------------

/** Seed an event with an active roster; returns ids for assertions + cleanup. */
const seedEvent = async ({activeUids = [], waitlistUids = [], creatorId = "host1"} = {}) => {
  const eventId = nextId();
  await db.collection("events").doc(eventId).set(evt({creatorId}));
  for (const uid of activeUids) {
    await db.collection("events").doc(eventId).collection("roster").doc(uid)
      .set({uid, eventId, status: "active"});
  }
  for (const uid of waitlistUids) {
    await db.collection("events").doc(eventId).collection("roster").doc(uid)
      .set({uid, eventId, status: "waitlist"});
  }
  return eventId;
};

const notifsFor = async (eventId) => {
  const snap = await db.collection("notifications")
    .where("type", "==", "event_details_changed").get();
  return snap.docs.map((d) => ({id: d.id, ...d.data()}))
    .filter((n) => n.metadata && n.metadata.eventId === eventId);
};

test("one bubble per active attendee, none for the waitlist", async () => {
  const eventId = await seedEvent({
    activeUids: ["a1", "a2"],
    waitlistUids: ["w1"],
  });
  const before = evt();
  const after = evt({date: "2026-09-08T15:00:00.000Z"});
  const notified = await notifyRosterOfEventEdit(db, eventId, before, after);

  assert.deepStrictEqual(notified.sort(), ["a1", "a2"]);
  const notifs = await notifsFor(eventId);
  assert.strictEqual(notifs.length, 2);
  assert.deepStrictEqual(notifs.map((n) => n.userId).sort(), ["a1", "a2"]);
});

test("the bubble carries the keys, not frozen text (BUG 34)", async () => {
  const eventId = await seedEvent({activeUids: ["a1"]});
  await notifyRosterOfEventEdit(db, eventId, evt(), evt({title: "Nuevo título"}));
  const [n] = await notifsFor(eventId);

  assert.strictEqual(n.titleKey, "notifications.event.detailsChanged.title");
  assert.strictEqual(n.bodyKey, "notifications.event.detailsChanged.body");
  assert.strictEqual(n.params.event, "Nuevo título");
  // The changed fields ride along for a future UI, without being interpolated
  // into text in the sender's language.
  assert.deepStrictEqual(n.metadata.changedFields, ["title"]);
  assert.strictEqual(n.read, false);
});

test("the host is not notified of their own edit", async () => {
  // The host is on their own roster — a real case for a host who joins.
  const eventId = await seedEvent({activeUids: ["host1", "a1"], creatorId: "host1"});
  const notified = await notifyRosterOfEventEdit(db, eventId, evt(), evt({title: "x"}));
  assert.deepStrictEqual(notified, ["a1"]);
});

test("an unwatched edit writes nothing at all", async () => {
  const eventId = await seedEvent({activeUids: ["a1"]});
  const notified = await notifyRosterOfEventEdit(
    db, eventId, evt(), evt({description: "otra cosa"}));
  assert.deepStrictEqual(notified, []);
  assert.strictEqual((await notifsFor(eventId)).length, 0);
});

test("a cancelled event doesn't also announce the edit", async () => {
  // Cancellation has its own notification (notif.eventCancelled); sending both
  // would tell someone their event moved and then that it's off.
  const eventId = await seedEvent({activeUids: ["a1"]});
  const notified = await notifyRosterOfEventEdit(
    db, eventId, evt(), evt({title: "x", status: "cancelled"}));
  assert.deepStrictEqual(notified, []);
  assert.strictEqual((await notifsFor(eventId)).length, 0);
});

test("an empty roster is not an error", async () => {
  const eventId = await seedEvent({activeUids: []});
  const notified = await notifyRosterOfEventEdit(db, eventId, evt(), evt({title: "x"}));
  assert.deepStrictEqual(notified, []);
});

// ---------------------------------------------------------------------------
// KIN-224 — the push has to name the bubble it came from
// ---------------------------------------------------------------------------

test("KIN-224 each push carries THAT recipient's own notification id", async () => {
  // The failure this pins is not "the field is missing" but "everyone got the
  // same id": one shared id would let one person's tap mark somebody else's
  // notification read.
  const u1 = `k224a_${nextId()}`;
  const u2 = `k224b_${nextId()}`;
  const eventId = await seedEvent({activeUids: [u1, u2]});
  for (const uid of [u1, u2]) {
    await db.collection("users").doc(uid)
      .set({pushToken: `ExponentPushToken[${uid}]`, language: "en"});
  }

  sentPushes.length = 0;
  await notifyRosterOfEventEdit(
    db, eventId, evt(), evt({date: "2026-09-08T15:00:00.000Z"}));

  assert.strictEqual(sentPushes.length, 2, "both recipients should be pushed");

  const byUser = {};
  for (const n of await notifsFor(eventId)) byUser[n.userId] = n.id;

  for (const entry of sentPushes) {
    assert.ok(entry.data.notificationId, `no notificationId for ${entry.uid}`);
    assert.strictEqual(
      entry.data.notificationId, byUser[entry.uid],
      `push for ${entry.uid} points at the wrong bubble`);
  }
  // ...and the two ids are genuinely different documents.
  assert.notStrictEqual(
    sentPushes[0].data.notificationId, sentPushes[1].data.notificationId);
});
