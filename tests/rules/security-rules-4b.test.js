/**
 * Rules tests for fix/security-rules-4b — three firestore.rules hardenings:
 *  1. Finance (payments/expenses/goals) is a CAPABILITY gate (role perms.finance
 *     == true), not a "not reception" blocklist — so manager/instructor and any
 *     custom role with perms:{} no longer read finance.
 *  2. Community posts (communityId set) are readable only by that community's
 *     members; personal posts (no communityId) stay public to signed-in users.
 *  3. A moment's expiresAt must be a timestamp INSIDE the ~24h window — no
 *     permanent moments that dodge the purge.
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
    projectId: "kinlo-rules-4b",
    firestore: {rules: read("firestore.rules"), host: "127.0.0.1", port: 8080},
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

// ── 1. Finance capability gate ──────────────────────────────────────────────
const BIZ = "biz1";
const seedBiz = () =>
  seed(async (db) => {
    await setDoc(doc(db, "businesses", BIZ), {ownerUid: "owner"});
    // Seeded RBAC roles (src/constants/businessRoles.js): only owner has finance.
    await setDoc(doc(db, "businesses", BIZ, "roles", "owner"),
      {perms: {finance: true}});
    await setDoc(doc(db, "businesses", BIZ, "roles", "manager"),
      {perms: {finance: false, dashboard: true}});
    await setDoc(doc(db, "businesses", BIZ, "roles", "instructor"),
      {perms: {finance: false, classes: true}});
    // A custom role the host created with an empty perms map.
    await setDoc(doc(db, "businesses", BIZ, "roles", "custom_empty"), {perms: {}});
    // A custom role explicitly granted finance.
    await setDoc(doc(db, "businesses", BIZ, "roles", "bookkeeper"),
      {perms: {finance: true}});
    for (const [uid, role] of [
      ["mgr", "manager"], ["inst", "instructor"],
      ["cust", "custom_empty"], ["book", "bookkeeper"],
    ]) {
      await setDoc(doc(db, "businesses", BIZ, "staff", uid),
        {uid, role, status: "active"});
    }
    await setDoc(doc(db, "businesses", BIZ, "payments", "p1"), {amount: 100});
  });

describe("finance capability gate", () => {
  test("FIX: an instructor CANNOT read finance", async () => {
    await seedBiz();
    await assertFails(getDoc(doc(asUser("inst"), "businesses", BIZ, "payments", "p1")));
  });

  test("FIX: a manager CANNOT read finance (perms.finance == false)", async () => {
    await seedBiz();
    await assertFails(getDoc(doc(asUser("mgr"), "businesses", BIZ, "payments", "p1")));
  });

  test("FIX: a custom role with perms:{} CANNOT read finance", async () => {
    await seedBiz();
    await assertFails(getDoc(doc(asUser("cust"), "businesses", BIZ, "payments", "p1")));
    await assertFails(getDoc(doc(asUser("cust"), "businesses", BIZ, "expenses", "x1")));
    await assertFails(getDoc(doc(asUser("cust"), "businesses", BIZ, "goals", "g1")));
  });

  test("NO OVER-BLOCK: the owner reads + writes finance", async () => {
    await seedBiz();
    await assertSucceeds(getDoc(doc(asUser("owner"), "businesses", BIZ, "payments", "p1")));
    await assertSucceeds(
      setDoc(doc(asUser("owner"), "businesses", BIZ, "expenses", "x2"), {amount: 5}));
  });

  test("NO OVER-BLOCK: a custom role WITH perms.finance==true reads finance", async () => {
    await seedBiz();
    await assertSucceeds(
      getDoc(doc(asUser("book"), "businesses", BIZ, "payments", "p1")));
  });
});

// ── 2. Community post privacy ───────────────────────────────────────────────
const seedPosts = () =>
  seed(async (db) => {
    await setDoc(doc(db, "hostGroups", "c1"),
      {hostId: "host", memberIds: ["member"]});
    await setDoc(doc(db, "posts", "pubPost"),
      {authorId: "host", communityId: null});
    await setDoc(doc(db, "posts", "commPost"),
      {authorId: "host", communityId: "c1"});
    await setDoc(doc(db, "posts", "commPost", "comments", "k1"),
      {authorId: "member", text: "hi"});
  });

describe("community post privacy", () => {
  test("FIX: a non-member CANNOT read a private community post", async () => {
    await seedPosts();
    await assertFails(getDoc(doc(asUser("stranger"), "posts", "commPost")));
  });

  test("FIX: a non-member CANNOT read a community post's comments", async () => {
    await seedPosts();
    await assertFails(
      getDoc(doc(asUser("stranger"), "posts", "commPost", "comments", "k1")));
  });

  test("FIX: a non-member's community-wall QUERY is rejected", async () => {
    await seedPosts();
    // where('communityId','==','c1') would return commPost, which the stranger
    // can't read → the whole query is denied (rules can't prove every result).
    const {query, where} = require("firebase/firestore");
    const q = query(collection(asUser("stranger"), "posts"),
      where("communityId", "==", "c1"));
    await assertFails(getDocs(q));
    // The member's same query works (control).
    const qm = query(collection(asUser("member"), "posts"),
      where("communityId", "==", "c1"));
    await assertSucceeds(getDocs(qm));
  });

  test("NO OVER-BLOCK: the community member reads the post", async () => {
    await seedPosts();
    await assertSucceeds(getDoc(doc(asUser("member"), "posts", "commPost")));
    await assertSucceeds(getDoc(doc(asUser("host"), "posts", "commPost")));
  });

  test("NO OVER-BLOCK: a personal post stays public to signed-in users", async () => {
    await seedPosts();
    await assertSucceeds(getDoc(doc(asUser("stranger"), "posts", "pubPost")));
  });
});

// ── 3. Moment expiry bound ──────────────────────────────────────────────────
describe("moment expiresAt bound", () => {
  const item = (expiresAt) => ({authorId: "amy", expiresAt, url: "u"});

  test("FIX: a moment expiring far in the future is denied", async () => {
    const farOut = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365); // 1 year
    await assertFails(
      setDoc(doc(asUser("amy"), "moments", "amy", "momentItems", "m1"),
        item(farOut)));
  });

  test("FIX: a non-timestamp expiresAt is denied", async () => {
    await assertFails(
      setDoc(doc(asUser("amy"), "moments", "amy", "momentItems", "m2"),
        item("soon")));
  });

  test("NO OVER-BLOCK: a moment expiring in ~23h is allowed", async () => {
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 23);
    await assertSucceeds(
      setDoc(doc(asUser("amy"), "moments", "amy", "momentItems", "m3"),
        item(soon)));
  });
});
