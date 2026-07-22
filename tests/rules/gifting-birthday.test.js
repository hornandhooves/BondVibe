/**
 * Rules tests for feat/social-gifting Fase 0 — the community birthday is
 * DAY + MONTH ONLY, owner-written, opt-in. The year (or any full DOB) must never
 * be storable on the profile.
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
const {doc, setDoc, updateDoc} = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-gifting-bday",
    firestore: {rules: read("firestore.rules"), host: "127.0.0.1", port: 8080},
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const seedUser = () =>
  seed((db) => setDoc(doc(db, "users", "amy"), {role: "user", name: "Amy"}));

describe("social birthday (day+month only, opt-in)", () => {
  test("owner sets birthDay + birthMonth + consent", async () => {
    await seedUser();
    await assertSucceeds(updateDoc(doc(asUser("amy"), "users", "amy"),
      {birthDay: 12, birthMonth: 3, birthdayShareConsent: true}));
  });

  test("FIX: a birth YEAR is rejected (never store the year)", async () => {
    await seedUser();
    await assertFails(updateDoc(doc(asUser("amy"), "users", "amy"),
      {birthDay: 12, birthMonth: 3, birthYear: 1994}));
  });

  test("FIX: a full birthdate field is rejected", async () => {
    await seedUser();
    await assertFails(updateDoc(doc(asUser("amy"), "users", "amy"),
      {birthDate: "1994-03-12"}));
  });

  test("FIX: an out-of-range day/month is rejected", async () => {
    await seedUser();
    await assertFails(updateDoc(doc(asUser("amy"), "users", "amy"),
      {birthDay: 40, birthMonth: 3}));
    await assertFails(updateDoc(doc(asUser("amy"), "users", "amy"),
      {birthDay: 12, birthMonth: 13}));
  });

  test("FIX: a non-int day is rejected", async () => {
    await seedUser();
    await assertFails(updateDoc(doc(asUser("amy"), "users", "amy"),
      {birthDay: "12", birthMonth: 3}));
  });

  test("another user CANNOT write your birthday", async () => {
    await seedUser();
    await assertFails(updateDoc(doc(asUser("mallory"), "users", "amy"),
      {birthDay: 1, birthMonth: 1}));
  });

  test("NO OVER-BLOCK: an unrelated profile edit still works", async () => {
    await seedUser();
    await assertSucceeds(updateDoc(doc(asUser("amy"), "users", "amy"),
      {name: "Amy B"}));
  });
});
