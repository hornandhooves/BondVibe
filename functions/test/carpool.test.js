/**
 * Integration tests for fix/security-carpool (Round 5) — the anti-oversell
 * respondToCarpoolRequest callable (the ONLY approval path; rules deny client
 * approve). Approving past seatsTotal is rejected; only the driver may respond.
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
const nextId = () => `cp${Date.now()}_${uniq++}`;

const tokenFor = async (uid) => {
  const email = `${uid}@kinlo.test`;
  const password = "Test123456!";
  try {
    await admin.auth().createUser({uid, email, password, emailVerified: true});
  } catch (e) {
    await admin.auth().updateUser(uid, {email, password, emailVerified: true});
  }
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

// Seed an event + carpool (seatsTotal) + N requested riders.
const seedCarpool = async (driver, seatsTotal, riderIds) => {
  const eventId = `evt_${nextId()}`;
  const carpoolId = `cp_${nextId()}`;
  await db.collection("events").doc(eventId).set({creatorId: driver});
  const cpRef = db.collection("events").doc(eventId).collection("carpools").doc(carpoolId);
  await cpRef.set({driverId: driver, seatsTotal, approvedCount: 0, status: "open"});
  for (const rid of riderIds) {
    await cpRef.collection("riders").doc(rid).set({status: "requested", name: rid});
  }
  return {eventId, carpoolId};
};

test("CP1 driver approves up to seatsTotal; the NEXT approval is rejected (anti-oversell)", async () => {
  const driver = `drv_${nextId()}`;
  const [a, b, c] = [`r_${nextId()}`, `r_${nextId()}`, `r_${nextId()}`];
  const {eventId, carpoolId} = await seedCarpool(driver, 2, [a, b, c]);
  const dt = await tokenFor(driver);

  assert.strictEqual((await call("respondToCarpoolRequest",
    {eventId, carpoolId, riderId: a, approve: true}, dt)).status, 200);
  assert.strictEqual((await call("respondToCarpoolRequest",
    {eventId, carpoolId, riderId: b, approve: true}, dt)).status, 200);

  // Third approval would exceed seatsTotal=2 → carpool_full.
  const third = await call("respondToCarpoolRequest",
    {eventId, carpoolId, riderId: c, approve: true}, dt);
  assert.strictEqual(third.status, 400); // failed-precondition
  assert.match(JSON.stringify(third.body), /carpool_full/);

  const cp = (await db.collection("events").doc(eventId)
    .collection("carpools").doc(carpoolId).get()).data();
  assert.strictEqual(cp.approvedCount, 2, "count never exceeds seatsTotal");
});

test("CP2 only the DRIVER may respond (a rider can't approve via the callable)", async () => {
  const driver = `drv_${nextId()}`;
  const a = `r_${nextId()}`;
  const {eventId, carpoolId} = await seedCarpool(driver, 2, [a]);
  const riderTok = await tokenFor(a);
  const res = await call("respondToCarpoolRequest",
    {eventId, carpoolId, riderId: a, approve: true}, riderTok);
  assert.strictEqual(res.status, 403); // permission-denied
});

test("CP3 declining frees a seat (approvedCount decremented)", async () => {
  const driver = `drv_${nextId()}`;
  const [a, b] = [`r_${nextId()}`, `r_${nextId()}`];
  const {eventId, carpoolId} = await seedCarpool(driver, 1, [a, b]);
  const dt = await tokenFor(driver);
  await call("respondToCarpoolRequest", {eventId, carpoolId, riderId: a, approve: true}, dt);
  // Full now (seatsTotal 1) — b is rejected…
  assert.match(JSON.stringify((await call("respondToCarpoolRequest",
    {eventId, carpoolId, riderId: b, approve: true}, dt)).body), /carpool_full/);
  // …decline a → seat frees → b can be approved.
  await call("respondToCarpoolRequest", {eventId, carpoolId, riderId: a, approve: false}, dt);
  assert.strictEqual((await call("respondToCarpoolRequest",
    {eventId, carpoolId, riderId: b, approve: true}, dt)).status, 200);
});
