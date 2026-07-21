/**
 * Rules tests for feat/payments-escrow (docs/DISENO_escrow_pagos.md §3/§7).
 * paymentLedger + hostPayoutAccounts are server-only; settings/payouts is
 * admin-writable and rejects a negative retention.
 *
 * Run: npm run test:rules
 */
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {doc, setDoc, getDoc} = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const FS_EMU = {host: "127.0.0.1", port: 8080};

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-escrow-rules",
    firestore: {rules: read("firestore.rules"), ...FS_EMU},
  });
});
afterAll(async () => env && env.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

describe("paymentLedger + hostPayoutAccounts — server-only (§3)", () => {
  test("a signed-in user cannot READ a ledger row", async () => {
    await seed((db) => setDoc(doc(db, "paymentLedger", "pi_1"), {state: "held"}));
    const db = asUser("mallory", {email_verified: true});
    await assertFails(getDoc(doc(db, "paymentLedger", "pi_1")));
  });

  test("a signed-in user cannot WRITE a ledger row (no self-release)", async () => {
    const db = asUser("mallory", {email_verified: true});
    await assertFails(setDoc(doc(db, "paymentLedger", "pi_2"), {state: "released"}));
  });

  test("an admin cannot write the ledger either (Admin SDK only)", async () => {
    const db = asUser("admin1", {admin: true});
    await assertFails(setDoc(doc(db, "paymentLedger", "pi_3"), {state: "released"}));
  });

  test("hostPayoutAccounts (per-host debt) is not client-writable", async () => {
    const db = asUser("mallory", {email_verified: true});
    await assertFails(setDoc(doc(db, "hostPayoutAccounts", "mallory"), {penaltyOwed: 0}));
  });
});

describe("settings/payouts — admin retention control (§7)", () => {
  test("an admin can set a non-negative retention", async () => {
    const db = asUser("admin1", {admin: true});
    await assertSucceeds(setDoc(doc(db, "settings", "payouts"), {retentionHours: 12}));
  });

  test("HARD FLOOR: the rule rejects a NEGATIVE retention", async () => {
    const db = asUser("admin1", {admin: true});
    await assertFails(setDoc(doc(db, "settings", "payouts"), {retentionHours: -1}));
  });

  test("a non-admin cannot write settings", async () => {
    const db = asUser("mallory", {email_verified: true});
    await assertFails(setDoc(doc(db, "settings", "payouts"), {retentionHours: 24}));
  });

  test("any signed-in user can READ settings (dashboard display)", async () => {
    await seed((db) => setDoc(doc(db, "settings", "payouts"), {retentionHours: 24}));
    const db = asUser("someone", {email_verified: true});
    await assertSucceeds(getDoc(doc(db, "settings", "payouts")));
  });
});
