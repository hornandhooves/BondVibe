import { formatDuration, durationToDate, dateToMinutes } from "../duration";

// i18n is initialized (English) by jest/setup.js, so formatDuration returns
// the real localized strings.
describe("formatDuration", () => {
  it("shows minutes under an hour", () => {
    expect(formatDuration(5)).toBe("5 min");
    expect(formatDuration(45)).toBe("45 min");
  });

  it("shows hours + minutes", () => {
    expect(formatDuration(65)).toBe("1h 5m"); // BUG 4: not '1h 5m' from a bad 60
    expect(formatDuration(150)).toBe("2h 30m");
  });

  it("shows whole hours (singular vs plural)", () => {
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(120)).toBe("2 hours");
  });

  it("shows days", () => {
    expect(formatDuration(1440)).toBe("1 day");
    expect(formatDuration(2880)).toBe("2 days");
  });
});

describe("durationToDate / dateToMinutes round-trip", () => {
  // The crux of BUG 4: 0 hours / 5 minutes must decode to 5, never 60.
  it("keeps 0 hours as 0 (5 min stays 5)", () => {
    expect(dateToMinutes(durationToDate(5))).toBe(5);
    expect(dateToMinutes(new Date(2000, 0, 1, 0, 5, 0, 0))).toBe(5);
  });

  it("does not inherit an hour from the base date", () => {
    expect(dateToMinutes(durationToDate(0))).toBe(0);
    expect(dateToMinutes(new Date(2000, 0, 1, 0, 0, 0, 0))).toBe(0);
  });

  it("round-trips typical durations", () => {
    for (const m of [5, 30, 65, 120, 180, 185, 720]) {
      expect(dateToMinutes(durationToDate(m))).toBe(m);
    }
  });

  it("is defensive against non-Date input", () => {
    expect(dateToMinutes(null)).toBe(0);
    expect(dateToMinutes(undefined)).toBe(0);
  });
});
