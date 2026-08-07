/**
 * KIN-190 — placeholder staff: create one for a person with no account yet,
 * and replace it with a real staff doc once they have one.
 *
 * The claim is a REPLACEMENT, not an annotation: business rules key off the
 * staff doc's ID being the acting user's real uid, so the record moves to
 * staff/{realUid} and the placeholder is deleted. Both writes ride one batch,
 * because a half-applied claim leaves either the same person listed twice or
 * an event pointing at a doc that no longer exists.
 *
 * These tests apply the batch's operations to an in-memory mockStore on commit()
 * and then assert the resulting STATE, rather than spying on batch.delete —
 * a refactor that deletes the wrong ref would satisfy a spy and still ship
 * the duplicate-row bug this is here to prevent.
 */
jest.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "owner1" } } }));
jest.mock("../businessService", () => ({ getMyBizId: jest.fn(() => "biz1") }));
jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
}));

// Fake Firestore: docs keyed by path, batch ops applied only on commit().
let mockStore = {};
let mockCommittedBatches = 0;
let mockOpenBatchOps = null;

jest.mock("firebase/firestore", () => ({
  collection: (_db, ...segs) => ({ __path: segs.join("/") }),
  doc: (_db, ...segs) => ({ __path: segs.join("/") }),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  updateDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(async () => ({ docs: [] })),
  serverTimestamp: () => "SERVER_TS",
  getDoc: async (ref) => {
    const data = mockStore[ref.__path];
    return { exists: () => !!data, data: () => data };
  },
  setDoc: async (ref, data) => {
    mockStore[ref.__path] = { ...data };
  },
  writeBatch: () => {
    const ops = [];
    mockOpenBatchOps = ops;
    return {
      set: (ref, data, opts) => ops.push({ op: "set", path: ref.__path, data, opts }),
      delete: (ref) => ops.push({ op: "delete", path: ref.__path }),
      commit: async () => {
        mockCommittedBatches += 1;
        for (const o of ops) {
          if (o.op === "delete") delete mockStore[o.path];
          else mockStore[o.path] = o.opts?.merge ? { ...mockStore[o.path], ...o.data } : { ...o.data };
        }
      },
    };
  },
}));

const {
  addPlaceholderStaff,
  claimPlaceholderStaff,
} = require("../businessStaffService");

const PH = "businesses/biz1/staff/ph1";
const REAL = "businesses/biz1/staff/uid_real";

const seedPlaceholder = (extra = {}) => {
  mockStore[PH] = { name: "Ana", role: "instructor", claimed: false, createdAt: "SERVER_TS", ...extra };
};

beforeEach(() => {
  mockStore = {};
  mockCommittedBatches = 0;
  mockOpenBatchOps = null;
});

describe("addPlaceholderStaff", () => {
  it("writes a doc with NO uid field — that absence is what makes it unauthenticatable", async () => {
    const res = await addPlaceholderStaff("  Ana Torres  ");
    const written = mockStore[`businesses/biz1/staff/${res.id}`];
    expect(written).toBeTruthy();
    expect("uid" in written).toBe(false);
    expect(written.name).toBe("Ana Torres"); // trimmed
    expect(written.role).toBe("instructor");
    expect(written.claimed).toBe(false);
  });

  it("returns the id/name/role the picker needs to select it immediately", async () => {
    const res = await addPlaceholderStaff("Ana", "reception");
    expect(res).toEqual({ id: expect.any(String), name: "Ana", role: "reception" });
    expect(res.id).toMatch(/^st_/);
  });

  it("refuses a blank name instead of creating an unnamed row", async () => {
    expect(await addPlaceholderStaff("   ")).toBeNull();
    expect(Object.keys(mockStore)).toHaveLength(0);
  });

  it("returns null with no bizId (host without Pro) instead of throwing", async () => {
    expect(await addPlaceholderStaff("Ana", "instructor", null)).toBeNull();
  });
});

describe("claimPlaceholderStaff", () => {
  it("THE PLACEHOLDER IS GONE after a successful claim (no duplicate row)", async () => {
    seedPlaceholder();
    const res = await claimPlaceholderStaff("ph1", "uid_real");
    expect(res).toEqual({ ok: true });
    expect(mockStore[PH]).toBeUndefined(); // ← the regression this file exists for
    expect(mockStore[REAL]).toBeTruthy();
  });

  it("moves both writes in ONE batch, so a failure can't half-apply the claim", async () => {
    seedPlaceholder();
    await claimPlaceholderStaff("ph1", "uid_real");
    expect(mockCommittedBatches).toBe(1);
    expect(mockOpenBatchOps.map((o) => [o.op, o.path])).toEqual([
      ["set", REAL],
      ["delete", PH],
    ]);
  });

  it("carries the name over and stamps the real identity", async () => {
    seedPlaceholder();
    await claimPlaceholderStaff("ph1", "uid_real");
    expect(mockStore[REAL]).toMatchObject({
      name: "Ana",
      uid: "uid_real",
      claimed: true,
      claimedAt: "SERVER_TS",
    });
  });

  it("an explicit role overrides the placeholder's", async () => {
    seedPlaceholder(); // role: instructor
    await claimPlaceholderStaff("ph1", "uid_real", "reception");
    expect(mockStore[REAL].role).toBe("reception");
  });

  it("falls back to the placeholder's role when none is passed", async () => {
    seedPlaceholder({ role: "instructor" });
    await claimPlaceholderStaff("ph1", "uid_real");
    expect(mockStore[REAL].role).toBe("instructor");
  });

  it("merges instead of wiping when the person is ALREADY staff here", async () => {
    seedPlaceholder();
    mockStore[REAL] = { uid: "uid_real", role: "reception", workingHours: { start: "09:00" } };
    await claimPlaceholderStaff("ph1", "uid_real", "reception");
    // Pre-existing data survives the claim.
    expect(mockStore[REAL].workingHours).toEqual({ start: "09:00" });
    expect(mockStore[REAL].name).toBe("Ana");
  });

  it("returns not_found for a placeholder that isn't there, and writes nothing", async () => {
    const res = await claimPlaceholderStaff("missing", "uid_real");
    expect(res).toEqual({ ok: false, error: "not_found" });
    expect(mockCommittedBatches).toBe(0);
    expect(Object.keys(mockStore)).toHaveLength(0);
  });

  it("returns missing_args instead of writing a half-identified doc", async () => {
    expect(await claimPlaceholderStaff("ph1", "")).toEqual({ ok: false, error: "missing_args" });
    expect(await claimPlaceholderStaff("", "uid_real")).toEqual({ ok: false, error: "missing_args" });
    expect(mockCommittedBatches).toBe(0);
  });
});
