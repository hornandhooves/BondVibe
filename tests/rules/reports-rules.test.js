/**
 * KIN-114 — /reports create rules. Root cause of the 100%-broken Report
 * button: ReportScreen wrote `reportedBy`, this rule requires `reporterId`,
 * so every user-initiated report was permission-denied and the screen showed
 * a false "thank you" (see git history / KIN-114 for the full diagnosis).
 *
 * RP2 is the regression test for that historical bug — it can't reappear
 * from the current code (ReportScreen has written reporterId since KIN-119),
 * so it stays as a pinned regression guard, not the live risk surface.
 * RP8/RP9 prove the create rule doesn't over-block the two writers that
 * already worked (reportProhibitedContent, reportUserBlock).
 *
 * RP10-RP13 (KIN-117 QA fix #4 follow-up) are what actually gate the LIVE
 * risk surface today: the create rule flipped from a denylist (which missed
 * takenBy/takenAt the moment moderateReport introduced them, and could never
 * block `source`) to an allowlist of the exact 13 fields the three live
 * client writers ever set — RP10-12 prove a client can't plant an
 * admin/server-only field this way, RP13 proves update is closed to
 * everyone (moderateReport, Admin SDK, is the only write path left).
 *
 * Run: npm run test:rules (boots the firestore emulator)
 */
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { doc, setDoc, getDoc, updateDoc } = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const FS_EMU = { host: "127.0.0.1", port: 8080 };

let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-rules-reports",
    firestore: { rules: read("firestore.rules"), ...FS_EMU },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const asUser = (uid, claims) => env.authenticatedContext(uid, claims).firestore();

// The valid create payload every test builds on.
const validReport = (over = {}) => ({
  reporterId: "reporter1",
  type: "user",
  status: "open",
  targetUserId: "victim1",
  targetEventId: null,
  targetName: "Victim",
  reason: "harassmentOrBullying",
  details: "",
  createdAt: new Date().toISOString(),
  ...over,
});

describe("RP · reports.create", () => {
  test("RP1 a signed-in user creates a report with reporterId == their uid, status:open", async () => {
    const db = asUser("reporter1");
    await assertSucceeds(setDoc(doc(db, "reports", "r1"), validReport()));
  });

  test("RP2 REGRESSION: the original broken payload (reportedBy, not reporterId) is denied", async () => {
    const db = asUser("reporter1");
    const broken = {
      type: "user",
      status: "pending",
      targetId: "victim1",
      targetName: "Victim",
      reportedBy: "reporter1",
      reason: "harassmentOrBullying",
      details: "",
      createdAt: new Date().toISOString(),
    };
    await assertFails(setDoc(doc(db, "reports", "r2"), broken));
  });

  test("RP3 reporterId pointing at a DIFFERENT uid is denied", async () => {
    const db = asUser("attacker1");
    await assertFails(setDoc(doc(db, "reports", "r3"), validReport({ reporterId: "victim1" })));
  });

  test("RP4 a self-assigned status:'resolved' at create time is denied", async () => {
    const db = asUser("reporter1");
    await assertFails(setDoc(doc(db, "reports", "r4"), validReport({ status: "resolved" })));
  });

  test("RP5 planting resolution/reviewedBy at create time is denied", async () => {
    const db = asUser("reporter1");
    await assertFails(setDoc(doc(db, "reports", "r5"),
      validReport({ resolution: "no_action", reviewedBy: "reporter1" })));
  });

  test("RP6 details over 2000 chars is denied", async () => {
    const db = asUser("reporter1");
    await assertFails(setDoc(doc(db, "reports", "r6"),
      validReport({ details: "x".repeat(2001) })));
  });

  test("RP7 the reporter reads their own report; a third party cannot", async () => {
    await seed((db) => setDoc(doc(db, "reports", "r7"), validReport()));
    const own = asUser("reporter1");
    await assertSucceeds(getDoc(doc(own, "reports", "r7")));
    const stranger = asUser("someone_else");
    await assertFails(getDoc(doc(stranger, "reports", "r7")));
  });

  test("RP8 NO OVER-BLOCK: reportProhibitedContent's exact payload shape still succeeds", async () => {
    const db = asUser("reporter1");
    await assertSucceeds(setDoc(doc(db, "reports", "r8"), {
      reporterId: "reporter1",
      status: "open",
      createdAt: new Date().toISOString(),
      type: "prohibited_content",
      reason: "bank_details",
      content: "some flagged text",
      groupId: null,
      eventId: null,
    }));
  });

  test("RP9 NO OVER-BLOCK: reportUserBlock's exact payload shape still succeeds", async () => {
    const db = asUser("reporter1");
    await assertSucceeds(setDoc(doc(db, "reports", "r9"), {
      reporterId: "reporter1",
      status: "open",
      createdAt: new Date().toISOString(),
      type: "user_block",
      groupId: "grp1",
      targetUserId: "victim1",
      reason: "harassment",
      evidenceUrl: null,
    }));
  });

  test("RP10 KIN-117: a client can't plant takenBy/takenAt at creation (allowlist, not denylist)", async () => {
    const db = asUser("reporter1");
    await assertFails(setDoc(doc(db, "reports", "r10"),
      validReport({ takenBy: "admin1", takenAt: new Date().toISOString() })));
  });

  test("RP11 KIN-117: a client can't fake the SERVER badge by planting source:'server'", async () => {
    const db = asUser("reporter1");
    await assertFails(setDoc(doc(db, "reports", "r11"), validReport({ source: "server" })));
  });

  test("RP12 KIN-117: ANY field outside the allowlist is denied — this is what keeps it an allowlist", async () => {
    const db = asUser("reporter1");
    await assertFails(setDoc(doc(db, "reports", "r12"), validReport({ foo: "bar" })));
  });

  test("RP13 KIN-117: update is closed to everyone, including admins — moderateReport (Admin SDK) is the only write path", async () => {
    await seed((db) => setDoc(doc(db, "reports", "r13"), validReport()));
    const admin = asUser("admin1", { admin: true });
    await assertFails(updateDoc(doc(admin, "reports", "r13"), { status: "in_review", reviewedBy: "admin1" }));
  });
});
