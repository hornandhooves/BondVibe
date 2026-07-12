// Pure fiscal / distribution / projection / pace math for Revenue Targets.
// Stub ./firebase so importing the service doesn't init the SDK under jest.
jest.mock("../firebase", () => ({ db: {}, auth: {} }));

import {
  fyStartDate,
  fyPosition,
  periodFiscalMonths,
  computeMonthlyTargets,
  bucketPaymentsByFiscalMonth,
  runRate,
  computeTracker,
} from "../businessGoalsService";

const cents = (pesos) => pesos * 100;

describe("fiscal helpers", () => {
  it("fyPosition: FY starting Jan, mid-July → month 7 of 12", () => {
    expect(fyPosition(0, new Date(2026, 6, 15))).toBe(7);
  });
  it("fyPosition: FY starting Sept, mid-July → month 11 (prev-year start)", () => {
    expect(fyPosition(8, new Date(2026, 6, 15))).toBe(11);
    expect(fyStartDate(8, new Date(2026, 6, 15)).getFullYear()).toBe(2025);
  });
  it("fyPosition: at the start month → month 1", () => {
    expect(fyPosition(0, new Date(2026, 0, 3))).toBe(1);
  });
  it("periodFiscalMonths: quarter/semester/year windows around the current month", () => {
    expect(periodFiscalMonths("month", 7)).toEqual([6]);
    expect(periodFiscalMonths("quarter", 7)).toEqual([6, 7, 8]); // cur=6 → Q3 (idx 2)
    expect(periodFiscalMonths("semester", 7)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(periodFiscalMonths("year", 7)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("computeMonthlyTargets", () => {
  it("remaining-even: $480k, month 7 → elapsed 0, remaining $40k/mo (README example)", () => {
    const out = computeMonthlyTargets({ annualCents: cents(480000), mode: "even", midYearMode: "remaining", position: 7 });
    expect(out.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]); // elapsed → not targeted
    expect(out.slice(6)).toEqual(new Array(6).fill(cents(40000))); // annual/12
    expect(out.reduce((a, b) => a + b, 0)).toBe(cents(240000)); // remaining slice, NOT full annual
  });

  it("backfill-even: remaining chases annual − booked; elapsed carry their actual", () => {
    const actual = new Array(12).fill(0);
    for (let i = 0; i < 6; i++) actual[i] = cents(10000); // booked $60k
    const out = computeMonthlyTargets({ annualCents: cents(480000), mode: "even", midYearMode: "backfill", position: 7, actualElapsedByFMonth: actual });
    expect(out.slice(0, 6)).toEqual(new Array(6).fill(cents(10000)));
    // remaining = (480 − 60) / 6 = 70k
    expect(out.slice(6)).toEqual(new Array(6).fill(cents(70000)));
    expect(out.reduce((a, b) => a + b, 0)).toBe(cents(480000)); // full annual
  });

  it("manual: uses per-month inputs for the remaining fiscal months only", () => {
    const manual = new Array(12).fill(0);
    manual[6] = cents(15000);
    manual[7] = cents(25000);
    const out = computeMonthlyTargets({ annualCents: cents(480000), mode: "manual", midYearMode: "remaining", position: 7, perMonthManual: manual });
    expect(out[5]).toBe(0);
    expect(out[6]).toBe(cents(15000));
    expect(out[7]).toBe(cents(25000));
  });
});

describe("bucketPaymentsByFiscalMonth + runRate", () => {
  const now = new Date(2026, 6, 15); // FY Jan → position 7
  it("buckets payments into fiscal months and ignores out-of-year", () => {
    const pays = [
      { date: new Date(2026, 0, 10).toISOString(), amountCents: cents(1000) }, // fmonth 0
      { date: new Date(2026, 5, 20).toISOString(), amountCents: cents(2000) }, // fmonth 5
      { date: new Date(2025, 11, 1).toISOString(), amountCents: cents(9999) }, // before FY → ignored
    ];
    const b = bucketPaymentsByFiscalMonth(pays, 0, now);
    expect(b[0]).toBe(cents(1000));
    expect(b[5]).toBe(cents(2000));
    expect(b.reduce((a, c) => a + c, 0)).toBe(cents(3000));
  });
  it("runRate: average of the last 3 completed months; null before any complete", () => {
    const actual = new Array(12).fill(0);
    actual[3] = cents(3000);
    actual[4] = cents(6000);
    actual[5] = cents(9000);
    expect(runRate(actual, 7)).toBe(cents(6000)); // (3+6+9)/3
    expect(runRate(actual, 1)).toBeNull(); // month 1 → nothing completed
  });
});

describe("computeTracker pace + guards", () => {
  const now = new Date(2026, 6, 15); // FY Jan, position 7
  const goal = { fyStartMonth: 0, annualCents: cents(480000), perMonthCents: new Array(12).fill(cents(40000)) };

  it("attainment = actual ÷ target; behind when under expected", () => {
    // month period = fmonth 6 (target 40k). Half a month in with 10k actual.
    const pays = [{ date: new Date(2026, 6, 5).toISOString(), amountCents: cents(10000) }];
    const tr = computeTracker(goal, pays, "month", now);
    expect(tr.targetCents).toBe(cents(40000));
    expect(tr.actualCents).toBe(cents(10000));
    expect(tr.attainment).toBe(25); // 10/40
  });

  it("divide-by-zero → null attainment (no target)", () => {
    const zeroGoal = { fyStartMonth: 0, annualCents: 0, perMonthCents: new Array(12).fill(0) };
    const tr = computeTracker(zeroGoal, [], "month", now);
    expect(tr.attainment).toBeNull();
    expect(tr.onPace).toBeNull();
  });

  it("chart has 12 points, actual stops at today, projection continues", () => {
    const tr = computeTracker(goal, [{ date: new Date(2026, 0, 5).toISOString(), amountCents: cents(5000) }], "year", now);
    expect(tr.chart).toHaveLength(12);
    expect(tr.chart[11].actual).toBeNull(); // beyond today (month 7)
    expect(tr.chart[6].isToday).toBe(true);
  });
});
