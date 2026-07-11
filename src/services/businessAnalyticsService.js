/**
 * businessAnalyticsService — the Business Dashboard's real numbers
 * (kinlo_business/02 §A), aggregated client-side from members + attendance.
 * Grounded only: metrics we can't yet source (revenue → Finance block;
 * recovered → needs longitudinal history) are returned null so the UI shows
 * "—" instead of a fabricated value. Period-over-period comparison included.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import { listMembers, MEMBER_STATUS, PRICING_TIER } from "./businessMembersService";
import { listAttendanceInRange } from "./businessAttendanceService";
import { listPaymentsInRange, revenueSummary } from "./businessPaymentsService";
import { listExpensesInRange, expenseSummary } from "./businessExpensesService";
import { isPackageExpired } from "./businessPackagesService";
import { previousBounds, chartBuckets } from "../constants/businessRanges";

const toMillis = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  const t = new Date(ts).getTime();
  return isFinite(t) ? t : 0;
};

const pctDelta = (cur, prev) =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

/**
 * Compute everything the dashboard renders for a range.
 * @param {{from:Date,to:Date}} bounds
 */
export async function computeDashboard(bounds) {
  const { from, to } = bounds;
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const prev = previousBounds(bounds);

  const [members, attendance, prevAttendance, payments, prevPayments, expenses] = await Promise.all([
    listMembers(),
    listAttendanceInRange(fromIso, toIso),
    prev
      ? listAttendanceInRange(prev.from.toISOString(), prev.to.toISOString())
      : Promise.resolve([]),
    listPaymentsInRange(fromIso, toIso),
    prev
      ? listPaymentsInRange(prev.from.toISOString(), prev.to.toISOString())
      : Promise.resolve([]),
    listExpensesInRange(fromIso, toIso),
  ]);

  const fromMs = from.getTime();
  const toMs = to.getTime();

  // Attendance
  const attendanceCount = attendance.length;
  const attendedIds = new Set(attendance.map((a) => a.memberId));
  const activeInRange = attendedIds.size;
  const attendanceTrend = pctDelta(attendanceCount, prevAttendance.length);

  // Membership snapshot (host-set status)
  const statusActive = members.filter((m) => (m.status || "active") === MEMBER_STATUS.ACTIVE).length;
  const atRisk = members.filter((m) => m.status === MEMBER_STATUS.AT_RISK).length;
  const inactive = members.filter((m) => m.status === MEMBER_STATUS.INACTIVE).length;

  // New members created within the window (+ previous for trend)
  const createdInWindow = (m, a, b) => {
    const c = toMillis(m.createdAt);
    return c >= a && c < b;
  };
  const newMembers = members.filter((m) => createdInWindow(m, fromMs, toMs)).length;
  const newPrev = prev
    ? members.filter((m) => createdInWindow(m, prev.from.getTime(), prev.to.getTime())).length
    : 0;
  const newTrend = pctDelta(newMembers, newPrev);

  // Prospects: created in-window but never seen attending (estimate)
  const prospects = members.filter(
    (m) => createdInWindow(m, fromMs, toMs) && !attendedIds.has(m.id)
  ).length;

  // Multi-line trend: attendance · revenue · new members per bucket. All three
  // come from arrays already in hand (dashboard handoff §A) — zero extra reads.
  const buckets = chartBuckets(bounds);
  const series = buckets.map((bkt) => ({
    label: bkt.label,
    value: attendance.filter((a) => {
      const t = new Date(a.date).getTime();
      return t >= bkt.start && t < bkt.end;
    }).length,
    revenueCents: payments
      .filter((p) => {
        const t = new Date(p.date).getTime();
        return t >= bkt.start && t < bkt.end;
      })
      .reduce((s, p) => s + (p.amountCents || 0), 0),
    newMembers: members.filter((m) => createdInWindow(m, bkt.start, bkt.end)).length,
  }));

  // Best days to schedule: attendance by weekday (0=Sun..6=Sat). Local weekday of
  // each check-in (the studio-local day the class ran).
  const weekdayHistogram = [0, 0, 0, 0, 0, 0, 0];
  for (const a of attendance) {
    const d = new Date(a.date);
    if (isFinite(d.getTime())) weekdayHistogram[d.getDay()] += 1;
  }

  // Repeat rate: share of active-in-range members who attended 2+ times.
  const attendCounts = new Map();
  for (const a of attendance) attendCounts.set(a.memberId, (attendCounts.get(a.memberId) || 0) + 1);
  const repeaters = [...attendCounts.values()].filter((c) => c >= 2).length;
  const repeatRate = activeInRange > 0 ? Math.round((repeaters / activeInRange) * 100) : null;

  // ARPU: revenue ÷ distinct paying members in the range (walk-in payments carry
  // no memberId, so the denominator counts identified payers only).
  const revenueCents = revenueSummary(payments).total;
  const distinctPayers = new Set(payments.filter((p) => p.memberId).map((p) => p.memberId)).size;
  const arpuCents = distinctPayers > 0 ? Math.round(revenueCents / distinctPayers) : null;

  // Unredeemed credits: outstanding obligation the host still owes. Exclude only
  // credits whose granting package has lapsed (can't be redeemed anyway).
  const creditsUnredeemed = members.reduce((s, m) => {
    const bal = m.creditBalance || 0;
    if (bal <= 0) return s;
    if (m.activePackage && isPackageExpired(m.activePackage)) return s;
    return s + bal;
  }, 0);

  // Local vs General pricing mix (visits), by each member's checkout price tier.
  // This is a PRICING split, not a residency signal — labeled as such in the UI.
  const memberById = new Map(members.map((m) => [m.id, m]));
  let localVisits = 0;
  let generalVisits = 0;
  for (const a of attendance) {
    const tier = memberById.get(a.memberId)?.pricingTier;
    if (tier === PRICING_TIER.LOCAL) localVisits += 1;
    else if (tier === PRICING_TIER.GENERAL) generalVisits += 1;
  }

  return {
    range: { from: fromIso, to: toIso },
    totalMembers: members.length,
    activeInRange,
    attendanceCount,
    attendanceTrend,
    newMembers,
    newTrend,
    prospects,
    statusActive,
    atRisk,
    // churn (est): host-marked inactive is our best lost-member signal today.
    churn: inactive,
    // recovered needs longitudinal status history we don't keep yet → null (—).
    recovered: null,
    // revenue from the Finance ledger (real).
    revenueCents,
    revenueTrend: pctDelta(revenueCents, revenueSummary(prevPayments).total),
    // expenses + net P&L (dashboard handoff §8): net margin flows into the KPIs.
    expensesCents: expenseSummary(expenses).total,
    netCents: revenueCents - expenseSummary(expenses).total,
    // dashboard-insights (real, zero extra reads): repeat rate, ARPU, credits.
    repeatRate,
    arpuCents,
    distinctPayers,
    creditsUnredeemed,
    // best days + pricing mix insight cards.
    weekdayHistogram,
    pricingMix: { local: localVisits, general: generalVisits },
    series,
  };
}

/**
 * Whole-business occupancy (reserved basis) for a range: Σ reserved ÷ Σ capacity
 * across the host's events dated in [from,to] that carry a capacity. Reserved =
 * attendees.length (RSVPs) or participantCount, capped at capacity so one
 * oversold event can't push past 100%. One events query, NO per-event checkin
 * reads — kept OUT of computeDashboard so the default render pays nothing extra.
 * Returns { pct:null } (honest "—") when no event has a capacity set.
 * @param {{from:Date,to:Date}} bounds
 */
export async function computeOccupancy(bounds) {
  const uid = auth.currentUser?.uid;
  if (!uid) return { pct: null, events: 0 };
  const fromMs = bounds.from.getTime();
  const toMs = bounds.to.getTime();
  try {
    const snap = await getDocs(query(collection(db, "events"), where("creatorId", "==", uid)));
    let reserved = 0;
    let capacity = 0;
    let counted = 0;
    snap.docs.forEach((docSnap) => {
      const e = docSnap.data();
      if (!e.date) return; // date-less/malformed event — no window to place it in
      const t = new Date(e.date).getTime();
      if (!isFinite(t) || t < fromMs || t >= toMs) return;
      if (e.agendaType === "blocked" || e.status === "cancelled") return;
      const cap = e.maxPeople || 0;
      if (cap <= 0) return; // unlimited/unset — no denominator
      const filled = Array.isArray(e.attendees) ? e.attendees.length : e.participantCount || 0;
      reserved += Math.min(filled, cap);
      capacity += cap;
      counted += 1;
    });
    return { pct: capacity > 0 ? Math.round((reserved / capacity) * 100) : null, events: counted };
  } catch (e) {
    console.error("computeOccupancy failed:", e?.message || e);
    return { pct: null, events: 0 };
  }
}

/** A flat CSV of the dashboard metrics for export/share. */
export function dashboardToCsv(d, rangeLabel) {
  const rows = [
    ["metric", "value"],
    ["range", rangeLabel],
    ["total_members", d.totalMembers],
    ["active_in_range", d.activeInRange],
    ["attendance", d.attendanceCount],
    ["attendance_trend_pct", d.attendanceTrend ?? ""],
    ["new_members", d.newMembers],
    ["prospects", d.prospects],
    ["at_risk", d.atRisk],
    ["churn_est", d.churn],
    ["revenue_cents", d.revenueCents ?? ""],
    ["expenses_cents", d.expensesCents ?? ""],
    ["net_cents", d.netCents ?? ""],
    ["arpu_cents", d.arpuCents ?? ""],
    ["repeat_rate_pct", d.repeatRate ?? ""],
    ["credits_unredeemed", d.creditsUnredeemed ?? ""],
    ["recovered", d.recovered ?? ""],
    ["visits_local", d.pricingMix?.local ?? ""],
    ["visits_general", d.pricingMix?.general ?? ""],
  ];
  return rows.map((r) => r.join(",")).join("\n");
}
