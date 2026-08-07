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
// events the backfill query will see, plus a switch to make it blow up.
let mockEvents = [];
let mockGetDocsThrows = false;

jest.mock("firebase/firestore", () => ({
  collection: (_db, ...segs) => ({ __path: segs.join("/") }),
  doc: (_db, ...segs) => ({ __path: segs.join("/") }),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  updateDoc: async (ref, patch) => {
    mockStore[ref.__path] = { ...mockStore[ref.__path], ...patch };
  },
  query: (colRef, ...clauses) => ({ __path: colRef.__path, __clauses: clauses }),
  where: (field, op, value) => ({ field, op, value }),
  getDocs: async (q) => {
    if (mockGetDocsThrows) throw new Error("permission-denied");
    if (q && q.__path === "businesses/biz1/staff") {
      return {
        docs: Object.entries(mockStore)
          .filter(([k]) => k.startsWith("businesses/biz1/staff/"))
          .map(([k, v]) => ({ id: k.split("/").pop(), data: () => v })),
      };
    }
    if (q && q.__path === "events") {
      const clause = q.__clauses[0];
      const hits = mockEvents.filter((e) => e[clause.field] === clause.value);
      return {
        docs: hits.map((e) => ({
          id: e.id,
          ref: { __path: `events/${e.id}` },
          data: () => e,
        })),
      };
    }
    return { docs: [] };
  },
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
  findUnclaimedPlaceholderByName,
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
  mockEvents = [];
  mockGetDocsThrows = false;
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
    expect(res).toMatchObject({ ok: true });
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

describe("claimPlaceholderStaff — backfilling past events (KIN-190 etapa 3)", () => {
  it("repoints the owner's own events from the placeholder to the real uid", async () => {
    seedPlaceholder();
    mockEvents = [
      { id: "e1", instructorUid: "ph1", creatorId: "owner1", instructorName: "Ana" },
      { id: "e2", instructorUid: "ph1", creatorId: "owner1" },
    ];
    const res = await claimPlaceholderStaff("ph1", "uid_real");
    expect(res).toEqual({ ok: true, backfilled: 2 });
    expect(mockStore["events/e1"]).toMatchObject({ instructorUid: "uid_real", instructorName: "Ana" });
    expect(mockStore["events/e2"]).toMatchObject({ instructorUid: "uid_real" });
  });

  it("leaves events created by SOMEONE ELSE alone — the rules would deny that write", async () => {
    seedPlaceholder();
    mockEvents = [
      { id: "mine", instructorUid: "ph1", creatorId: "owner1" },
      { id: "theirs", instructorUid: "ph1", creatorId: "someone_else" },
    ];
    const res = await claimPlaceholderStaff("ph1", "uid_real");
    expect(res.backfilled).toBe(1);
    expect(mockStore["events/mine"]).toMatchObject({ instructorUid: "uid_real" });
    expect(mockStore["events/theirs"]).toBeUndefined(); // never written
  });

  it("does not touch events pointing at a DIFFERENT placeholder", async () => {
    seedPlaceholder();
    mockEvents = [{ id: "other", instructorUid: "ph_other", creatorId: "owner1" }];
    const res = await claimPlaceholderStaff("ph1", "uid_real");
    expect(res.backfilled).toBe(0);
    expect(mockStore["events/other"]).toBeUndefined();
  });

  it("KEEPS THE PLACEHOLDER when the backfill fails — never strand an event on a deleted doc", async () => {
    seedPlaceholder();
    mockGetDocsThrows = true;
    await expect(claimPlaceholderStaff("ph1", "uid_real")).rejects.toThrow();
    // Order is the safety argument: nothing was committed, so a retry is clean.
    expect(mockStore[PH]).toBeTruthy();
    expect(mockStore[REAL]).toBeUndefined();
    expect(mockCommittedBatches).toBe(0);
  });
});

describe("findUnclaimedPlaceholderByName (KIN-190 etapa 4)", () => {
  it("matches ignoring case and accents", async () => {
    mockStore["businesses/biz1/staff/ph1"] = { name: "Ana Torres", role: "instructor", claimed: false };
    expect(await findUnclaimedPlaceholderByName("  ana torres ")).toMatchObject({ id: "ph1" });
    expect(await findUnclaimedPlaceholderByName("ANA TÓRRES")).toMatchObject({ id: "ph1" });
  });

  it("matches when one name contains the other (asks the owner, never merges alone)", async () => {
    mockStore["businesses/biz1/staff/ph1"] = { name: "Ana", role: "instructor", claimed: false };
    expect(await findUnclaimedPlaceholderByName("Ana Torres")).toMatchObject({ id: "ph1" });
  });

  it("NEVER returns a real staff member — a doc with a uid is not a placeholder", async () => {
    mockStore["businesses/biz1/staff/uid_real"] = { name: "Ana Torres", uid: "uid_real", role: "instructor" };
    expect(await findUnclaimedPlaceholderByName("Ana Torres")).toBeNull();
  });

  it("skips an already-claimed placeholder", async () => {
    mockStore["businesses/biz1/staff/ph1"] = { name: "Ana", role: "instructor", claimed: true };
    expect(await findUnclaimedPlaceholderByName("Ana")).toBeNull();
  });

  it("returns null for an unrelated name, and for a blank one", async () => {
    mockStore["businesses/biz1/staff/ph1"] = { name: "Ana", role: "instructor", claimed: false };
    expect(await findUnclaimedPlaceholderByName("Beto")).toBeNull();
    expect(await findUnclaimedPlaceholderByName("   ")).toBeNull();
  });
});
