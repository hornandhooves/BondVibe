/**
 * Rules tests for feat/social-gifting review C+D — gift anonymity projection and
 * the consent-gated birthday subdoc.
 *   - gifts/{id} (gifter view, has gifterId) → GIFTER-ONLY read.
 *   - giftReveals/{id} (recipient view, NO gifterId) → RECIPIENT-ONLY read.
 *   - users/{id}/social/birthday → readable by others ONLY when that user's
 *     birthdayShareConsent == true; the owner always can.
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
const {doc, setDoc, getDoc} = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-gifting-privacy",
    firestore: {rules: read("firestore.rules"), host: "127.0.0.1", port: 8080},
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const seedGift = () =>
  seed(async (db) => {
    await setDoc(doc(db, "gifts", "g1"),
      {giftId: "g1", gifterId: "gifter", recipientId: "recip", status: "sent"});
    await setDoc(doc(db, "giftReveals", "g1"),
      {giftId: "g1", recipientId: "recip", status: "sent", gifterName: null});
  });

describe("gift anonymity projection", () => {
  test("the GIFTER reads gifts/{id} (their view)", async () => {
    await seedGift();
    await assertSucceeds(getDoc(doc(asUser("gifter"), "gifts", "g1")));
  });

  test("FIX: the RECIPIENT cannot read gifts/{id} (no gifterId leak)", async () => {
    await seedGift();
    await assertFails(getDoc(doc(asUser("recip"), "gifts", "g1")));
  });

  test("the RECIPIENT reads giftReveals/{id} (their view, no gifterId)", async () => {
    await seedGift();
    await assertSucceeds(getDoc(doc(asUser("recip"), "giftReveals", "g1")));
  });

  test("FIX: the GIFTER cannot read the recipient's reveal", async () => {
    await seedGift();
    await assertFails(getDoc(doc(asUser("gifter"), "giftReveals", "g1")));
  });

  test("a stranger reads neither", async () => {
    await seedGift();
    await assertFails(getDoc(doc(asUser("mallory"), "gifts", "g1")));
    await assertFails(getDoc(doc(asUser("mallory"), "giftReveals", "g1")));
  });
});

describe("consent-gated birthday subdoc", () => {
  const seedBday = (consent) =>
    seed(async (db) => {
      await setDoc(doc(db, "users", "amy"), {role: "user", birthdayShareConsent: consent});
      await setDoc(doc(db, "users", "amy", "social", "birthday"),
        {birthDay: 12, birthMonth: 3});
    });

  test("another user reads the birthday when consent is TRUE", async () => {
    await seedBday(true);
    await assertSucceeds(getDoc(doc(asUser("bob"), "users", "amy", "social", "birthday")));
  });

  test("FIX: another user CANNOT read it when consent is false", async () => {
    await seedBday(false);
    await assertFails(getDoc(doc(asUser("bob"), "users", "amy", "social", "birthday")));
  });

  test("the owner always reads their own birthday (even without consent)", async () => {
    await seedBday(false);
    await assertSucceeds(getDoc(doc(asUser("amy"), "users", "amy", "social", "birthday")));
  });

  test("the owner writes day+month; a YEAR is rejected", async () => {
    await seed((db) => setDoc(doc(db, "users", "amy"), {role: "user"}));
    await assertSucceeds(
      setDoc(doc(asUser("amy"), "users", "amy", "social", "birthday"),
        {birthDay: 12, birthMonth: 3}));
    await assertFails(
      setDoc(doc(asUser("amy"), "users", "amy", "social", "birthday"),
        {birthDay: 12, birthMonth: 3, birthYear: 1994}));
  });
});
