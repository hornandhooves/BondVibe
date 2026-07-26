/**
 * KIN-117 — moderationService. Locks: the query stays single-field
 * (status/type filtered IN CODE, not pushed into Firestore — the whole
 * point of avoiding a composite index), the scan continues across pages
 * when a page has no matches, counts read getCountFromServer, and the two
 * state-changing actions go through the moderateReport callable only.
 */
const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();
const mockGetCountFromServer = jest.fn();
const mockFn = jest.fn(() => Promise.resolve({ data: { ok: true } }));
const mockHttpsCallable = jest.fn(() => mockFn);

jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: (...a) => mockHttpsCallable(...a),
}));
jest.mock("firebase/firestore", () => ({
  collection: jest.fn((_db, name) => ({ __collection: name })),
  query: jest.fn((...constraints) => ({ __constraints: constraints })),
  orderBy: jest.fn((field, dir) => ({ __orderBy: [field, dir] })),
  limit: jest.fn((n) => ({ __limit: n })),
  startAfter: jest.fn((cursorDoc) => ({ __startAfter: cursorDoc })),
  where: jest.fn((field, op, val) => ({ __where: [field, op, val] })),
  getDocs: (...a) => mockGetDocs(...a),
  doc: jest.fn((_db, coll, id) => ({ __doc: [coll, id] })),
  getDoc: (...a) => mockGetDoc(...a),
  getCountFromServer: (...a) => mockGetCountFromServer(...a),
}));

import {
  listReports, countReportsByStatus, getReport, getUserName, takeReportCase, resolveReportCase,
} from "../moderationService";

const fakeDoc = (id, data) => ({ id, data: () => data });

beforeEach(() => {
  mockGetDocs.mockReset();
  mockGetDoc.mockReset();
  mockGetCountFromServer.mockReset();
  mockHttpsCallable.mockClear();
  mockFn.mockClear();
});

describe("moderationService.listReports", () => {
  it("filters status/type IN MEMORY over a single page, never pushed into the query", async () => {
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      size: 3,
      docs: [
        fakeDoc("r1", { status: "open", type: "user", createdAt: 3 }),
        fakeDoc("r2", { status: "resolved", type: "user", createdAt: 2 }),
        fakeDoc("r3", { status: "open", type: "event", createdAt: 1 }),
      ],
    });
    const { reports, hasMore } = await listReports({ status: "open" });
    expect(reports.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(hasMore).toBe(false); // short batch signals the collection ended
  });

  it("keeps scanning forward across pages when a page has zero matches", async () => {
    mockGetDocs
      .mockResolvedValueOnce({
        empty: false,
        size: 50,
        docs: Array.from({ length: 50 }, (_, i) => fakeDoc(`a${i}`, { status: "resolved", type: "user" })),
      })
      .mockResolvedValueOnce({
        empty: false,
        size: 2,
        docs: [
          fakeDoc("b1", { status: "open", type: "user" }),
          fakeDoc("b2", { status: "resolved", type: "user" }),
        ],
      });
    const { reports } = await listReports({ status: "open" });
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    expect(reports.map((r) => r.id)).toEqual(["b1"]);
  });

  it("an empty collection returns no reports, no crash", async () => {
    mockGetDocs.mockResolvedValueOnce({ empty: true, size: 0, docs: [] });
    const { reports, hasMore } = await listReports({});
    expect(reports).toEqual([]);
    expect(hasMore).toBe(false);
  });
});

describe("moderationService — counts, target names, actions", () => {
  it("countReportsByStatus reads getCountFromServer().data().count", async () => {
    mockGetCountFromServer.mockResolvedValueOnce({ data: () => ({ count: 7 }) });
    const n = await countReportsByStatus("open");
    expect(n).toBe(7);
  });

  it("getReport returns null when missing (never throws)", async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    const r = await getReport("missing");
    expect(r).toBeNull();
  });

  it("getUserName is honest-null for a missing user doc — never invents a name", async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    const name = await getUserName("uid1");
    expect(name).toBeNull();
  });

  it("takeReportCase calls moderateReport with action:take", async () => {
    await takeReportCase("r1");
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), "moderateReport");
    expect(mockFn).toHaveBeenCalledWith({ reportId: "r1", action: "take" });
  });

  it("resolveReportCase calls moderateReport with action:resolve + resolution + notes", async () => {
    await resolveReportCase("r1", "action_taken", "handled");
    expect(mockFn).toHaveBeenCalledWith({
      reportId: "r1", action: "resolve", resolution: "action_taken", adminNotes: "handled",
    });
  });
});
