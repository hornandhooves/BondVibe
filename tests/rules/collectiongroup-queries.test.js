/**
 * Regression guard for every collectionGroup() query in src/ (KIN-137).
 *
 * A collectionGroup query that a rule doesn't (or stops) authorizing doesn't
 * throw for the caller — it just returns 0 docs. Silent, not loud: exactly
 * the failure mode that let the roster/pairs collectionGroup queries run
 * unauthorized (and empty) for however long before firestore.rules grew the
 * recursive-wildcard rules they needed. One authenticated assertSucceeds()
 * per collectionGroup call site in src/, seeded so a real doc SHOULD come
 * back — if a rule regresses to deny, this goes red instead of just quietly
 * returning nothing.
 *
 * Run:  npm run test:rules
 */
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  collectionGroup,
  query,
  where,
  getDocs,
  Timestamp,
} = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-collectiongroup-queries",
    firestore: {rules: read("firestore.rules"), host: "127.0.0.1", port: 8080},
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

describe("collectionGroup queries — every src/ call site must resolve, not silently empty", () => {
  // src/services/rosterService.js — collectionGroup(db, "roster").where("uid", "==", me)
  test("roster: the caller's own roster docs come back across events", async () => {
    await seed((db) =>
      setDoc(doc(db, "events", "evtA", "roster", "alice"),
        {uid: "alice", eventId: "evtA", status: "active"})
    );
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(asUser("alice"), "roster"), where("uid", "==", "alice")))
    );
    expect(snap.size).toBeGreaterThan(0);
  });

  // src/services/marketplaceService.js — collectionGroup(db, "sessionTypes")
  // .where("publicListing", "==", true) [+ optional vertical]
  test("sessionTypes: public listings come back for any signed-in user", async () => {
    await seed((db) =>
      setDoc(doc(db, "businesses", "biz1", "sessionTypes", "svc1"),
        {publicListing: true, vertical: "wellness"})
    );
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(asUser("someone"), "sessionTypes"), where("publicListing", "==", true)))
    );
    expect(snap.size).toBeGreaterThan(0);
  });

  // src/services/matchingService.js — collectionGroup(db, "pairs")
  // .where("users", "array-contains", me)
  test("pairs: a matched user's pairs come back across events", async () => {
    await seed((db) =>
      setDoc(doc(db, "matches", "evtA", "pairs", "alice_bob"),
        {users: ["alice", "bob"], eventId: "evtA"})
    );
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(asUser("alice"), "pairs"), where("users", "array-contains", "alice")))
    );
    expect(snap.size).toBeGreaterThan(0);
  });

  // src/services/businessPassService.js — collectionGroup(db, "members")
  // .where("linkedUid", "==", uid)
  test("members: the linked attendee's own member records come back across businesses", async () => {
    await seed((db) =>
      setDoc(doc(db, "businesses", "biz1", "members", "mem1"),
        {linkedUid: "alice", businessName: "Biz One"})
    );
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(asUser("alice"), "members"), where("linkedUid", "==", "alice")))
    );
    expect(snap.size).toBeGreaterThan(0);
  });

  // src/services/momentService.js — collectionGroup(db, "momentItems")
  // .where("expiresAt", ">", Timestamp.now())
  test("momentItems: non-expired moments come back for any signed-in user", async () => {
    const future = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
    await seed((db) =>
      setDoc(doc(db, "moments", "alice", "momentItems", "m1"),
        {authorId: "alice", expiresAt: future})
    );
    const past = Timestamp.fromMillis(Date.now() - 60 * 1000);
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(asUser("someone"), "momentItems"), where("expiresAt", ">", past)))
    );
    expect(snap.size).toBeGreaterThan(0);
  });
});
