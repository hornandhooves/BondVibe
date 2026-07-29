/**
 * Regression guard for collectionGroup() queries against firestore.rules
 * (KIN-138/139/140).
 *
 * A collectionGroup query that a rule doesn't (or stops) authorizing doesn't
 * throw for the caller — it just returns 0 docs. Silent, not loud: exactly
 * the failure mode that let the roster/pairs collectionGroup queries run
 * unauthorized (and empty) before firestore.rules grew the recursive-
 * wildcard rules they needed. One authenticated assertSucceeds() per
 * collectionGroup, seeded so a real doc SHOULD come back — if a rule
 * regresses to deny, this goes red instead of just quietly returning
 * nothing.
 *
 * Five of these (roster, pairs, sessionTypes, members, momentItems) mirror a
 * real collectionGroup() call in src/ today (see the comment above each
 * test). `bookings` does NOT currently have a live src/ caller — only the
 * recursive-wildcard rule exists (functions/index.js has no client-facing
 * equivalent either, as of this writing) — this test guards the RULE, not a
 * query in production use. Included because it was asked for explicitly;
 * flagging the distinction so it isn't mistaken for "this query runs today".
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

describe("collectionGroup queries — every rule must resolve a real query, not silently empty", () => {
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

  // src/services/matchingService.js:581 — collectionGroup(db, "pairs")
  // .where("users", "array-contains", me).orderBy("createdAt", "desc")
  test("pairs: a matched user's pairs come back across events", async () => {
    await seed((db) =>
      setDoc(doc(db, "matches", "evtA", "pairs", "alice_bob"),
        {users: ["alice", "bob"], eventId: "evtA", createdAt: Timestamp.now()})
    );
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(asUser("alice"), "pairs"), where("users", "array-contains", "alice")))
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

  // firestore.rules only — NO live src/ caller as of this writing (see file
  // header). Guards the rule so it doesn't regress silently even without a
  // production query exercising it yet.
  test("bookings: the buyer's own bookings come back across businesses", async () => {
    await seed((db) =>
      setDoc(doc(db, "businesses", "biz1", "bookings", "bk1"),
        {buyerUid: "alice", status: "confirmed"})
    );
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(asUser("alice"), "bookings"), where("buyerUid", "==", "alice")))
    );
    expect(snap.size).toBeGreaterThan(0);
  });
});
