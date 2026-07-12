/**
 * businessGoalsService — Revenue Targets (design_handoff_revenue_targets).
 * A single goal doc per business drives goal-vs-actual-vs-projection, rolled up
 * by month / quarter / semester / year. Actual comes from real payments
 * (revenueSummary); projection is a 3-month run-rate (shown ±, never exact).
 *
 * Data: businesses/{bizId}/goals/current
 *   { fyStartMonth 0..11, annualCents, mode: even|manual, perMonthCents[12]
 *     (fiscal-indexed targets, the source of truth), midYearMode: remaining|backfill }
 *
 * The pure helpers below take an explicit `now` so they're deterministic/testable.
 */
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { getMyBizId } from "./businessService";

export const GOAL_MODES = { EVEN: "even", MANUAL: "manual" };
export const MID_YEAR_MODES = { REMAINING: "remaining", BACKFILL: "backfill" };
export const TRACKER_PERIODS = ["month", "quarter", "semester", "year"];

const DAY = 86400000;
const goalRef = (bizId) => doc(db, "businesses", bizId, "goals", "current");

export async function getGoal(bizId = getMyBizId()) {
  if (!bizId) return null;
  try {
    const snap = await getDoc(goalRef(bizId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error("getGoal failed:", e?.message || e);
    return null;
  }
}

export async function saveGoal(data, bizId = getMyBizId()) {
  if (!bizId) throw new Error("no_business");
  const payload = {
    fyStartMonth: Math.min(11, Math.max(0, Math.round(data.fyStartMonth || 0))),
    annualCents: Math.max(0, Math.round(data.annualCents || 0)),
    mode: data.mode === GOAL_MODES.MANUAL ? GOAL_MODES.MANUAL : GOAL_MODES.EVEN,
    midYearMode: data.midYearMode === MID_YEAR_MODES.BACKFILL ? MID_YEAR_MODES.BACKFILL : MID_YEAR_MODES.REMAINING,
    perMonthCents: Array.from({ length: 12 }, (_, i) => Math.max(0, Math.round(data.perMonthCents?.[i] || 0))),
    updatedAt: serverTimestamp(),
    createdAt: data.createdAt || serverTimestamp(),
  };
  await setDoc(goalRef(bizId), payload, { merge: true });
  return payload;
}

// ---------------------------------------------------------------------------
// Pure fiscal helpers
// ---------------------------------------------------------------------------

/** The fiscal-year start date on-or-before `now` (day 1 of fyStartMonth). */
export function fyStartDate(fyStartMonth, now = new Date()) {
  let year = now.getFullYear();
  if (now.getMonth() < fyStartMonth) year -= 1;
  return new Date(year, fyStartMonth, 1);
}

/** Calendar date (day 1) for fiscal-month index i (0..11). */
export function fiscalMonthDate(fyStartMonth, i, now = new Date()) {
  const s = fyStartDate(fyStartMonth, now);
  return new Date(s.getFullYear(), s.getMonth() + i, 1);
}

/** Current fiscal position 1..12 for `now`. */
export function fyPosition(fyStartMonth, now = new Date()) {
  const s = fyStartDate(fyStartMonth, now);
  const months = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth());
  return Math.min(12, Math.max(1, months + 1));
}

/** Fiscal-month indices (0..11) for the CURRENT period. */
export function periodFiscalMonths(period, position) {
  const cur = Math.min(11, Math.max(0, position - 1));
  if (period === "month") return [cur];
  if (period === "quarter") {
    const q = Math.floor(cur / 3);
    return [0, 1, 2].map((k) => q * 3 + k);
  }
  if (period === "semester") {
    const h = Math.floor(cur / 6);
    return [0, 1, 2, 3, 4, 5].map((k) => h * 6 + k);
  }
  return Array.from({ length: 12 }, (_, i) => i); // year
}

/**
 * Distribution at SAVE time → perMonthCents[12] (fiscal-indexed targets).
 * `actualElapsedByFMonth` supplies elapsed months' real revenue (backfill only).
 */
export function computeMonthlyTargets({
  annualCents,
  mode,
  midYearMode,
  perMonthManual = [],
  position,
  actualElapsedByFMonth = [],
}) {
  const elapsed = Math.min(12, Math.max(0, position - 1));
  const remaining = 12 - elapsed;
  const out = new Array(12).fill(0);
  const manualAt = (i) => Math.max(0, Math.round(perMonthManual[i] || 0));

  if (midYearMode === MID_YEAR_MODES.BACKFILL) {
    // Elapsed months carry their real revenue; remaining chases annual − booked.
    let booked = 0;
    for (let i = 0; i < elapsed; i++) {
      const a = Math.max(0, Math.round(actualElapsedByFMonth[i] || 0));
      out[i] = a;
      booked += a;
    }
    const remTarget = Math.max(0, annualCents - booked);
    if (mode === GOAL_MODES.MANUAL) {
      for (let i = elapsed; i < 12; i++) out[i] = manualAt(i);
    } else {
      const per = remaining > 0 ? Math.round(remTarget / remaining) : 0;
      for (let i = elapsed; i < 12; i++) out[i] = per;
    }
  } else {
    // Remaining-only: elapsed months aren't targeted (0); each remaining month
    // targets annual/12 (even) so the monthly isn't inflated.
    if (mode === GOAL_MODES.MANUAL) {
      for (let i = elapsed; i < 12; i++) out[i] = manualAt(i);
    } else {
      const per = Math.round(annualCents / 12);
      for (let i = elapsed; i < 12; i++) out[i] = per;
    }
  }
  return out;
}

/** Bucket payments into the 12 fiscal months of the current fiscal year. */
export function bucketPaymentsByFiscalMonth(payments, fyStartMonth, now = new Date()) {
  const s = fyStartDate(fyStartMonth, now);
  const out = new Array(12).fill(0);
  for (const p of payments || []) {
    const d = new Date(p.date);
    if (!isFinite(d.getTime())) continue;
    const idx = (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth());
    if (idx >= 0 && idx < 12) out[idx] += p.amountCents || 0;
  }
  return out;
}

/** 3-month run-rate from the last completed fiscal months (null if none). */
export function runRate(actualByFMonth, position) {
  const elapsed = Math.min(12, Math.max(0, position - 1)); // completed months
  if (elapsed <= 0) return null;
  const take = Math.min(3, elapsed);
  let sum = 0;
  for (let i = elapsed - take; i < elapsed; i++) sum += actualByFMonth[i] || 0;
  return Math.round(sum / take);
}

const sum = (arr, idxs) => idxs.reduce((s, i) => s + (arr[i] || 0), 0);

/**
 * Everything the Target Tracker renders for a period. Actual from payments,
 * projection from run-rate; divide-by-zero → null (the UI shows "—").
 * @returns {object}
 */
export function computeTracker(goal, payments, period, now = new Date()) {
  const fyStartMonth = goal.fyStartMonth || 0;
  const targets = Array.isArray(goal.perMonthCents) ? goal.perMonthCents : new Array(12).fill(0);
  const actual = bucketPaymentsByFiscalMonth(payments, fyStartMonth, now);
  const position = fyPosition(fyStartMonth, now);
  const cur = position - 1; // current fiscal-month index
  const rate = runRate(actual, position);

  // Per-month projection: past = actual; current = max(actual, run-rate);
  // future = run-rate. Null run-rate → projection unavailable.
  const projMonth = (i) => {
    if (rate == null) return null;
    if (i < cur) return actual[i] || 0;
    if (i === cur) return Math.max(actual[i] || 0, rate);
    return rate;
  };

  const idxs = periodFiscalMonths(period, position);
  const targetCents = sum(targets, idxs);
  const actualCents = sum(actual, idxs);
  const projectedCents = rate == null ? null : idxs.reduce((s, i) => s + (projMonth(i) || 0), 0);

  // Expected-today %: share of the period's days that have already elapsed.
  const pStart = fiscalMonthDate(fyStartMonth, idxs[0], now);
  const pEnd = fiscalMonthDate(fyStartMonth, idxs[idxs.length - 1] + 1, now);
  const totalDays = Math.max(1, (pEnd - pStart) / DAY);
  const elapsedDays = Math.min(totalDays, Math.max(0, (now - pStart) / DAY));
  const expectedPct = Math.round((elapsedDays / totalDays) * 100);

  const attainment = targetCents > 0 ? Math.round((actualCents / targetCents) * 100) : null;
  const onPace = targetCents > 0 && projectedCents != null ? Math.round((projectedCents / targetCents) * 100) : null;
  const ahead = attainment != null ? attainment >= expectedPct : null;

  // Roll-up rows: current month · current semester · full year.
  const rollup = ["month", "semester", "year"].map((p) => {
    const ii = periodFiscalMonths(p, position);
    const tgt = sum(targets, ii);
    const act = sum(actual, ii);
    const proj = rate == null ? null : ii.reduce((s, i) => s + (projMonth(i) || 0), 0);
    const rStart = fiscalMonthDate(fyStartMonth, ii[0], now);
    const rEnd = fiscalMonthDate(fyStartMonth, ii[ii.length - 1] + 1, now);
    const rTotal = Math.max(1, (rEnd - rStart) / DAY);
    const rElapsed = Math.min(rTotal, Math.max(0, (now - rStart) / DAY));
    const expPct = Math.round((rElapsed / rTotal) * 100);
    const pct = tgt > 0 ? Math.round((act / tgt) * 100) : null;
    return {
      period: p,
      targetCents: tgt,
      actualCents: act,
      projectedCents: proj,
      pct,
      projPct: tgt > 0 && proj != null ? Math.round((proj / tgt) * 100) : null,
      expectedPct: expPct,
      ahead: pct != null ? pct >= expPct : null,
    };
  });

  // Chart series over the full fiscal year (cumulative): goal, actual (to today),
  // projection (dashed from today). Values in cents.
  let goalCum = 0;
  let actCum = 0;
  const chart = [];
  for (let i = 0; i < 12; i++) {
    goalCum += targets[i] || 0;
    const isPast = i <= cur;
    if (isPast) actCum += actual[i] || 0;
    chart.push({
      // Calendar month index — the screen localizes it with the app language.
      monthIndex: fiscalMonthDate(fyStartMonth, i, now).getMonth(),
      goal: goalCum,
      actual: isPast ? actCum : null,
      isToday: i === cur,
    });
  }
  // Projection cumulative from today's actual to year end.
  let projCum = actCum;
  for (let i = 0; i < 12; i++) {
    if (i < cur) { chart[i].projection = null; continue; }
    if (i === cur) { chart[i].projection = actCum; continue; }
    projCum += rate == null ? 0 : rate;
    chart[i].projection = rate == null ? null : projCum;
  }

  return {
    period,
    position,
    targetCents,
    actualCents,
    projectedCents,
    attainment,
    onPace,
    expectedPct,
    ahead,
    runRateCents: rate,
    rollup,
    chart,
  };
}
