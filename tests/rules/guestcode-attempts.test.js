/**
 * fix/privacy-guestcode-joinevent — guestCodeAttempts/{uid} is the per-user redeem
 * rate-limit counter, written only by redeemBusinessGuestCode (Admin SDK). A client
 * must never read it (probe) or write it (reset its own count to keep brute-forcing).
 *
 * Run:  npm run test:rules
 */
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { doc, setDoc, getDoc } = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-guestcode-rl",
    firestore: { rules: read("firestore.rules"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();

describe("guestCodeAttempts — server-only", () => {
  test("a user cannot READ their own attempt counter", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), "guestCodeAttempts", "mallory"), { count: 5 })
    );
    await assertFails(getDoc(doc(asUser("mallory"), "guestCodeAttempts", "mallory")));
  });

  test("a user cannot WRITE (reset) their attempt counter", async () => {
    await assertFails(setDoc(doc(asUser("mallory"), "guestCodeAttempts", "mallory"), { count: 0 }));
  });
});
