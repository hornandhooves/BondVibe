/**
 * businessAnalyticsService — the Business Dashboard's real numbers
 * (kinlo_business/02 §A), aggregated client-side from members + attendance.
 * Grounded only: metrics we can't yet source (revenue → Finance block;
 * recovered → needs longitudinal history) are returned null so the UI shows
 * "—" instead of a fabricated value. Period-over-period comparison included.
 */
import { listMembers, MEMBER_STATUS } from "./businessMembersService";
import { listAttendanceInRange } from "./businessAttendanceService";
import { listPaymentsInRange, revenueSummary } from "./businessPaymentsService";
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

  const [members, attendance, prevAttendance, payments, prevPayments] = await Promise.all([
    listMembers(),
    listAttendanceInRange(fromIso, toIso),
    prev
      ? listAttendanceInRange(prev.from.toISOString(), prev.to.toISOString())
      : Promise.resolve([]),
    listPaymentsInRange(fromIso, toIso),
    prev
      ? listPaymentsInRange(prev.from.toISOString(), prev.to.toISOString())
      : Promise.resolve([]),
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

  // Chart: attendance per bucket
  const buckets = chartBuckets(bounds);
  const series = buckets.map((bkt) => {
    const count = attendance.filter((a) => {
      const t = new Date(a.date).getTime();
      return t >= bkt.start && t < bkt.end;
    }).length;
    return { label: bkt.label, value: count };
  });

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
    revenueCents: revenueSummary(payments).total,
    revenueTrend: pctDelta(revenueSummary(payments).total, revenueSummary(prevPayments).total),
    series,
  };
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
  ];
  return rows.map((r) => r.join(",")).join("\n");
}
