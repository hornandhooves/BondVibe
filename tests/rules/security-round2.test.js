/* global Buffer */
/**
 * Security-rules tests for fix/security-rules-round2 (audit round 2).
 *
 *   1. [P1] storage.rules businesses/{bizId}/expenses — gate on the CURRENT
 *      ownerUid (survives an ownership transfer) + active finance staff, not the
 *      static `uid == bizId`. Cross-service: the Storage rule reads the business
 *      doc from Firestore, so this env configures BOTH.
 *   2. [P1] firestore.rules /dms create — threadId bound to the sorted uid pair,
 *      so a third party can't squat the A↔B thread with themselves in `users`.
 *   3. [P3] firestore.rules /follows create — no self-follow.
 *
 * Run:  npm run test:rules      (boots firestore+storage emulators)
 */
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { doc, setDoc } = require("firebase/firestore");
const { ref, uploadBytes, getBytes } = require("firebase/storage");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const FS_EMU = { host: "127.0.0.1", port: 8080 };
const ST_EMU = { host: "127.0.0.1", port: 9199 };

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PNG_META = { contentType: "image/png" };

let fixed; // firestore-only env for the /dms + /follows tests
beforeAll(async () => {
  fixed = await initializeTestEnvironment({
    projectId: "kinlo-r2-fs",
    firestore: { rules: read("firestore.rules"), ...FS_EMU },
  });
});
afterAll(async () => fixed?.cleanup());
beforeEach(async () => fixed.clearFirestore());

const asUser = (env, uid, claims) => env.authenticatedContext(uid, claims).firestore();

/**
 * Run `fn` against a fresh env with the REAL firestore + storage rules on one
 * project, so the Storage rule's cross-service firestore.get sees seeded data.
 * The Storage emulator holds a single global ruleset, so loading it per test
 * (serial run) keeps tests independent.
 * @param {(env: object) => Promise<void>} fn the test body
 * @return {Promise<void>} resolves when the body + cleanup finish
 */
async function withRules(fn) {
  const env = await initializeTestEnvironment({
    // Use the emulator's own project (firebase.json singleProjectMode): the
    // Storage rule's cross-service firestore.get resolves under this project, so
    // the seeded business doc must live under the SAME one.
    projectId: "kinlo-app-dev",
    firestore: { rules: read("firestore.rules"), ...FS_EMU },
    storage: { rules: read("storage.rules"), ...ST_EMU },
  });
  try {
    await env.clearFirestore();
    await env.clearStorage();
    await fn(env);
  } finally {
    // IMPORTANT: cross-service reads resolve under the single emulator project
    // (singleProjectMode), so a seeded business doc here is visible to EVERY
    // suite's storage rules. Clear it so we don't pollute e.g. privesc F6, whose
    // owner==bizId fallback depends on there being no business doc.
    try {
      await env.clearFirestore();
    } catch (e) {
      // best effort
    }
    await env.cleanup();
  }
}

// ===========================================================================
// [P1] storage.rules — expense receipts follow the CURRENT owner + finance staff
// ===========================================================================
describe("P1 · storage businesses/{bizId}/expenses — owner-transfer + finance staff", () => {
  const RECEIPT = "businesses/biz1/expenses/receipt.png";

  const seedBiz = (env, ownerUid, staff) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "businesses", "biz1"), { ownerUid, name: "Estudio Kinlo" });
      for (const [uid, s] of Object.entries(staff || {})) {
        await setDoc(doc(db, "businesses", "biz1", "staff", uid), s);
      }
    });
  const putReceipt = (env) =>
    env.withSecurityRulesDisabled((ctx) =>
      uploadBytes(ref(ctx.storage(), RECEIPT), PNG, PNG_META)
    );
  const rdReceipt = (env, uid) =>
    getBytes(ref(env.authenticatedContext(uid).storage(), RECEIPT));
  const wrReceipt = (env, uid) =>
    uploadBytes(ref(env.authenticatedContext(uid).storage(), RECEIPT), PNG, PNG_META);

  test("the current owner reads AND writes their receipts", async () => {
    await withRules(async (env) => {
      await seedBiz(env, "owner1");
      await putReceipt(env);
      await assertSucceeds(rdReceipt(env, "owner1"));
      await assertSucceeds(wrReceipt(env, "owner1"));
    });
  });

  test("an unrelated user is denied read + write", async () => {
    await withRules(async (env) => {
      await seedBiz(env, "owner1");
      await putReceipt(env);
      await assertFails(rdReceipt(env, "mallory"));
      await assertFails(wrReceipt(env, "mallory"));
    });
  });

  test("AFTER a transfer: the OLD owner loses access, the NEW owner gains it", async () => {
    await withRules(async (env) => {
      // The business now belongs to owner2 (ownerUid moved; bizId doc id unchanged).
      await seedBiz(env, "owner2");
      await putReceipt(env);
      // Old owner (== bizId under the retired rule) is now denied.
      await assertFails(rdReceipt(env, "owner1"));
      await assertFails(wrReceipt(env, "owner1"));
      // New owner can read + write.
      await assertSucceeds(rdReceipt(env, "owner2"));
      await assertSucceeds(wrReceipt(env, "owner2"));
    });
  });

  test("bizId != ownerUid: a uid that merely equals the doc id is NOT authorized", async () => {
    await withRules(async (env) => {
      await seedBiz(env, "owner2"); // ownerUid is owner2, doc id is "biz1"
      await putReceipt(env);
      // "biz1" as a uid is not the owner anymore — the old `uid == bizId` hole.
      await assertFails(rdReceipt(env, "biz1"));
    });
  });

  test("active finance staff (instructor) may read; reception + inactive may not", async () => {
    await withRules(async (env) => {
      await seedBiz(env, "owner1", {
        fin: { status: "active", role: "instructor" },
        rec: { status: "active", role: "reception" },
        pending: { status: "invited", role: "instructor" },
      });
      await putReceipt(env);
      await assertSucceeds(rdReceipt(env, "fin"));
      await assertFails(rdReceipt(env, "rec")); // reception excluded from finance
      await assertFails(rdReceipt(env, "pending")); // not active
    });
  });
});

// ===========================================================================
// [P1] firestore.rules /dms — create binds threadId to the sorted user pair
// ===========================================================================
describe("P1 · dms create — threadId bound to the user pair", () => {
  const A = "alice";
  const B = "bob";
  const E = "eve"; // attacker; sorts after alice/bob
  const pairId = (x, y) => [x, y].sort().join("_");

  test("FIX: a third party cannot squat dms/{sort(A,B)} with users [E, A]", async () => {
    const db = asUser(fixed, E);
    // Doc id targets A↔B's canonical thread, but users lists the attacker.
    await assertFails(
      setDoc(doc(db, "dms", pairId(A, B)), {
        users: [E, A].sort(), // ["alice","eve"] — id "alice_bob" won't match "alice_eve"
        createdAt: new Date(),
        lastMessage: "",
      })
    );
  });

  test("FIX: even the real pair can't be created by a non-participant", async () => {
    const db = asUser(fixed, E);
    await assertFails(
      setDoc(doc(db, "dms", pairId(A, B)), { users: [A, B].sort(), createdAt: new Date() })
    );
  });

  test("FIX: a mismatched id (users don't hash to it) is rejected", async () => {
    const db = asUser(fixed, A);
    await assertFails(
      setDoc(doc(db, "dms", "not_the_pair_id"), { users: [A, B].sort(), createdAt: new Date() })
    );
  });

  test("NO OVER-BLOCK: A opens the canonical A↔B thread", async () => {
    const db = asUser(fixed, A);
    await assertSucceeds(
      setDoc(doc(db, "dms", pairId(A, B)), {
        users: [A, B].sort(),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessage: "",
      })
    );
  });

  test("NO OVER-BLOCK: B can (idempotently) open the same thread", async () => {
    const db = asUser(fixed, B);
    await assertSucceeds(
      setDoc(doc(db, "dms", pairId(A, B)), { users: [A, B].sort(), createdAt: new Date() })
    );
  });

  test("NO OVER-BLOCK: E can still start their OWN thread with A", async () => {
    const db = asUser(fixed, E);
    await assertSucceeds(
      setDoc(doc(db, "dms", pairId(E, A)), { users: [E, A].sort(), createdAt: new Date() })
    );
  });
});

// ===========================================================================
// [P3] firestore.rules /follows — no self-follow
// ===========================================================================
describe("P3 · follows create — no self-follow", () => {
  test("FIX: a user cannot follow themselves", async () => {
    const db = asUser(fixed, "alice");
    await assertFails(
      setDoc(doc(db, "follows", "alice_alice"), { followerId: "alice", followeeId: "alice" })
    );
  });

  test("NO OVER-BLOCK: following another user still works", async () => {
    const db = asUser(fixed, "alice");
    await assertSucceeds(
      setDoc(doc(db, "follows", "alice_bob"), { followerId: "alice", followeeId: "bob" })
    );
  });
});
