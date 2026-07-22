/**
 * Rules tests for fix/security-carpool (Round 5) — carpool integrity + safety.
 *   - a rider can NEVER set status:"approved" (create or update) — self-approve
 *     would farm the driver's seatsShared + unlock the pickup;
 *   - the driver can't write server-owned fields (seatsCredited/seatsTotal/driverId);
 *   - the rider roster is not visible to other participants (driver + own only);
 *   - the pickup subdoc is readable only by the driver / approved riders.
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
const { doc, setDoc, updateDoc, getDoc } = require("firebase/firestore");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const EVENT = "evt1";
const CP = "cp1";
const cpPath = ["events", EVENT, "carpools", CP];

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "kinlo-carpool",
    firestore: { rules: read("firestore.rules"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const asUser = (uid) => env.authenticatedContext(uid).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

// driver + rider1 + rider2 are all event participants (roster docs); driver drives.
const seedCarpool = () =>
  seed(async (db) => {
    await setDoc(doc(db, "events", EVENT), { creatorId: "host" });
    for (const u of ["driver", "rider1", "rider2"]) {
      await setDoc(doc(db, "events", EVENT, "roster", u), { uid: u, status: "active" });
    }
    await setDoc(doc(db, ...cpPath), {
      driverId: "driver", seatsTotal: 2, approvedCount: 0, status: "open",
    });
    await setDoc(doc(db, ...cpPath, "riders", "rider1"), { status: "requested", name: "R1" });
    await setDoc(doc(db, ...cpPath, "private", "pickup"),
      { fromAddress: "123 Calle", fromCoords: { latitude: 1, longitude: 2 } });
  });

describe("carpool integrity", () => {
  test("FIX: a rider CANNOT self-approve via update", async () => {
    await seedCarpool();
    await assertFails(
      updateDoc(doc(asUser("rider1"), ...cpPath, "riders", "rider1"), { status: "approved" })
    );
  });

  test("FIX: a rider CANNOT create themselves already approved (create forces 'requested')", async () => {
    await seedCarpool();
    await assertFails(
      setDoc(doc(asUser("rider2"), ...cpPath, "riders", "rider2"), { status: "approved" })
    );
  });

  test("FIX: the driver CANNOT write seatsCredited (loyalty sweep owns it)", async () => {
    await seedCarpool();
    await assertFails(
      updateDoc(doc(asUser("driver"), ...cpPath), { seatsCredited: true })
    );
  });

  test("FIX: the driver CANNOT bump seatsTotal (would oversell + farm seatsShared)", async () => {
    await seedCarpool();
    await assertFails(updateDoc(doc(asUser("driver"), ...cpPath), { seatsTotal: 99 }));
  });

  test("FIX: a rider CANNOT read another rider's roster doc", async () => {
    await seedCarpool();
    await assertFails(getDoc(doc(asUser("rider2"), ...cpPath, "riders", "rider1")));
  });

  test("FIX: a non-approved rider CANNOT read the pickup subdoc", async () => {
    await seedCarpool();
    await assertFails(getDoc(doc(asUser("rider1"), ...cpPath, "private", "pickup")));
  });

  // --- NO OVER-BLOCK: legit paths still work ---
  test("the driver reads the roster + the pickup", async () => {
    await seedCarpool();
    await assertSucceeds(getDoc(doc(asUser("driver"), ...cpPath, "riders", "rider1")));
    await assertSucceeds(getDoc(doc(asUser("driver"), ...cpPath, "private", "pickup")));
  });

  test("a rider requests a seat ('requested') + reads their OWN doc", async () => {
    await seedCarpool();
    await assertSucceeds(
      setDoc(doc(asUser("rider2"), ...cpPath, "riders", "rider2"),
        { status: "requested", name: "R2" })
    );
    await assertSucceeds(getDoc(doc(asUser("rider2"), ...cpPath, "riders", "rider2")));
  });

  test("the driver DECLINES a rider + edits the pickup NAME (non-server fields)", async () => {
    await seedCarpool();
    await assertSucceeds(
      updateDoc(doc(asUser("driver"), ...cpPath, "riders", "rider1"), { status: "declined" })
    );
    await assertSucceeds(updateDoc(doc(asUser("driver"), ...cpPath), { from: "New corner" }));
  });

  test("an approved rider CAN read the pickup subdoc", async () => {
    await seedCarpool();
    await seed((db) =>
      setDoc(doc(db, ...cpPath, "riders", "rider1"), { status: "approved", name: "R1" }));
    await assertSucceeds(getDoc(doc(asUser("rider1"), ...cpPath, "private", "pickup")));
  });
});
