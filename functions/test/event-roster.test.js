/**
 * Integration tests for fix/privacy-event-roster (the money/capacity core).
 *
 *   npm run test:payments
 *
 * The attendee roster moved off the world-readable events/{id}.attendees array
 * into the gated events/{id}/roster/{uid} subcollection, with capacity tracked by
 * participantCount (active only). These cover the pieces #44/#45 don't:
 *   - join active vs waitlist by participantCount;
 *   - leave/cancel frees a spot and the roster TRIGGER promotes the oldest
 *     waitlisted person (FIFO) + notifies them;
 *   - migrateEventRosters is idempotent (no double count on re-run).
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
const nextId = () => `rst${Date.now()}_${uniq++}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Emulator user + ID token (verified — joinEvent requires email_verified).
 * @param {string} uid desired uid
 * @param {object} [opts] options
 * @param {boolean} [opts.isAdmin] set the admin claim
 * @return {Promise<string>} the ID token
 */
async function tokenFor(uid, {isAdmin = false} = {}) {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: true});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: true});
  }
  if (isAdmin) await admin.auth().setCustomUserClaims(uid, {admin: true});
  const r = await fetch(`${IDT}:signInWithPassword?key=fake`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}),
  }).then((x) => x.json());
  return r.idToken;
}

const call = (name, data, token) =>
  fetch(`${FN}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify({data}),
  }).then(async (r) => ({status: r.status, body: await r.json().catch(() => ({}))}));

const rosterDoc = async (eventId, uid) =>
  (await db.collection("events").doc(eventId).collection("roster").doc(uid).get()).data();
const participantCount = async (eventId) =>
  (await db.collection("events").doc(eventId).get()).data().participantCount;

test("ROST1 join active vs waitlist, then a cancel PROMOTES the waitlisted (FIFO) + notifies", async () => {
  const eventId = `evt_${nextId()}`;
  const host = `host_${nextId()}`;
  const a = `a_${nextId()}`;
  const b = `b_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: host, title: "Tiny", price: 0, maxAttendees: 1, participantCount: 0,
    date: new Date(Date.now() + 3 * 864e5).toISOString(),
  });
  const [ta, tb] = [await tokenFor(a), await tokenFor(b)];

  // A joins → active (fills the 1 spot). B joins → waitlist.
  assert.strictEqual((await call("joinEvent", {eventId}, ta)).status, 200);
  const rb1 = await call("joinEvent", {eventId}, tb);
  assert.strictEqual(rb1.status, 200);
  assert.strictEqual(rb1.body.result.waitlisted, true);
  assert.strictEqual(await participantCount(eventId), 1);
  assert.strictEqual((await rosterDoc(eventId, a)).status, "active");
  assert.strictEqual((await rosterDoc(eventId, b)).status, "waitlist");

  // A leaves → a spot frees → the roster trigger promotes B (FIFO).
  assert.strictEqual((await call("leaveEvent", {eventId}, ta)).status, 200);

  // Poll for the async trigger to promote B.
  let promoted = false;
  for (let i = 0; i < 25; i++) {
    const rb = await rosterDoc(eventId, b);
    if (rb && rb.status === "active") {
      promoted = true;
      break;
    }
    await sleep(400);
  }
  assert.ok(promoted, "B should be promoted from the waitlist");
  assert.strictEqual(await participantCount(eventId), 1, "count reflects the promotion, not oversold");
  assert.strictEqual(await rosterDoc(eventId, a), undefined, "A is gone");

  // B got a waitlist_promoted notification.
  const notes = await db.collection("notifications")
    .where("userId", "==", b).where("type", "==", "waitlist_promoted").get();
  assert.ok(!notes.empty, "B should receive a waitlist_promoted notification");
});

test("ROST3 a post-refactor joiner is on the ROSTER (server readers read it, not the array)", async () => {
  const eventId = `evt_${nextId()}`;
  const a = `a_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: `host_${nextId()}`, title: "Open", price: 0,
    maxAttendees: 50, participantCount: 0,
    date: new Date(Date.now() + 3 * 864e5).toISOString(),
  });
  const ta = await tokenFor(a);
  assert.strictEqual((await call("joinEvent", {eventId}, ta)).status, 200);

  // The exact query every server reader (chat push :563, reminders :1883,
  // friends-going, aggregates, recaps) uses: active roster of the event.
  const active = await db.collection("events").doc(eventId).collection("roster")
    .where("status", "==", "active").get();
  assert.ok(active.docs.some((d) => d.id === a), "joiner is in the active roster");
  // …and there is NO world-readable attendees array to read from.
  const e = (await db.collection("events").doc(eventId).get()).data();
  assert.strictEqual(e.attendees, undefined, "no attendees array on the public doc");
});

test("ROST4 CONCURRENT leaves loop-fill ALL freed spots (no empty seats, no oversell)", async () => {
  const eventId = `evt_${nextId()}`;
  const [a, b, c, d] = [`a_${nextId()}`, `b_${nextId()}`, `c_${nextId()}`, `d_${nextId()}`];
  const base = new Date("2026-01-01T00:00:00Z").getTime();
  await db.collection("events").doc(eventId).set({
    creatorId: `host_${nextId()}`, title: "Full+waitlist", maxAttendees: 2,
    participantCount: 2, date: new Date(Date.now() + 3 * 864e5).toISOString(),
  });
  const col = db.collection("events").doc(eventId).collection("roster");
  const Ts = admin.firestore.Timestamp;
  await col.doc(a).set({uid: a, status: "active", joinedAt: Ts.fromMillis(base)});
  await col.doc(b).set({uid: b, status: "active", joinedAt: Ts.fromMillis(base + 1)});
  await col.doc(c).set({uid: c, status: "waitlist", joinedAt: Ts.fromMillis(base + 2)});
  await col.doc(d).set({uid: d, status: "waitlist", joinedAt: Ts.fromMillis(base + 3)});
  const [ta, tb] = [await tokenFor(a), await tokenFor(b)];

  // Both active members leave at the same time → 2 spots free.
  await Promise.all([
    call("leaveEvent", {eventId}, ta),
    call("leaveEvent", {eventId}, tb),
  ]);

  // Both waitlisters should end up promoted (loop-fill), count back to max=2.
  let ok = false;
  for (let i = 0; i < 30; i++) {
    const [cd, count] = await Promise.all([
      col.where("status", "==", "active").get(),
      participantCount(eventId),
    ]);
    const ids = cd.docs.map((x) => x.id);
    if (count === 2 && ids.includes(c) && ids.includes(d)) {
      ok = true;
      break;
    }
    await sleep(400);
  }
  assert.ok(ok, "both waitlisters promoted; no spot left empty; count == max (no oversell)");
});

test("ROST2 migrateEventRosters is idempotent (no double count on re-run)", async () => {
  const eventId = `evt_${nextId()}`;
  await db.collection("events").doc(eventId).set({
    creatorId: `host_${nextId()}`, title: "Legacy", maxAttendees: 2,
    attendees: [`a_${nextId()}`, `b_${nextId()}`], waitlist: [`c_${nextId()}`],
    date: new Date(Date.now() + 3 * 864e5).toISOString(),
  });
  const adminTok = await tokenFor(`admin_${nextId()}`, {isAdmin: true});

  const first = await call("migrateEventRosters", {}, adminTok);
  assert.strictEqual(first.status, 200);
  const ev1 = (await db.collection("events").doc(eventId).get()).data();
  assert.strictEqual(ev1.participantCount, 2, "active count");
  assert.strictEqual(ev1.attendees, undefined, "array stripped");
  const roster1 = await db.collection("events").doc(eventId).collection("roster").get();
  assert.strictEqual(roster1.size, 3, "2 active + 1 waitlist");

  // Re-run — a fully-migrated event (no arrays) is skipped → no change.
  await call("migrateEventRosters", {}, adminTok);
  const ev2 = (await db.collection("events").doc(eventId).get()).data();
  assert.strictEqual(ev2.participantCount, 2, "participantCount NOT double-counted");
  const roster2 = await db.collection("events").doc(eventId).collection("roster").get();
  assert.strictEqual(roster2.size, 3, "roster unchanged");
});
