/**
 * KIN-214 — changing the pattern of a series that already exists.
 *
 * This is the destructive half of the feature: it decides which occurrence
 * documents get deleted. Two invariants matter more than the happy path, and
 * both are asserted by reversion below — an occurrence with bookings is NEVER
 * modified, and nothing at or before the occurrence being edited is touched.
 *
 * The business rule (KIN-214, 12-ago-2026, regla 39): split forward from the
 * occurrence being edited; replace unbooked future occurrences with the new
 * pattern; leave booked ones exactly as they are, without cancelling or
 * refunding; report those back so the host coordinates them by hand in the
 * event chat. No automatic rescheduling for attendees — out of scope on
 * purpose.
 */
import {
  planRecurrenceUpdate,
  occurrenceIsBooked,
  MAX_RECURRING_EVENTS,
} from "../recurrenceUtils";

const DAY = 864e5;
/** A Monday, so weekly patterns line up predictably. */
const BASE = new Date(2026, 0, 5, 10, 0).getTime();
const at = (offsetDays) => new Date(BASE + offsetDays * DAY).toISOString();

const occ = (id, offsetDays, extra = {}) => ({ id, date: at(offsetDays), ...extra });

/** Weekly on Mondays for a year — the "new pattern" in most tests. */
const weekly = {
  type: "weekly",
  selectedDays: [1],
  endDate: new Date(BASE + 365 * DAY).toISOString(),
};

describe("occurrenceIsBooked — the same reading the app uses", () => {
  it("counts participantCount", () => {
    expect(occurrenceIsBooked({ participantCount: 1 })).toBe(true);
    expect(occurrenceIsBooked({ participantCount: 0 })).toBe(false);
  });

  it("falls back to the legacy arrays for old docs", () => {
    expect(occurrenceIsBooked({ attendees: ["a"] })).toBe(true);
    expect(occurrenceIsBooked({ participants: ["a"] })).toBe(true);
  });

  it("treats an empty or missing doc as unbooked", () => {
    expect(occurrenceIsBooked({})).toBe(false);
    expect(occurrenceIsBooked(null)).toBe(false);
  });

  it("prefers participantCount over a stale attendees array", () => {
    // ROSTER (#55) made participantCount the source of truth; a leftover array
    // must not resurrect a booking that no longer exists.
    expect(occurrenceIsBooked({ participantCount: 0, attendees: ["ghost"] })).toBe(false);
  });
});

describe("the past and the occurrence being edited are never touched", () => {
  const current = occ("cur", 0);
  const occurrences = [occ("past2", -14), occ("past1", -7), current, occ("next", 7)];

  it("keeps every past occurrence, unbooked or not", () => {
    const { keep, remove } = planRecurrenceUpdate({ current, occurrences, config: weekly });
    expect(keep.map((o) => o.id)).toEqual(expect.arrayContaining(["past2", "past1"]));
    expect(remove.map((o) => o.id)).not.toEqual(expect.arrayContaining(["past2", "past1"]));
  });

  it("keeps the occurrence being edited", () => {
    const { keep, remove } = planRecurrenceUpdate({ current, occurrences, config: weekly });
    expect(keep.map((o) => o.id)).toContain("cur");
    expect(remove.map((o) => o.id)).not.toContain("cur");
  });

  it("never generates a date at or before the anchor", () => {
    const { create } = planRecurrenceUpdate({ current, occurrences, config: weekly });
    expect(create.every((d) => d.getTime() > new Date(current.date).getTime())).toBe(true);
  });
});

describe("a booked future occurrence is untouchable", () => {
  const current = occ("cur", 0);
  const booked = occ("booked", 14, { participantCount: 3 });
  const free = occ("free", 7);
  const occurrences = [current, free, booked];

  it("keeps it and never schedules it for removal", () => {
    const { keep, remove } = planRecurrenceUpdate({ current, occurrences, config: weekly });
    expect(keep.map((o) => o.id)).toContain("booked");
    expect(remove.map((o) => o.id)).toEqual(["free"]);
  });

  it("reports it back so the host can coordinate it by hand", () => {
    const { blocked } = planRecurrenceUpdate({ current, occurrences, config: weekly });
    expect(blocked.map((o) => o.id)).toEqual(["booked"]);
  });

  it("returns it byte-for-byte unchanged — no new date, no cancellation", () => {
    // The plan must not carry a modified copy: the whole promise is that a
    // booked date does not move.
    const { keep } = planRecurrenceUpdate({ current, occurrences, config: weekly });
    expect(keep.find((o) => o.id === "booked")).toBe(booked);
    expect(booked.date).toBe(at(14));
    expect(booked.status).toBeUndefined();
  });

  it("does not regenerate a new date on top of the slot it holds", () => {
    // Its date stays occupied; producing the same instant again would double
    // up on a day that already has people in it.
    const { create } = planRecurrenceUpdate({ current, occurrences, config: weekly });
    const bookedAt = new Date(booked.date).getTime();
    expect(create.some((d) => d.getTime() === bookedAt)).toBe(false);
  });

  it("leaves the WHOLE series alone when every future occurrence is booked", () => {
    const allBooked = [current, occ("b1", 7, { participantCount: 1 }), occ("b2", 14, { participantCount: 2 })];
    const { remove, blocked } = planRecurrenceUpdate({ current, occurrences: allBooked, config: weekly });
    expect(remove).toEqual([]);
    expect(blocked.map((o) => o.id)).toEqual(["b1", "b2"]);
  });
});

describe("replacement with the new pattern", () => {
  const current = occ("cur", 0);

  it("removes every unbooked future occurrence", () => {
    const occurrences = [current, occ("f1", 7), occ("f2", 14), occ("f3", 21)];
    const { remove } = planRecurrenceUpdate({ current, occurrences, config: weekly });
    expect(remove.map((o) => o.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("generates dates from the new pattern, not the old one", () => {
    // Old series was weekly; the new pattern is every two weeks.
    const biweekly = { type: "biweekly", selectedDays: [1], endDate: new Date(BASE + 60 * DAY).toISOString() };
    const occurrences = [current, occ("f1", 7), occ("f2", 14)];
    const { create } = planRecurrenceUpdate({ current, occurrences, config: biweekly });
    const gaps = create.slice(1).map((d, i) => (d - create[i]) / DAY);
    expect(gaps.every((g) => g === 14)).toBe(true);
  });

  it("caps the FINAL series at 52, counting what was kept", () => {
    // 10 kept (past + current), so at most 42 new ones.
    const past = Array.from({ length: 9 }, (_, i) => occ(`p${i}`, -(i + 1) * 7));
    const occurrences = [...past, current];
    const { keep, create } = planRecurrenceUpdate({ current, occurrences, config: weekly });
    expect(keep).toHaveLength(10);
    expect(keep.length + create.length).toBeLessThanOrEqual(MAX_RECURRING_EVENTS);
    expect(create).toHaveLength(MAX_RECURRING_EVENTS - 10);
  });

  it("blocked occurrences consume cap budget, because they still exist", () => {
    const booked = Array.from({ length: 5 }, (_, i) => occ(`b${i}`, (i + 1) * 7, { participantCount: 1 }));
    const { keep, create } = planRecurrenceUpdate({ current, occurrences: [current, ...booked], config: weekly });
    expect(keep).toHaveLength(6); // current + 5 booked
    expect(keep.length + create.length).toBeLessThanOrEqual(MAX_RECURRING_EVENTS);
  });
});

describe("degenerate input changes nothing", () => {
  it("an unparseable anchor date leaves the series untouched", () => {
    const current = { id: "cur", date: "not-a-date" };
    const occurrences = [current, occ("f1", 7)];
    const plan = planRecurrenceUpdate({ current, occurrences, config: weekly });
    expect(plan.remove).toEqual([]);
    expect(plan.create).toEqual([]);
    expect(plan.keep).toHaveLength(2);
  });

  it("an occurrence with an unparseable date is kept, never deleted", () => {
    const current = occ("cur", 0);
    const broken = { id: "broken", date: "???" };
    const { keep, remove } = planRecurrenceUpdate({ current, occurrences: [current, broken], config: weekly });
    expect(keep.map((o) => o.id)).toContain("broken");
    expect(remove).toEqual([]);
  });

  it("an empty series produces no deletions", () => {
    const current = occ("cur", 0);
    const { remove, blocked } = planRecurrenceUpdate({ current, occurrences: [], config: weekly });
    expect(remove).toEqual([]);
    expect(blocked).toEqual([]);
  });
});
