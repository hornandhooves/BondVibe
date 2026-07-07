/**
 * businessRanges — date-range control for the Business Dashboard
 * (kinlo_business/02 §A). Rolling windows so period-over-period comparison is
 * trivial (previous = shift back by the same length). Labels via i18n.
 */
export const RANGE_IDS = [
  "day",
  "week",
  "month",
  "quarter",
  "semester",
  "year",
  "total",
  "custom",
];

export const DEFAULT_RANGE = "month";

const DAY = 86400000;
const LENGTHS = {
  day: DAY,
  week: 7 * DAY,
  month: 30 * DAY,
  quarter: 90 * DAY,
  semester: 180 * DAY,
  year: 365 * DAY,
};

export const rangeLabelKey = (id) => `business.dashboard.range.${id}`;

/**
 * Resolve a range to concrete bounds. `to` is now; `from` is now minus the
 * window. "total" starts at the epoch; "custom" uses the supplied dates.
 * @returns {{from:Date, to:Date}}
 */
export function rangeBounds(id, custom = {}) {
  const to = custom.to ? new Date(custom.to) : new Date();
  if (id === "custom") {
    return { from: custom.from ? new Date(custom.from) : new Date(to.getTime() - 30 * DAY), to };
  }
  if (id === "total") return { from: new Date(0), to };
  const len = LENGTHS[id] || LENGTHS.month;
  return { from: new Date(to.getTime() - len), to };
}

/** The equivalent window immediately before [from,to] (for comparison). */
export function previousBounds({ from, to }) {
  const len = to.getTime() - from.getTime();
  if (!isFinite(len) || len <= 0) return null;
  return { from: new Date(from.getTime() - len), to: new Date(from.getTime()) };
}

/**
 * Split [from,to] into up to `maxBars` equal buckets for the chart.
 * @returns {Array<{start:number, end:number, label:string}>}
 */
export function chartBuckets({ from, to }, maxBars = 8) {
  let start = from.getTime();
  const end = to.getTime();
  // Total range starts at epoch — clamp to ~1y of buckets so labels are useful.
  if (end - start > 400 * DAY) start = end - 365 * DAY;
  const span = Math.max(end - start, DAY);
  const n = Math.min(maxBars, Math.max(1, Math.round(span / DAY) >= maxBars ? maxBars : Math.ceil(span / DAY)));
  const step = span / n;
  const shortDate = (ms) => {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const buckets = [];
  for (let i = 0; i < n; i++) {
    const s = start + i * step;
    buckets.push({ start: s, end: s + step, label: shortDate(s) });
  }
  return buckets;
}
