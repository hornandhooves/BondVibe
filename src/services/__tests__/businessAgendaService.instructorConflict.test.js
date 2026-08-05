/**
 * KIN-154 — checkInstructorAvailability must detect a double-booking for an
 * instructor with NO business (personal host), not just for business staff.
 *
 * Root cause: getDayItems (and everything it fetches — listHostEvents,
 * listClasses, listBookings, listAgendaBlocks) requires a bizId and returns
 * nothing without one. checkInstructorAvailability also short-circuited on
 * `!bizId` before ever querying anything. A personal host has no bizId, so
 * the check silently found zero conflicts no matter how badly double-booked
 * they were.
 *
 * The fix adds a business-agnostic query (getInstructorEventsOnDate) over
 * the top-level `events` collection by instructorUid, unioned with the
 * existing business-scoped items when a bizId does exist.
 */
jest.mock("../firebase", () => ({ db: {} }));
jest.mock("../businessService", () => ({ getMyBizId: jest.fn() }));
jest.mock("../businessClassesService", () => ({
  listClasses: jest.fn(() => Promise.resolve([])),
  classesOnWeekday: () => [],
}));
jest.mock("../businessSessionsService", () => ({
  listBookings: jest.fn(() => Promise.resolve([])),
  BOOKING_STATUS: { CONFIRMED: "confirmed" },
}));
jest.mock("../businessStaffService", () => ({
  listStaff: jest.fn(() => Promise.resolve([])),
  // Wide-open hours so outOfHours never fires — isolates the conflict check.
  getWorkingHours: () => ({ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" }),
}));

// events keyed by instructorUid, as the fake Firestore layer would return them.
let mockEventsByInstructor = {};
jest.mock("firebase/firestore", () => ({
  collection: (_db, ...segs) => ({ __path: segs.join("/") }),
  doc: (_db, ...segs) => ({ __path: segs.join("/") }),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: () => "SERVER_TS",
  where: (field, op, value) => ({ field, op, value }),
  query: (colRef, ...clauses) => ({ __path: colRef.__path, __clauses: clauses }),
  getDocs: async (q) => {
    if (q.__path === "events") {
      const clause = q.__clauses[0];
      if (clause.field === "instructorUid") {
        const docs = mockEventsByInstructor[clause.value] || [];
        return { docs: docs.map((d) => ({ id: d.id, data: () => d })) };
      }
      // listHostEvents (creatorId-scoped) — not exercised by these tests.
      return { docs: [] };
    }
    // agendaBlocks (or anything else business-scoped) — none seeded here.
    return { docs: [] };
  },
}));

const { getMyBizId } = require("../businessService");
const { checkInstructorAvailability } = require("../businessAgendaService");

const iso = (h, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + 1); // tomorrow, so it's never accidentally in the past
  d.setHours(h, m, 0, 0);
  return d;
};

beforeEach(() => {
  mockEventsByInstructor = {};
  getMyBizId.mockReturnValue(null); // personal host by default
});

describe("checkInstructorAvailability — personal host (no bizId)", () => {
  it("KIN-154: detects a real double-booking with no business at all", async () => {
    mockEventsByInstructor.personalHost = [
      {
        id: "evt1",
        title: "My own event",
        instructorUid: "personalHost",
        date: iso(18, 0).toISOString(), // 6:00–9:00pm (default 180min)
        durationMinutes: 180,
      },
    ];
    const result = await checkInstructorAvailability({
      instructorUid: "personalHost",
      instructorName: "Me",
      start: iso(18, 30), // overlaps 6:00-9:00pm
      durationMin: 60,
    });
    expect(result.conflict).toBe(true);
    expect(result.conflictItem.title).toBe("My own event");
  });

  it("does not conflict when the times don't overlap", async () => {
    mockEventsByInstructor.personalHost = [
      {
        id: "evt1",
        title: "Morning thing",
        instructorUid: "personalHost",
        date: iso(9, 0).toISOString(),
        durationMinutes: 60,
      },
    ];
    const result = await checkInstructorAvailability({
      instructorUid: "personalHost",
      instructorName: "Me",
      start: iso(18, 0),
      durationMin: 60,
    });
    expect(result.conflict).toBe(false);
  });

  it("a DIFFERENT instructor's overlapping event is not a conflict (per spec: different instructors may overlap)", async () => {
    mockEventsByInstructor.someoneElse = [
      {
        id: "evt1",
        title: "Someone else's event",
        instructorUid: "someoneElse",
        date: iso(18, 0).toISOString(),
        durationMinutes: 180,
      },
    ];
    const result = await checkInstructorAvailability({
      instructorUid: "personalHost",
      instructorName: "Me",
      start: iso(18, 30),
      durationMin: 60,
    });
    expect(result.conflict).toBe(false);
  });

  it("returns cleanly (no conflict, no throw) with zero events for that instructor", async () => {
    const result = await checkInstructorAvailability({
      instructorUid: "personalHost",
      instructorName: "Me",
      start: iso(18, 0),
      durationMin: 60,
    });
    expect(result.conflict).toBe(false);
    expect(result.conflictItem).toBeNull();
  });
});

describe("checkInstructorAvailability — business host (bizId present)", () => {
  it("still detects a conflict via the business-agnostic query (union, no crash)", async () => {
    getMyBizId.mockReturnValue("biz1");
    mockEventsByInstructor.staffUid = [
      {
        id: "evt1",
        title: "Staff's class-adjacent event",
        instructorUid: "staffUid",
        date: iso(18, 0).toISOString(),
        durationMinutes: 180,
      },
    ];
    const result = await checkInstructorAvailability({
      instructorUid: "staffUid",
      instructorName: "Staffer",
      start: iso(18, 30),
      durationMin: 60,
    });
    expect(result.conflict).toBe(true);
  });
});
