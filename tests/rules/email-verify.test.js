/**
 * Rule test for fix/email-verify-and-capacity: creating an event requires a
 * verified email (request.auth.token.email_verified == true). Browsing (read)
 * stays open to any signed-in user.
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
const FS_EMU = { host: "127.0.0.1", port: 8080 };

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-emailverify",
    firestore: { rules: read("firestore.rules"), ...FS_EMU },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

// A create payload that satisfies every OTHER event-create constraint, so the
// only variable under test is the email_verified claim.
const eventPayload = (uid) => ({
  creatorId: uid,
  title: "Yoga al amanecer",
  featured: false,
  date: new Date(Date.now() + 864e5).toISOString(),
  price: 0,
});

describe("events.create — verified email required", () => {
  test("verified user CAN create an event", async () => {
    const db = env.authenticatedContext("host1", { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, "events", "e1"), eventPayload("host1")));
  });

  test("UNVERIFIED user CANNOT create an event (even with valid data)", async () => {
    const db = env.authenticatedContext("host2", { email_verified: false }).firestore();
    await assertFails(setDoc(doc(db, "events", "e2"), eventPayload("host2")));
  });

  test("missing email_verified claim is treated as not-verified", async () => {
    const db = env.authenticatedContext("host3").firestore(); // no token options
    await assertFails(setDoc(doc(db, "events", "e3"), eventPayload("host3")));
  });

  test("NO OVER-BLOCK: an UNVERIFIED user can still READ (browse) events", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), "events", "e4"), eventPayload("someone"))
    );
    const db = env.authenticatedContext("browser", { email_verified: false }).firestore();
    await assertSucceeds(getDoc(doc(db, "events", "e4")));
  });
});
