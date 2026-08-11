/**
 * KIN-158 — "has this event finished?" used to mean "is its calendar day over?".
 *
 * That gap is the whole bug: an event that ended at 11am stayed listed as
 * attendable until midnight, for up to thirteen more hours. A QA payment went
 * through on exactly that — an event twelve hours dead was still reachable from
 * search. So the boundary cases here are the point, not padding.
 *
 * The formula (start + durationMinutes, default 180) mirrors
 * functions/stripe/escrow.js. If the two ever disagree, the app and the payout
 * schedule disagree about when an event ended.
 */
import {
  isEventPast,
  isEventUpcoming,
  isEventDiscoverable,
  filterDiscoverableEvents,
  filterUpcomingEvents,
  filterPastEvents,
  DEFAULT_DURATION_MIN,
} from "../eventFilters";

const MIN = 60000;
const at = (offsetMin) => new Date(Date.now() + offsetMin * MIN).toISOString();
/** @param {number} startMin minutes from now @param {object} extra event fields */
const ev = (startMin, extra = {}) => ({ date: at(startMin), ...extra });

describe("isEventPast — start + duration, not the calendar day", () => {
  it("an event that ended an hour ago is past, even though it is still today", () => {
    // The exact shape of the bug: started 3h ago, 60min long, so it ended 2h
    // ago — but the old day-comparison called it upcoming until midnight.
    expect(isEventPast(ev(-180, { durationMinutes: 60 }))).toBe(true);
  });

  it("an event still IN PROGRESS is not past", () => {
    expect(isEventPast(ev(-30, { durationMinutes: 60 }))).toBe(false);
  });

  it("a future event is not past", () => {
    expect(isEventPast(ev(120, { durationMinutes: 60 }))).toBe(false);
  });

  it("uses the 180-minute default when durationMinutes is missing", () => {
    expect(DEFAULT_DURATION_MIN).toBe(180);
    // Started 179 min ago: with the default it has one minute left.
    expect(isEventPast(ev(-179))).toBe(false);
    // Started 181 min ago: over.
    expect(isEventPast(ev(-181))).toBe(true);
  });

  it("respects an explicit duration over the default", () => {
    // Four hours ago. Default (180) would call it over; a 300-minute event isn't.
    expect(isEventPast(ev(-240, { durationMinutes: 300 }))).toBe(false);
    expect(isEventPast(ev(-240))).toBe(true);
  });

  it("treats a zero/invalid duration as the default, not as instant expiry", () => {
    // `Number(0) || 180` → 180. An event with duration 0 must not be born past.
    expect(isEventPast(ev(-5, { durationMinutes: 0 }))).toBe(false);
    expect(isEventPast(ev(-5, { durationMinutes: "abc" }))).toBe(false);
  });

  it("still accepts a bare date string, falling back to the default", () => {
    // Backwards compatibility for callers that only have the date.
    expect(isEventPast(at(-181))).toBe(true);
    expect(isEventPast(at(-179))).toBe(false);
  });

  it("does not hide an event whose date can't be parsed", () => {
    // Failing open keeps a data problem visible instead of silently vanishing.
    expect(isEventPast({ date: "not-a-date" })).toBe(false);
    expect(isEventPast(undefined)).toBe(false);
    expect(isEventPast({})).toBe(false);
  });

  it("a CANCELLED future event is not 'past'", () => {
    // Deliberate: MyEventsScreen buckets by this, and a cancelled event next
    // week has not happened yet. Hiding it is isEventDiscoverable's job.
    expect(isEventPast(ev(120, { status: "cancelled" }))).toBe(false);
  });

  it("isEventUpcoming is its exact inverse", () => {
    const finished = ev(-180, { durationMinutes: 60 });
    const soon = ev(60);
    expect(isEventUpcoming(finished)).toBe(!isEventPast(finished));
    expect(isEventUpcoming(soon)).toBe(!isEventPast(soon));
  });
});

describe("isEventDiscoverable — finished OR cancelled disappears", () => {
  it("shows an upcoming active event", () => {
    expect(isEventDiscoverable(ev(120, { status: "active" }))).toBe(true);
  });

  it("shows an event in progress", () => {
    expect(isEventDiscoverable(ev(-30, { durationMinutes: 60 }))).toBe(true);
  });

  it("hides a finished event", () => {
    expect(isEventDiscoverable(ev(-180, { durationMinutes: 60 }))).toBe(false);
  });

  it("hides a cancelled event even though it hasn't happened yet", () => {
    expect(isEventDiscoverable(ev(120, { status: "cancelled" }))).toBe(false);
  });

  it("hides nothing on a missing event rather than throwing", () => {
    expect(isEventDiscoverable(null)).toBe(false);
    expect(isEventDiscoverable(undefined)).toBe(false);
  });
});

describe("list filters", () => {
  const finished = { id: "over", ...ev(-180, { durationMinutes: 60 }) };
  const running = { id: "now", ...ev(-30, { durationMinutes: 60 }) };
  const future = { id: "soon", ...ev(120) };
  const cancelled = { id: "off", ...ev(120, { status: "cancelled" }) };

  it("filterDiscoverableEvents drops finished and cancelled, keeps the rest", () => {
    const out = filterDiscoverableEvents([finished, running, future, cancelled]);
    expect(out.map((e) => e.id)).toEqual(["now", "soon"]);
  });

  it("filterDiscoverableEvents tolerates a non-array", () => {
    expect(filterDiscoverableEvents(undefined)).toEqual([]);
  });

  it("upcoming/past split by the SAME boundary, with no overlap or gap", () => {
    const all = [finished, running, future, cancelled];
    const up = filterUpcomingEvents(all).map((e) => e.id);
    const past = filterPastEvents(all).map((e) => e.id);
    expect(past).toEqual(["over"]);
    // A cancelled future event stays in Upcoming — it hasn't happened.
    expect(up).toEqual(["now", "soon", "off"]);
    expect(up.length + past.length).toBe(all.length);
  });

  it("filters honour per-event duration, not one global assumption", () => {
    // Same start, different lengths: one is over, the other isn't.
    const short = { id: "short", ...ev(-120, { durationMinutes: 60 }) };
    const long = { id: "long", ...ev(-120, { durationMinutes: 240 }) };
    expect(filterPastEvents([short, long]).map((e) => e.id)).toEqual(["short"]);
  });
});
