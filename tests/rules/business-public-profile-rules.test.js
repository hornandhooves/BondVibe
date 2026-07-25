/**
 * Rules tests for KIN-97 — businesses/{bizId}/public/profile.
 *   - any signed-in user (not just staff/owner) CAN read it;
 *   - an unauthenticated request CANNOT read it;
 *   - nobody can write it client-side (server-only, via the
 *     onBusinessPublicProfileWritten trigger using the Admin SDK, which
 *     bypasses rules entirely).
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
const { doc, setDoc, getDoc } = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const BIZ = "biz1";
const profilePath = ["businesses", BIZ, "public", "profile"];

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-business-public-profile",
    firestore: { rules: read("firestore.rules"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const asUnauth = () => env.unauthenticatedContext().firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const seedProfile = () =>
  seed((db) =>
    setDoc(doc(db, ...profilePath), {
      name: "Wellness Co",
      verified: true,
      avatarUrl: null,
      vertical: "wellness",
    })
  );

describe("businesses/{bizId}/public/profile", () => {
  test("a signed-in user who is NOT staff/owner of the business CAN read it", async () => {
    await seedProfile();
    await assertSucceeds(getDoc(doc(asUser("random-customer"), ...profilePath)));
  });

  test("an unauthenticated request CANNOT read it", async () => {
    await seedProfile();
    await assertFails(getDoc(doc(asUnauth(), ...profilePath)));
  });

  test("a signed-in user CANNOT write it, even the business owner", async () => {
    await assertFails(
      setDoc(doc(asUser(BIZ), ...profilePath), { name: "Hacked", verified: true })
    );
  });
});
