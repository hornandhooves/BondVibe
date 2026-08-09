/**
 * KIN-203 — the 52-occurrence cap on a single recurring series.
 *
 * WHY THIS IS THE UNIT UNDER TEST. The cap is enforced here, not in the screen:
 * generateRecurringDates is the only source of the date list and truncates to 52
 * inside every branch, so nothing downstream can ever see more. CreateEventScreen
 * now REFUSES an oversized series rather than trimming it silently — that half is
 * covered in CreateEventScreen.recurrenceCap.test.js, and it leans on the
 * maxEvents override exercised at the bottom of this file.
 *
 * The regression this prevents is expensive and silent: raise `maxEvents`, or
 * drop the `dates.length < maxEvents` condition from one generator while
 * refactoring, and a single form submit fans out into hundreds of event
 * documents.
 *
 * Every recurrence type is covered separately on purpose. The cap is not
 * implemented once — it is re-implemented in each generator (a loop condition
 * in four of them, a `.slice()` in the lunar one), so a single shared test would
 * pass while an individual generator leaked.
 */
import { generateRecurringDates } from "../recurrenceUtils";

const MAX = 52;

// A Monday, so weekday-anchored recurrences start on their target day.
const START = new Date(2026, 0, 5, 10, 0);
/**
 * Far enough out that EVERY recurrence type overshoots 52 uncapped — including
 * the sparsest one. Full moons arrive ~6.5x/year here, so a shorter horizon
 * would leave the lunar case under the cap and the assertion would pass without
 * ever exercising it.
 */
const FAR_END = new Date(2044, 0, 5, 10, 0);

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

const CONFIGS = [
  ["daily", { type: "daily", selectedDays: ALL_WEEKDAYS }],
  ["weekly", { type: "weekly", selectedDays: [1] }],
  ["biweekly", { type: "biweekly", selectedDays: [1] }],
  ["monthly · by day of month", { type: "monthly", monthlyMode: "dayOfMonth", dayOfMonth: 15, selectedDays: [1] }],
  // weekOfMonth is a STRING ("first".."fourth"/"last") — a number silently maps to
  // undefined in getNthDayOfMonth and yields ZERO dates, which would make this
  // case pass vacuously.
  ["monthly · by weekday", { type: "monthly", monthlyMode: "dayOfWeek", weekOfMonth: "first", selectedDays: [1] }],
  ["lunar", { type: "lunar", lunarPhase: "full", selectedDays: [1] }],
];

describe("generateRecurringDates — the 52-occurrence cap", () => {
  it.each(CONFIGS)("never returns more than 52 occurrences: %s", (_label, config) => {
    const dates = generateRecurringDates(START, { ...config, endDate: FAR_END });
    expect(dates.length).toBeLessThanOrEqual(MAX);
  });

  it("caps a series that would otherwise run for years", () => {
    // Eighteen years of daily occurrences is ~6570 dates uncapped.
    const dates = generateRecurringDates(START, {
      type: "daily",
      selectedDays: ALL_WEEKDAYS,
      endDate: FAR_END,
    });
    expect(dates).toHaveLength(MAX);
  });

  it("returns exactly 52 for a series that asks for exactly 52 — the cap is not off by one", () => {
    // 52 Mondays inclusive: the 52nd is 51 weeks after the first.
    const end = new Date(2026, 0, 5 + 51 * 7, 10, 0);
    const dates = generateRecurringDates(START, {
      type: "weekly",
      selectedDays: [1],
      endDate: end,
    });
    expect(dates).toHaveLength(MAX);
    expect(dates[MAX - 1].getTime()).toBe(end.getTime());
  });

  it("leaves a short series untouched — the cap is a ceiling, not a quota", () => {
    const end = new Date(2026, 0, 5 + 3 * 7, 10, 0); // 4 Mondays
    const dates = generateRecurringDates(START, {
      type: "weekly",
      selectedDays: [1],
      endDate: end,
    });
    expect(dates).toHaveLength(4);
  });

  it("keeps the start date's time of day on every capped occurrence", () => {
    // A cap that silently reset times would create 52 events at midnight.
    const dates = generateRecurringDates(START, {
      type: "daily",
      selectedDays: ALL_WEEKDAYS,
      endDate: FAR_END,
    });
    expect(dates).toHaveLength(MAX);
    for (const d of dates) {
      expect(d.getHours()).toBe(10);
      expect(d.getMinutes()).toBe(0);
    }
  });

  // The screen's block-with-alert guard (KIN-203) rests entirely on this: it
  // asks for MAX + 1 and treats a 53rd date as proof the series overshot. If the
  // override stopped being honoured, the guard would go quietly dead again —
  // exactly the failure this whole ticket is about.
  describe("maxEvents override", () => {
    it("yields a 53rd occurrence when asked for one more than the cap", () => {
      const dates = generateRecurringDates(
        START,
        { type: "weekly", selectedDays: [1], endDate: FAR_END },
        MAX + 1
      );
      expect(dates).toHaveLength(MAX + 1);
    });

    // Lunar matters most here: it is capped in TWO places (lunarUtils' own loop
    // and the slice in generateLunarDates), so the override has to reach both or
    // this case silently stays at 52 while the others honour it.
    it.each(CONFIGS)("honours the override for %s", (_label, config) => {
      const dates = generateRecurringDates(START, { ...config, endDate: FAR_END }, MAX + 1);
      expect(dates).toHaveLength(MAX + 1);
    });

    it("never invents occurrences a shorter series doesn't have", () => {
      const end = new Date(2026, 0, 5 + 3 * 7, 10, 0); // 4 Mondays
      const dates = generateRecurringDates(
        START,
        { type: "weekly", selectedDays: [1], endDate: end },
        MAX + 1
      );
      expect(dates).toHaveLength(4);
    });
  });

  it("returns a single date when there is no recurrence", () => {
    expect(generateRecurringDates(START, { type: "none" })).toHaveLength(1);
    expect(generateRecurringDates(START, null)).toHaveLength(1);
  });
});
