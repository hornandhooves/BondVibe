/**
 * Rules tests for KIN-288: businesses/{bizId}/private/{doc} (the exact
 * gated business location) reads to staff/owner (unchanged, KIN-284) OR a
 * buyer with businesses/{bizId}/confirmedBuyers/{uid} (added KIN-288). The
 * rule under test (firestore.rules, inside match /businesses/{bizId}):
 *
 *   match /private/{doc} {
 *     allow read: if isBizStaff(bizId) || isBizOwnerUid(bizId) ||
 *                    exists(/databases/$(database)/documents/businesses/$(bizId)/confirmedBuyers/$(request.auth.uid));
 *     allow write: if false;
 *   }
 *
 * confirmedBuyers/{uid} itself has NO match block (deliberately, per its own
 * comment in firestore.rules) — default-deny for every client operation,
 * read or write. It's written exclusively by paymentWebhook.js via the
 * Admin SDK, which ignores these rules entirely; this suite only verifies
 * the client-facing side (nothing here calls that function).
 *
 * This test verifies rules ALREADY deployed (commit e3efb306) — it does not
 * change firestore.rules.
 *
 * Run:  npm run test:rules
 */
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {doc, getDoc, setDoc} = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-business-private-location",
    firestore: {rules: read("firestore.rules"), host: "127.0.0.1", port: 8080},
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const BIZ = "biz1";
const OWNER = "owner1";
const STAFF = "staffer1";
const seedBusiness = () =>
  seed(async (db) => {
    await setDoc(doc(db, "businesses", BIZ), {ownerUid: OWNER, name: "Test Biz"});
    await setDoc(doc(db, "businesses", BIZ, "staff", STAFF),
      {uid: STAFF, role: "staff", status: "active"});
    await setDoc(doc(db, "businesses", BIZ, "private", "location"),
      {venueName: "Secret Venue", address: "123 Hidden St", exactCoords: {latitude: 1, longitude: 1}});
  });

describe("businesses/{bizId}/private/{doc} — staff/owner/confirmed-buyer gate", () => {
  test("a) staff of the business reads private/location", async () => {
    await seedBusiness();
    await assertSucceeds(getDoc(doc(asUser(STAFF), "businesses", BIZ, "private", "location")));
  });

  test("b) the owner reads private/location", async () => {
    await seedBusiness();
    await assertSucceeds(getDoc(doc(asUser(OWNER), "businesses", BIZ, "private", "location")));
  });

  test("c) a signed-in stranger — not staff/owner, no confirmedBuyers doc — CANNOT read", async () => {
    await seedBusiness();
    await assertFails(getDoc(doc(asUser("mallory"), "businesses", BIZ, "private", "location")));
  });

  test("d) a user WITH businesses/{bizId}/confirmedBuyers/{their-uid} reads private/location", async () => {
    await seedBusiness();
    const BUYER = "buyer1";
    // Seeded directly (bypassing rules), simulating what
    // paymentWebhook.js's handleServiceBookingPayment writes via the Admin
    // SDK on payment confirmation — this test never invokes that function.
    await seed(async (db) => {
      await setDoc(doc(db, "businesses", BIZ, "confirmedBuyers", BUYER),
        {confirmedAt: new Date()});
    });
    await assertSucceeds(getDoc(doc(asUser(BUYER), "businesses", BIZ, "private", "location")));
  });

  test("e) NO client — not even a confirmed buyer — can write private/location (allow write: if false)", async () => {
    await seedBusiness();
    const BUYER = "buyer2";
    await seed(async (db) => {
      await setDoc(doc(db, "businesses", BIZ, "confirmedBuyers", BUYER),
        {confirmedAt: new Date()});
    });
    await assertFails(
      setDoc(doc(asUser(BUYER), "businesses", BIZ, "private", "location"),
        {venueName: "Forged Venue"})
    );
    // Owner too — writes to this doc are server-only, no exception for staff/owner.
    await assertFails(
      setDoc(doc(asUser(OWNER), "businesses", BIZ, "private", "location"),
        {venueName: "Forged Venue"})
    );
  });

  test("f) NO client can write confirmedBuyers/{uid} directly — no match block, default-deny", async () => {
    await seedBusiness();
    // The most plausible attack surface: a user granting themselves the doc
    // that's supposed to be server-only.
    await assertFails(
      setDoc(doc(asUser("mallory"), "businesses", BIZ, "confirmedBuyers", "mallory"),
        {confirmedAt: new Date()})
    );
  });
});
