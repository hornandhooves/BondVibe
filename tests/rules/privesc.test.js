/* global Buffer */
/**
 * Security-rules tests for fix/security-rules-privesc.
 *
 * Each finding gets three tests:
 *   1. EXPLOIT  — run against the PRE-FIX rules (tests/rules/fixtures/*), proving
 *                 the hole was real and reachable from a plain client.
 *   2. FIX      — the same attack against the CURRENT rules, now denied.
 *   3. NO OVER-BLOCK — the legitimate path the app depends on still works, so
 *                 the fix doesn't quietly break the product.
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
const { doc, setDoc, updateDoc, getDoc } = require("firebase/firestore");
const { ref, uploadBytes, getBytes } = require("firebase/storage");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const FS_EMU = { host: "127.0.0.1", port: 8080 };
const ST_EMU = { host: "127.0.0.1", port: 9199 };

// A 1x1 PNG — small, and a contentType the storage rules whitelist accepts.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PNG_META = { contentType: "image/png" };

let fixed; // current (patched) rules
let vuln; //  pre-fix rules, for exploit demonstration

// NOTE (storage): unlike Firestore, the Storage emulator keeps ONE global
// ruleset rather than one per projectId — whichever environment loaded rules
// last wins for every project. So storage rules are NOT configured here; the
// F6 block loads the ruleset it needs immediately before each test via
// withStorageRules() below. Configuring them here silently tested the wrong
// ruleset (the permissive fixture leaked into the "fixed" expectations).
beforeAll(async () => {
  fixed = await initializeTestEnvironment({
    projectId: "kinlo-rules-fixed",
    firestore: { rules: read("firestore.rules"), ...FS_EMU },
  });
  vuln = await initializeTestEnvironment({
    projectId: "kinlo-rules-vuln",
    firestore: { rules: read("tests/rules/fixtures/vulnerable.firestore.rules"), ...FS_EMU },
  });
});

afterAll(async () => {
  await fixed?.cleanup();
  await vuln?.cleanup();
});

beforeEach(async () => {
  await Promise.all([fixed.clearFirestore(), vuln.clearFirestore()]);
});

/**
 * Run `fn` against a Storage emulator freshly loaded with `rulesPath`.
 * Because the emulator holds a single global ruleset, loading it per test is
 * what makes "pre-fix vs current" comparisons meaningful.
 */
async function withStorageRules(rulesPath, fn) {
  const env = await initializeTestEnvironment({
    projectId: "kinlo-rules-storage",
    storage: { rules: read(rulesPath), ...ST_EMU },
  });
  try {
    await env.clearStorage();
    await fn(env);
  } finally {
    await env.cleanup();
  }
}

/** Seed docs bypassing rules (this is state the server/admin would have set). */
const seed = (env, fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const asUser = (env, uid, claims) => env.authenticatedContext(uid, claims).firestore();

// ===========================================================================
// FINDING 1 — users CREATE let a brand-new account self-grant hostApproved.
// isApprovedHost() trusts that flag, so admin approval was bypassable at signup.
// ===========================================================================
describe("F1 · users.create — self-granted hostApproved", () => {
  const payload = { role: "user", displayName: "Mallory", hostApproved: true };

  test("EXPLOIT (pre-fix): a new account creates itself already approved as host", async () => {
    const db = asUser(vuln, "mallory");
    await assertSucceeds(setDoc(doc(db, "users", "mallory"), payload));

    // Impact: isApprovedHost() now passes, so the unified host gate opens —
    // this account can publish a rental vehicle without any admin approval.
    await assertSucceeds(
      setDoc(doc(db, "vehicles", "v1"), { ownerId: "mallory", title: "Moto" })
    );
  });

  test("FIX: hostApproved is rejected at create", async () => {
    const db = asUser(fixed, "mallory");
    await assertFails(setDoc(doc(db, "users", "mallory"), payload));
  });

  test("FIX: hostConfig is rejected at create too", async () => {
    const db = asUser(fixed, "mallory");
    await assertFails(
      setDoc(doc(db, "users", "mallory"), { role: "user", hostConfig: { tier: "pro" } })
    );
  });

  test("NO OVER-BLOCK: a normal signup still succeeds", async () => {
    const db = asUser(fixed, "alice");
    await assertSucceeds(
      setDoc(doc(db, "users", "alice"), { role: "user", displayName: "Alice", city: "CDMX" })
    );
  });

  test("NO OVER-BLOCK: a plain user still can't publish a vehicle (gate intact)", async () => {
    await seed(fixed, (db) => setDoc(doc(db, "users", "alice"), { role: "user" }));
    const db = asUser(fixed, "alice");
    await assertFails(setDoc(doc(db, "vehicles", "v1"), { ownerId: "alice", title: "Moto" }));
  });

  test("NO OVER-BLOCK: an admin-approved host still publishes a vehicle", async () => {
    await seed(fixed, (db) =>
      setDoc(doc(db, "users", "hostie"), { role: "user", hostApproved: true })
    );
    const db = asUser(fixed, "hostie");
    await assertSucceeds(setDoc(doc(db, "vehicles", "v1"), { ownerId: "hostie", title: "Moto" }));
  });
});

// ===========================================================================
// FINDING 2 — businesses UPDATE was unrestricted for staff, allowing an
// ownerUid takeover and self-granted verified/insured.
// ===========================================================================
describe("F2 · businesses.update — staff takeover + verified/insured", () => {
  const seedBiz = (env) =>
    seed(env, async (db) => {
      await setDoc(doc(db, "businesses", "biz1"), {
        ownerUid: "owner1",
        name: "Estudio Kinlo",
        verified: false,
        insured: false,
      });
      await setDoc(doc(db, "businesses", "biz1", "staff", "staff1"), {
        status: "active",
        role: "instructor",
      });
    });

  test("EXPLOIT (pre-fix): staff rewrites ownerUid and takes the business over", async () => {
    await seedBiz(vuln);
    const db = asUser(vuln, "staff1");
    await assertSucceeds(updateDoc(doc(db, "businesses", "biz1"), { ownerUid: "staff1" }));

    // isBizOwnerUid() reads that very field, so the attacker is now the owner.
    // (withSecurityRulesDisabled resolves to void, so capture the snapshot.)
    let after;
    await vuln.withSecurityRulesDisabled(async (ctx) => {
      after = await getDoc(doc(ctx.firestore(), "businesses", "biz1"));
    });
    expect(after.data().ownerUid).toBe("staff1");
  });

  test("EXPLOIT (pre-fix): staff self-grants verified + insured", async () => {
    await seedBiz(vuln);
    const db = asUser(vuln, "staff1");
    await assertSucceeds(
      updateDoc(doc(db, "businesses", "biz1"), { verified: true, insured: true })
    );
  });

  test("FIX: staff can no longer rewrite ownerUid", async () => {
    await seedBiz(fixed);
    const db = asUser(fixed, "staff1");
    await assertFails(updateDoc(doc(db, "businesses", "biz1"), { ownerUid: "staff1" }));
  });

  test("FIX: not even the owner may set verified/insured", async () => {
    await seedBiz(fixed);
    const db = asUser(fixed, "owner1");
    await assertFails(updateDoc(doc(db, "businesses", "biz1"), { verified: true }));
    await assertFails(updateDoc(doc(db, "businesses", "biz1"), { insured: true }));
  });

  test("NO OVER-BLOCK: staff still edits ordinary business fields", async () => {
    await seedBiz(fixed);
    const db = asUser(fixed, "staff1");
    await assertSucceeds(updateDoc(doc(db, "businesses", "biz1"), { name: "Estudio Kinlo Sur" }));
  });
});

// ===========================================================================
// FINDING 3 — 'suspended' was absent from the users UPDATE denylist, so a
// suspended account could reinstate itself.
// ===========================================================================
describe("F3 · users.update — self-reinstatement after suspension", () => {
  const seedSuspended = (env) =>
    seed(env, (db) =>
      setDoc(doc(db, "users", "mallory"), { role: "user", suspended: true, displayName: "M" })
    );

  test("EXPLOIT (pre-fix): the suspended user un-suspends themselves", async () => {
    await seedSuspended(vuln);
    const db = asUser(vuln, "mallory");
    await assertSucceeds(updateDoc(doc(db, "users", "mallory"), { suspended: false }));
  });

  test("FIX: self-clearing 'suspended' is denied", async () => {
    await seedSuspended(fixed);
    const db = asUser(fixed, "mallory");
    await assertFails(updateDoc(doc(db, "users", "mallory"), { suspended: false }));
  });

  test("NO OVER-BLOCK: an admin still reinstates the account", async () => {
    await seedSuspended(fixed);
    const db = asUser(fixed, "admin1", { admin: true });
    await assertSucceeds(updateDoc(doc(db, "users", "mallory"), { suspended: false }));
  });

  test("NO OVER-BLOCK: the user still edits their own profile", async () => {
    await seedSuspended(fixed);
    const db = asUser(fixed, "mallory");
    await assertSucceeds(updateDoc(doc(db, "users", "mallory"), { displayName: "Mallory B" }));
  });
});

// ===========================================================================
// FINDING 4 — matchmaking.freeTrialEndsAt is the Curated Matching entitlement
// (curatedGate.gateFor unlocks while now < freeTrialEndsAt) and was self-writable.
// The map itself must stay writable: consent + settings are client-side.
// ===========================================================================
describe("F4 · users.update — self-granted Plus trial via matchmaking", () => {
  const YEAR_2999 = new Date("2999-01-01T00:00:00Z");
  const seedMember = (env, matchmaking) =>
    seed(env, (db) =>
      setDoc(doc(db, "users", "mallory"), {
        role: "user",
        plan: "free",
        matchmaking: matchmaking ?? { consentAt: new Date("2026-01-01T00:00:00Z"), enabled: true },
      })
    );

  test("EXPLOIT (pre-fix): a free user grants themselves an endless Plus trial", async () => {
    await seedMember(vuln);
    const db = asUser(vuln, "mallory");
    await assertSucceeds(
      setDoc(
        doc(db, "users", "mallory"),
        { matchmaking: { freeTrialEndsAt: YEAR_2999 } },
        { merge: true }
      )
    );
  });

  test("FIX: writing freeTrialEndsAt is denied", async () => {
    await seedMember(fixed);
    const db = asUser(fixed, "mallory");
    await assertFails(
      setDoc(
        doc(db, "users", "mallory"),
        { matchmaking: { freeTrialEndsAt: YEAR_2999 } },
        { merge: true }
      )
    );
  });

  test("FIX: extending a server-granted trial is denied", async () => {
    await seedMember(fixed, {
      consentAt: new Date("2026-01-01T00:00:00Z"),
      enabled: true,
      freeTrialEndsAt: new Date("2026-02-01T00:00:00Z"),
    });
    const db = asUser(fixed, "mallory");
    await assertFails(
      setDoc(
        doc(db, "users", "mallory"),
        { matchmaking: { freeTrialEndsAt: YEAR_2999 } },
        { merge: true }
      )
    );
  });

  test("FIX: a full overwrite that drops freeTrialEndsAt is denied", async () => {
    await seedMember(fixed, {
      consentAt: new Date("2026-01-01T00:00:00Z"),
      freeTrialEndsAt: new Date("2026-02-01T00:00:00Z"),
    });
    const db = asUser(fixed, "mallory");
    // No merge → matchmaking is replaced and the entitlement value changes.
    await assertFails(
      setDoc(doc(db, "users", "mallory"), { role: "user", matchmaking: { enabled: true } })
    );
  });

  test("NO OVER-BLOCK: MatchConsent still records consentAt", async () => {
    await seed(fixed, (db) => setDoc(doc(db, "users", "mallory"), { role: "user", plan: "free" }));
    const db = asUser(fixed, "mallory");
    await assertSucceeds(
      setDoc(
        doc(db, "users", "mallory"),
        { matchmaking: { consentAt: new Date(), enabled: true } },
        { merge: true }
      )
    );
  });

  test("NO OVER-BLOCK: MatchmakingSettings still toggles enabled", async () => {
    await seedMember(fixed, {
      consentAt: new Date("2026-01-01T00:00:00Z"),
      enabled: true,
      freeTrialEndsAt: new Date("2026-02-01T00:00:00Z"),
    });
    const db = asUser(fixed, "mallory");
    // Deep merge keeps freeTrialEndsAt untouched, so the guard passes.
    await assertSucceeds(
      setDoc(doc(db, "users", "mallory"), { matchmaking: { enabled: false } }, { merge: true })
    );
  });

  test("NO OVER-BLOCK: an admin still grants a trial", async () => {
    await seedMember(fixed);
    const db = asUser(fixed, "admin1", { admin: true });
    await assertSucceeds(
      setDoc(
        doc(db, "users", "mallory"),
        { matchmaking: { freeTrialEndsAt: YEAR_2999 } },
        { merge: true }
      )
    );
  });
});

// ===========================================================================
// FINDING 5 — vehicles.status belongs to the rental state machine (Admin SDK
// only), but the owner could write it and desync a paid reservation.
// ===========================================================================
describe("F5 · vehicles.update — owner desyncs rental status", () => {
  const seedReserved = (env) =>
    seed(env, async (db) => {
      await setDoc(doc(db, "users", "hostie"), { role: "user", hostApproved: true });
      await setDoc(doc(db, "vehicles", "v1"), {
        ownerId: "hostie",
        title: "Moto",
        status: "reserved",
        pricePerDay: 400,
      });
    });

  test("EXPLOIT (pre-fix): the owner clears 'reserved' out from under a booking", async () => {
    await seedReserved(vuln);
    const db = asUser(vuln, "hostie");
    await assertSucceeds(updateDoc(doc(db, "vehicles", "v1"), { status: "available" }));
  });

  test("FIX: the owner can no longer write status", async () => {
    await seedReserved(fixed);
    const db = asUser(fixed, "hostie");
    await assertFails(updateDoc(doc(db, "vehicles", "v1"), { status: "available" }));
  });

  test("NO OVER-BLOCK: the owner still edits their listing", async () => {
    await seedReserved(fixed);
    const db = asUser(fixed, "hostie");
    await assertSucceeds(updateDoc(doc(db, "vehicles", "v1"), { pricePerDay: 500 }));
  });

  test("NO OVER-BLOCK: an admin keeps the support escape hatch", async () => {
    await seedReserved(fixed);
    const db = asUser(fixed, "admin1", { admin: true });
    await assertSucceeds(updateDoc(doc(db, "vehicles", "v1"), { status: "available" }));
  });
});

// ===========================================================================
// FINDING 6 (storage.rules) — business expense receipts were readable by ANY
// signed-in user: invoices, amounts, vendor and bank details.
// ===========================================================================
describe("F6 · storage businesses/{bizId}/expenses — receipt leak", () => {
  const RECEIPT = "businesses/biz1/expenses/receipt.png";
  const VULN_RULES = "tests/rules/fixtures/vulnerable.storage.rules";
  const REAL_RULES = "storage.rules";
  const putReceipt = (env) =>
    env.withSecurityRulesDisabled((ctx) =>
      uploadBytes(ref(ctx.storage(), RECEIPT), PNG, PNG_META)
    );

  test("EXPLOIT (pre-fix): an unrelated signed-in user downloads the receipt", async () => {
    await withStorageRules(VULN_RULES, async (env) => {
      await putReceipt(env);
      const st = env.authenticatedContext("mallory").storage();
      await assertSucceeds(getBytes(ref(st, RECEIPT)));
    });
  });

  test("FIX: an unrelated user is denied", async () => {
    await withStorageRules(REAL_RULES, async (env) => {
      await putReceipt(env);
      const st = env.authenticatedContext("mallory").storage();
      await assertFails(getBytes(ref(st, RECEIPT)));
    });
  });

  test("NO OVER-BLOCK: the business owner still reads their own receipt", async () => {
    await withStorageRules(REAL_RULES, async (env) => {
      await putReceipt(env);
      const st = env.authenticatedContext("biz1").storage(); // v1: bizId === owner uid
      await assertSucceeds(getBytes(ref(st, RECEIPT)));
    });
  });

  test("NO OVER-BLOCK: the owner still uploads a receipt", async () => {
    await withStorageRules(REAL_RULES, async (env) => {
      const st = env.authenticatedContext("biz1").storage();
      await assertSucceeds(
        uploadBytes(ref(st, "businesses/biz1/expenses/new.png"), PNG, PNG_META)
      );
    });
  });

  test("a stranger still cannot upload into someone else's expenses", async () => {
    await withStorageRules(REAL_RULES, async (env) => {
      const st = env.authenticatedContext("mallory").storage();
      await assertFails(uploadBytes(ref(st, RECEIPT), PNG, PNG_META));
    });
  });
});
