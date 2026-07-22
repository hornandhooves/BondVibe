/**
 * Rules tests for fix/privacy-event-roster: the roster lives in the gated
 * events/{id}/roster/{uid} subcollection, and participantCount stays public.
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
const {doc, getDoc, setDoc, collection, getDocs} = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-event-roster",
    firestore: {rules: read("firestore.rules"), host: "127.0.0.1", port: 8080},
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const EVENT = "evt1";
const seedEvent = () =>
  seed(async (db) => {
    await setDoc(doc(db, "events", EVENT), {
      creatorId: "host1", title: "Roster event", participantCount: 2,
    });
    await setDoc(doc(db, "events", EVENT, "roster", "alice"),
      {uid: "alice", status: "active"});
    await setDoc(doc(db, "events", EVENT, "roster", "bob"),
      {uid: "bob", status: "active"});
  });

describe("events/{id}/roster — gated", () => {
  test("a stranger CANNOT read another user's roster doc (de-anonymization blocked)", async () => {
    await seedEvent();
    await assertFails(getDoc(doc(asUser("mallory"), "events", EVENT, "roster", "alice")));
  });

  test("a stranger CANNOT list the roster", async () => {
    await seedEvent();
    await assertFails(getDocs(collection(asUser("mallory"), "events", EVENT, "roster")));
  });

  test("a participant reads their OWN roster doc", async () => {
    await seedEvent();
    await assertSucceeds(getDoc(doc(asUser("alice"), "events", EVENT, "roster", "alice")));
  });

  test("the host reads any roster doc + can list the roster", async () => {
    await seedEvent();
    await assertSucceeds(getDoc(doc(asUser("host1"), "events", EVENT, "roster", "alice")));
    await assertSucceeds(getDocs(collection(asUser("host1"), "events", EVENT, "roster")));
  });

  test("NO client write to the roster (participantCount can't be forged)", async () => {
    await seedEvent();
    await assertFails(
      setDoc(doc(asUser("mallory"), "events", EVENT, "roster", "mallory"),
        {uid: "mallory", status: "active"})
    );
  });

  test("participantCount stays PUBLIC: any signed-in user reads the event doc", async () => {
    await seedEvent();
    const snap = await getDoc(doc(asUser("mallory"), "events", EVENT));
    // read allowed (events read: if isSignedIn) and the count is visible…
    await assertSucceeds(getDoc(doc(asUser("mallory"), "events", EVENT)));
    // …but it's just an int; no attendee identities on the public doc.
    if (snap.exists()) {
      // sanity — the public field is present, the roster array is not.
      const data = snap.data();
      if (data.attendees !== undefined) throw new Error("attendees array must not be public");
    }
  });
});
