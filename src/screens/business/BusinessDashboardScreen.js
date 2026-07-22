/**
 * BusinessDashboardScreen — ranged KPIs + chart + AI read (kinlo_business/02 §A).
 * Real numbers from members + attendance; metrics we can't source yet show "—"
 * (revenue → Finance block). AI read (narrative + projection) via callClaude,
 * grounded server-side; degrades to plain metrics if AI is off/unavailable.
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Modal,
  TextInput,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import { db, auth } from "../../services/firebase";
import { useBusinessScope } from "../../contexts/BusinessScopeContext";
import useClaude from "../../hooks/useClaude";
import useBusinessPerms from "../../hooks/useBusinessPerms";
import TrendLines, { TREND_COLORS } from "../../components/TrendLines";
import { computeDashboard, computeOccupancy, dashboardToCsv } from "../../services/businessAnalyticsService";
import { RANGE_IDS, DEFAULT_RANGE, rangeBounds, rangeLabelKey } from "../../constants/businessRanges";
import { formatCentavosCompact } from "../../utils/pricing";
import { FONTS } from "../../constants/theme-tokens";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export default function BusinessDashboardScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { allows } = useBusinessPerms(); // owner → all; staff → their role's perms
  const canFinance = allows("finance");
  const { t, i18n } = useTranslation();
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE);
  const [customFrom, setCustomFrom] = useState(null);
  const [customTo, setCustomTo] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [occupancy, setOccupancy] = useState({ pct: null, events: 0 });
  const { isEventScoped, event: scopeEvent, setEventScope, setWholeBusiness } = useBusinessScope();
  const [eventStats, setEventStats] = useState(null);
  // Scope control lives here now (BUG 17) — Whole business / Choose event.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [pickerSearch, setPickerSearch] = useState("");

  // BUG 35: split the picker list into Upcoming / Past (filtered by the search
  // query), each already sorted for scoping — soonest-first upcoming, most-recent
  // past.
  const pickerGroups = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const matched = q
      ? events.filter((e) => (e.title || "").toLowerCase().includes(q))
      : events;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const t0 = todayStart.getTime();
    const upcoming = matched
      .filter((e) => new Date(e.date || 0).getTime() >= t0)
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    const past = matched
      .filter((e) => new Date(e.date || 0).getTime() < t0)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return { upcoming, past };
  }, [events, pickerSearch]);

  const openEventPicker = async () => {
    setPickerOpen(true);
    setPickerSearch("");
    try {
      const uid = auth.currentUser?.uid;
      const snap = await getDocs(query(collection(db, "events"), where("creatorId", "==", uid)));
      setEvents(
        snap.docs
          .map((d) => {
            const e = d.data();
            return {
              id: d.id,
              title: e.title || "Event",
              date: e.date,
              agendaType: e.agendaType || "general",
              status: e.status,
              location: e.location || e.venueAddress || "",
              city: e.city || "",
              // Attendance hint: real attendees when present, else participantCount.
              attendees: e.participantCount || null, // ROSTER (#55)
              maxPeople: e.maxPeople || null,
            };
          })
          // BUG 35: never list blocked (personal) time or cancelled events — they
          // can't be a meaningful dashboard scope (no attendees/revenue).
          .filter((e) => e.agendaType !== "blocked" && e.status !== "cancelled")
          .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      );
    } catch (e) {
      setEvents([]);
    }
  };

  // When the hub is scoped to one event, load that event's own stats.
  useEffect(() => {
    if (!isEventScoped || !scopeEvent?.id) { setEventStats(null); return; }
    let alive = true;
    (async () => {
      try {
        const [evSnap, ciSnap] = await Promise.all([
          getDoc(doc(db, "events", scopeEvent.id)),
          getDocs(collection(db, "events", scopeEvent.id, "checkins")),
        ]);
        const ev = evSnap.exists() ? evSnap.data() : {};
        if (alive) {
          setEventStats({
            going: ev.participantCount || 0, // ROSTER (#55)
            checkedIn: ciSnap.size,
            capacity: ev.maxPeople || 0,
          });
        }
      } catch (e) {
        if (alive) setEventStats(null);
      }
    })();
    return () => { alive = false; };
  }, [isEventScoped, scopeEvent?.id]);

  const bounds = useMemo(
    () => rangeBounds(rangeId, { from: customFrom, to: customTo }),
    [rangeId, customFrom, customTo]
  );
  const fromIso = bounds.from.toISOString();
  const toIso = bounds.to.toISOString();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    computeDashboard(bounds).then((m) => {
      if (alive) {
        setMetrics(m);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromIso, toIso]);

  // Whole-business occupancy (reserved basis) — one extra events query, only when
  // NOT scoped to a single event (the event-scoped card derives its own %).
  useEffect(() => {
    if (isEventScoped) return;
    let alive = true;
    setOccupancy({ pct: null, events: 0 });
    computeOccupancy(bounds).then((o) => {
      if (alive) setOccupancy(o);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromIso, toIso, isEventScoped]);

  // AI read — grounded server-side; fallback:true when AI is off/unavailable.
  const rangeLabel = t(rangeLabelKey(rangeId));
  const { data: ai, loading: aiLoading, fallback: aiFallback } = useClaude(
    "business_dashboard",
    { from: fromIso, to: toIso },
    { cacheKey: `bizdash:${rangeId}:${fromIso.slice(0, 10)}`, ttlMs: 30 * 60 * 1000 }
  );

  const onExport = async () => {
    if (!metrics) return;
    try {
      await Share.share({ message: dashboardToCsv(metrics, rangeLabel) });
    } catch (e) {
      /* cancelled */
    }
  };

  const styles = createStyles(colors);
  // Flat KPI/insight cards use the exact spec border (#ECE8F2) in light; dark
  // keeps the theme token. No shadow on these cards — only CTAs and P&L carry one.
  const cardBorder = isDark ? colors.border : "#ECE8F2";

  // Occupancy + check-in resolve by scope. Event-scoped derives from eventStats
  // (real, already loaded); whole-business uses the reserved-occupancy query and
  // has no cheap whole-business check-in signal → honest "—" (dashboard §A).
  const evCap = eventStats?.capacity || 0;
  const evGoing = eventStats?.going || 0;
  // Clamp to 100%: an event can be oversold (capacity lowered post-RSVP) or hold
  // stale check-in docs after an attendee leaves — neither should render >100%.
  const occupancyPct = isEventScoped
    ? evCap > 0 ? Math.min(100, Math.round((evGoing / evCap) * 100)) : null
    : occupancy.pct;
  const checkInPct = isEventScoped && evGoing > 0 ? Math.min(100, Math.round(((eventStats?.checkedIn || 0) / evGoing) * 100)) : null;
  const noShowPct = checkInPct != null ? 100 - checkInPct : null;

  // Curated KPI wall (mock 8 + Phase-1 Net profit). Demoted member-funnel metrics
  // (active/new/prospects/churn/recovered) still ship in the CSV export + trend.
  const kpis = metrics
    ? [
        { key: "attendance", value: metrics.attendanceCount, kind: "count", trend: metrics.attendanceTrend, tap: "biz_attendance" },
        { key: "occupancy", value: occupancyPct, kind: "pct" },
        { key: "checkInRate", value: checkInPct, kind: "pct", sub: noShowPct != null ? t("business.dashboard.noShow", { pct: noShowPct }) : null },
        // FINANCE CAPABILITY (#59): a staff role without finance sees honest "—"
        // and no Finance/Expenses deep-link — the server denies those reads anyway.
        { key: "revenue", value: canFinance ? metrics.revenueCents : null, kind: "money", trend: canFinance ? metrics.revenueTrend : undefined, tapScreen: canFinance ? "BusinessFinance" : undefined },
        { key: "netMargin", value: canFinance ? metrics.netCents : null, kind: "money", netTone: true, tapScreen: canFinance ? "BusinessExpenses" : undefined },
        { key: "arpu", value: metrics.arpuCents, kind: "money" },
        { key: "repeatRate", value: metrics.repeatRate, kind: "pct" },
        { key: "atRisk", value: metrics.atRisk, kind: "count", sub: t("business.dashboard.membersSub"), tap: "biz_atRisk" },
        { key: "creditsUnredeemed", value: metrics.creditsUnredeemed, kind: "count", sub: t("business.dashboard.deferredSub") },
      ]
    : [];

  const fmtKpi = (k) => {
    if (k.value == null) return "—";
    if (k.kind === "money") return formatCentavosCompact(k.value);
    if (k.kind === "pct") return `${k.value}%`;
    return k.value;
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.dashboard.title")}</Text>
        <TouchableOpacity onPress={onExport}>
          <Icon name="share" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Scope: Whole business | Choose event ▾ — drives the KPIs (BUG 17). */}
        <View style={[styles.scopeTrack, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.scopeSeg, !isEventScoped && { backgroundColor: colors.primary }]}
            onPress={setWholeBusiness}
            activeOpacity={0.85}
          >
            <Text style={[styles.scopeText, { color: !isEventScoped ? "#fff" : colors.textSecondary }]}>
              {t("business.hub.scopeWhole")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeSeg, isEventScoped && { backgroundColor: colors.primary }]}
            onPress={openEventPicker}
            activeOpacity={0.85}
          >
            <Text style={[styles.scopeText, { color: isEventScoped ? "#fff" : colors.textSecondary }]} numberOfLines={1}>
              {isEventScoped ? scopeEvent.title : t("business.hub.scopeEvent")}
            </Text>
            <Icon name="down" size={14} color={isEventScoped ? "#fff" : colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {isEventScoped && (
          <TouchableOpacity style={styles.scopeClear} onPress={setWholeBusiness}>
            <Text style={[styles.scopeClearText, { color: colors.primary }]}>{t("business.hub.scopeClear")}</Text>
          </TouchableOpacity>
        )}

        {/* Event-scoped stats (kinlo_business/06 FIX 1) */}
        {isEventScoped && (
          <View style={[styles.scopeCard, { backgroundColor: `${colors.primary}0F`, borderColor: `${colors.primary}33` }]}>
            <Text style={[styles.scopeName, { color: colors.primary }]} numberOfLines={1}>{scopeEvent.title}</Text>
            <View style={styles.scopeStats}>
              {[
                { n: eventStats?.going ?? "—", k: t("business.dashboard.scopeGoing") },
                { n: eventStats?.checkedIn ?? "—", k: t("business.dashboard.scopeCheckedIn") },
                { n: eventStats?.capacity ?? "—", k: t("business.dashboard.scopeCapacity") },
              ].map((s, i) => (
                <View key={i} style={styles.scopeStat}>
                  <Text style={[styles.scopeStatNum, { color: colors.text }]}>{s.n}</Text>
                  <Text style={[styles.scopeStatLabel, { color: colors.textTertiary }]}>{s.k}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.scopeNote, { color: colors.textTertiary }]}>{t("business.dashboard.scopeNote")}</Text>
          </View>
        )}

        {/* Range selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.rangeRow}>
          {RANGE_IDS.map((id) => {
            const active = rangeId === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setRangeId(id)}
                style={[styles.rangeChip, { backgroundColor: active ? colors.text : colors.surfaceGlass }]}
              >
                <Text style={[styles.rangeText, { color: active ? colors.background : colors.textSecondary }]}>
                  {t(rangeLabelKey(id))}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {rangeId === "custom" && (
          <View style={styles.customRow}>
            <DateField label={t("business.dashboard.from")} value={customFrom} onChange={setCustomFrom} onClear={() => setCustomFrom(null)} />
            <DateField label={t("business.dashboard.to")} value={customTo} onChange={setCustomTo} onClear={() => setCustomTo(null)} minimumDate={customFrom || undefined} />
          </View>
        )}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* KPI grid (curated) — tappable cards drill into AnalyticsDetail;
                honest "—" + amber dot when a signal has no data yet. */}
            <View style={styles.kpiGrid}>
              {kpis.map((k) => {
                // Money/CRM KPIs route to their real source screen (Finance / P&L);
                // member KPIs open the honest AnalyticsDetail business branch.
                const onPressKpi = k.tapScreen
                  ? () => navigation.navigate(k.tapScreen)
                  : k.tap
                    ? () => navigation.navigate("AnalyticsDetail", { metric: k.tap, range: { from: fromIso, to: toIso } })
                    : null;
                const Card = onPressKpi ? TouchableOpacity : View;
                return (
                  <Card
                    key={k.key}
                    style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}
                    {...(onPressKpi ? { activeOpacity: 0.85, onPress: onPressKpi } : {})}
                  >
                    {k.value == null && <View style={styles.needsDot} />}
                    <Text style={[styles.kpiLabel, { color: colors.textTertiary }]}>{t(`business.dashboard.kpi.${k.key}`)}</Text>
                    <Text
                      style={[
                        styles.kpiValue,
                        { color: k.netTone && k.value != null ? (k.value >= 0 ? colors.success : colors.error) : colors.text },
                      ]}
                    >
                      {fmtKpi(k)}
                    </Text>
                    {typeof k.trend === "number" ? (
                      <Text style={[styles.kpiTrend, { color: k.trend >= 0 ? colors.success : "#C2410C" }]}>
                        {k.trend >= 0 ? "↑" : "↓"} {Math.abs(k.trend)}%
                      </Text>
                    ) : k.sub ? (
                      <Text style={[styles.kpiSub, { color: colors.textTertiary }]}>{k.sub}</Text>
                    ) : null}
                  </Card>
                );
              })}
            </View>

            {/* Multi-line trend: attendance · revenue · new members */}
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.dashboard.trendTitle")}</Text>
            <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
              {metrics && metrics.series && metrics.series.length >= 2 && metrics.attendanceCount + metrics.revenueCents + metrics.newMembers > 0 ? (
                <>
                  <TrendLines series={metrics.series} height={132} />
                  <View style={styles.xLabels}>
                    {metrics.series.map((s, i) => (
                      <Text key={i} style={[styles.xLabel, { color: colors.textTertiary }]} numberOfLines={1}>{s.label}</Text>
                    ))}
                  </View>
                  <View style={styles.legend}>
                    {[
                      { c: TREND_COLORS.attendance, k: "legendAttendance" },
                      { c: TREND_COLORS.revenue, k: "legendRevenue" },
                      { c: TREND_COLORS.newMembers, k: "legendNew" },
                    ].map((l) => (
                      <View key={l.k} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: l.c }]} />
                        <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t(`business.dashboard.${l.k}`)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={[styles.emptyChart, { color: colors.textTertiary }]}>{t("business.dashboard.noAttendance")}</Text>
              )}
            </View>

            {/* Insight: best days to schedule (attendance by weekday) */}
            {metrics && metrics.attendanceCount > 0 && (() => {
              const hist = metrics.weekdayHistogram || [];
              const order = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sun
              const peakIdx = hist.reduce((best, v, i) => (v > (hist[best] || 0) ? i : best), 0);
              const peakMax = Math.max(1, ...hist);
              return (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.dashboard.bestDays")}</Text>
                  <View style={[styles.insightCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                    <View style={styles.dayRow}>
                      {order.map((di) => {
                        const v = hist[di] || 0;
                        const isPeak = di === peakIdx && v > 0;
                        const h = Math.max(4, Math.round((v / peakMax) * 84));
                        return (
                          <View key={di} style={styles.dayCol}>
                            <View style={styles.dayBarTrack}>
                              {isPeak ? (
                                <LinearGradient colors={["#7C3AED", "#C026D3"]} style={[styles.dayBar, { height: h }]} />
                              ) : (
                                <View style={[styles.dayBar, { height: h, backgroundColor: v > 0 ? "#C9B0F2" : "#EDE7FB" }]} />
                              )}
                            </View>
                            <Text style={[styles.dayLetter, { color: isPeak ? colors.primary : colors.textTertiary, fontFamily: isPeak ? FONTS.bodyBold : FONTS.bodyMedium }]}>
                              {t(`business.dashboard.weekday.${WEEKDAY_KEYS[di]}`)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    {hist[peakIdx] > 0 && (
                      <Text style={[styles.insightNote, { color: colors.textSecondary }]}>
                        {t("business.dashboard.bestDayNote", { day: t(`business.dashboard.weekdayFull.${WEEKDAY_KEYS[peakIdx]}`) })}
                      </Text>
                    )}
                  </View>
                </>
              );
            })()}

            {/* Insight: Local vs General pricing mix (a PRICING split, not residency) */}
            {metrics && (metrics.pricingMix.local + metrics.pricingMix.general) > 0 && (() => {
              const { local, general } = metrics.pricingMix;
              const total = local + general;
              const localPct = Math.round((local / total) * 100);
              return (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.dashboard.pricingMix")}</Text>
                  <View style={[styles.insightCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                    {[
                      { label: t("business.dashboard.tierLocal"), val: local, pct: localPct, c: colors.primary },
                      { label: t("business.dashboard.tierGeneral"), val: general, pct: 100 - localPct, c: "#8a86a0" },
                    ].map((row) => (
                      <View key={row.label} style={styles.mixRow}>
                        <View style={styles.mixTop}>
                          <Text style={[styles.mixLabel, { color: colors.text }]}>{row.label}</Text>
                          <Text style={[styles.mixPct, { color: colors.textSecondary }]}>{row.pct}%</Text>
                        </View>
                        <View style={[styles.mixTrack, { backgroundColor: "#F1EAFB" }]}>
                          <View style={[styles.mixFill, { width: `${row.pct}%`, backgroundColor: row.c }]} />
                        </View>
                      </View>
                    ))}
                    <Text style={[styles.insightNote, { color: colors.textTertiary }]}>{t("business.dashboard.pricingMixNote")}</Text>
                  </View>
                </>
              );
            })()}

            {/* Insight: member flow — retention (returning actives) + real churn /
                recovered from the status-change log; honest "—" while it builds. */}
            {metrics && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.dashboard.memberFlow")}</Text>
                <View style={[styles.insightCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                  <View style={styles.flowRow}>
                    {[
                      { key: "joined", value: metrics.newMembers, tone: colors.success },
                      { key: "churned", value: metrics.churnLogged, tone: "#C2410C", tap: "biz_churned" },
                      { key: "recovered", value: metrics.recoveredLogged, tone: colors.primary },
                    ].map((c) => {
                      const Cell = c.tap ? TouchableOpacity : View;
                      return (
                        <Cell
                          key={c.key}
                          style={styles.flowCell}
                          {...(c.tap && c.value != null ? { activeOpacity: 0.85, onPress: () => navigation.navigate("AnalyticsDetail", { metric: c.tap, range: { from: fromIso, to: toIso } }) } : {})}
                        >
                          <Text style={[styles.flowNum, { color: c.value == null ? colors.textTertiary : c.tone }]}>{c.value == null ? "—" : c.value}</Text>
                          <Text style={[styles.flowLabel, { color: colors.textTertiary }]}>{t(`business.dashboard.flow.${c.key}`)}</Text>
                        </Cell>
                      );
                    })}
                  </View>
                  <View style={styles.retentionRow}>
                    <View style={styles.mixTop}>
                      <Text style={[styles.mixLabel, { color: colors.text }]}>{t("business.dashboard.retention")}</Text>
                      <Text style={[styles.mixPct, { color: colors.textSecondary }]}>{metrics.retentionRate == null ? "—" : `${metrics.retentionRate}%`}</Text>
                    </View>
                    <View style={[styles.mixTrack, { backgroundColor: "#E1F5EC" }]}>
                      <View style={[styles.mixFill, { width: `${metrics.retentionRate || 0}%`, backgroundColor: colors.success }]} />
                    </View>
                  </View>
                  <Text style={[styles.insightNote, { color: colors.textTertiary }]}>
                    {metrics.churnLogged == null ? t("business.dashboard.flowBuilding") : t("business.dashboard.flowNote")}
                  </Text>
                </View>
              </>
            )}

            {/* AI read */}
            {aiLoading ? (
              <View style={[styles.aiCard, { backgroundColor: colors.ink || "#160F22" }]}>
                <ActivityIndicator color="#C792EA" />
              </View>
            ) : ai && !aiFallback ? (
              <View style={[styles.aiCard, { backgroundColor: colors.ink || "#160F22" }]}>
                <View style={styles.aiHeader}>
                  <Icon name="ai" size={15} color="#C792EA" />
                  <Text style={styles.aiEyebrow}>{t("business.dashboard.aiRead")}</Text>
                </View>
                <Text style={styles.aiNarrative}>{ai.narrative}</Text>
                {ai.projection?.note ? (
                  <Text style={styles.aiProjection}>
                    {ai.projection.attendanceNext != null
                      ? t("business.dashboard.projection", { n: ai.projection.attendanceNext }) + " "
                      : ""}
                    {ai.projection.note}
                  </Text>
                ) : null}
                {Array.isArray(ai.recommendations) &&
                  ai.recommendations.slice(0, 3).map((r, i) => (
                    <View key={i} style={styles.aiRec}>
                      <Text style={styles.aiRecDot}>•</Text>
                      <Text style={styles.aiRecText}>{r.text}</Text>
                    </View>
                  ))}
              </View>
            ) : (
              <Text style={[styles.aiOff, { color: colors.textTertiary }]}>{t("business.dashboard.aiOff")}</Text>
            )}
          </>
        )}
      </ScrollView>

      {/* Event picker for "Choose event" scope (BUG 17/35) — search, Upcoming/Past
          grouping, rich identifiable rows, Whole-business reset. */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.hub.pickEvent")}</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Icon name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={[styles.pickerSearch, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
              <Icon name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={[styles.pickerSearchInput, { color: colors.text }]}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder={t("business.hub.searchEvents")}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>

            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              {/* Whole business quick-reset */}
              <TouchableOpacity
                style={[styles.wholeBizRow, { borderColor: colors.border }]}
                onPress={() => { setWholeBusiness(); setPickerOpen(false); }}
              >
                <View style={[styles.typeChip, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="wallet" size={13} color={colors.primary} />
                </View>
                <Text style={[styles.eventName, { flex: 1, color: colors.text }]}>{t("business.hub.scopeWhole")}</Text>
                {!isEventScoped && <Icon name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>

              {[
                { key: "upcoming", label: t("business.hub.upcoming"), rows: pickerGroups.upcoming, empty: t("business.hub.noUpcoming") },
                { key: "past", label: t("business.hub.past"), rows: pickerGroups.past, empty: t("business.hub.noPast") },
              ].map((section) => (
                <View key={section.key}>
                  <Text style={[styles.pickerSectionLabel, { color: colors.textTertiary }]}>{section.label}</Text>
                  {section.rows.length === 0 ? (
                    <Text style={[styles.pickerEmpty, { color: colors.textTertiary }]}>{section.empty}</Text>
                  ) : (
                    section.rows.map((ev) => {
                      const selected = isEventScoped && scopeEvent?.id === ev.id;
                      const typeLabel = ev.agendaType === "group_session" ? t("business.hub.typeClass")
                        : ev.agendaType === "private_session" ? t("business.hub.typeSession")
                          : t("business.hub.typeEvent");
                      const when = ev.date
                        ? new Date(ev.date).toLocaleString(i18n.language, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                        : "";
                      const venue = ev.location || ev.city || "";
                      return (
                        <TouchableOpacity
                          key={ev.id}
                          style={[styles.eventRow, { borderColor: selected ? colors.primary : colors.border }]}
                          onPress={() => { setEventScope({ id: ev.id, title: ev.title }); setPickerOpen(false); }}
                          activeOpacity={0.85}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={styles.eventRowTop}>
                              <View style={[styles.typeChip, { backgroundColor: colors.brandSoft }]}>
                                <Text style={[styles.typeChipText, { color: colors.primary }]}>{typeLabel}</Text>
                              </View>
                              <Text style={[styles.eventName, { flex: 1, color: colors.text }]} numberOfLines={1}>{ev.title}</Text>
                              {selected && <Icon name="check" size={18} color={colors.primary} />}
                            </View>
                            <Text style={[styles.eventMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                              {when}
                              {ev.attendees != null ? ` · ${t("business.hub.going", { count: ev.attendees })}` : ""}
                            </Text>
                            {!!venue && (
                              <Text style={[styles.eventMeta, { color: colors.textTertiary }]} numberOfLines={1}>{venue}</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10 },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    content: { paddingBottom: 40 },
    scopeTrack: { flexDirection: "row", borderWidth: 1, borderRadius: 14, padding: 4, gap: 4, marginHorizontal: 20, marginTop: 10 },
    scopeSeg: { flex: 1, height: 40, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
    scopeText: { fontSize: 13.5, fontWeight: "800" },
    scopeClear: { alignSelf: "flex-end", marginHorizontal: 20, marginTop: 6 },
    scopeClearText: { fontSize: 12.5, fontWeight: "700" },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    sheetTitle: { fontSize: 17, fontWeight: "800" },
    eventRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12, gap: 12 },
    eventRowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    eventName: { fontSize: 15, fontWeight: "700" },
    eventMeta: { fontSize: 12.5, marginTop: 3 },
    // BUG 35: picker search + grouping + type chip
    pickerSearch: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
    pickerSearchInput: { flex: 1, fontSize: 15, padding: 0 },
    wholeBizRow: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
    typeChip: { flexDirection: "row", alignItems: "center", justifyContent: "center", minWidth: 26, height: 22, paddingHorizontal: 8, borderRadius: 8 },
    typeChipText: { fontSize: 11, fontWeight: "800" },
    pickerSectionLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 16, marginBottom: 4 },
    pickerEmpty: { fontSize: 13, paddingVertical: 12 },
    scopeCard: { marginHorizontal: 20, marginTop: 10, borderWidth: 1, borderRadius: 16, padding: 16 },
    scopeName: { fontSize: 15, fontWeight: "800" },
    scopeStats: { flexDirection: "row", gap: 10, marginTop: 12 },
    scopeStat: { flex: 1, alignItems: "center" },
    scopeStatNum: { fontSize: 22, fontWeight: "800" },
    scopeStatLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
    scopeNote: { fontSize: 11, marginTop: 12, lineHeight: 15 },
    rangeRow: { paddingHorizontal: 20, gap: 8, paddingVertical: 8, alignItems: "center" },
    rangeChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16 },
    rangeText: { fontSize: 12.5, fontWeight: "700" },
    customRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
    loadingBox: { paddingVertical: 60, alignItems: "center" },
    kpiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 9, marginTop: 8 },
    kpiCard: { width: "47%", borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 13, flexGrow: 1 },
    kpiLabel: { fontFamily: FONTS.bodySemibold, fontSize: 10.5, letterSpacing: 0.2 },
    kpiValue: { fontFamily: FONTS.display, fontSize: 22, marginTop: 4, letterSpacing: -0.5 },
    kpiTrend: { fontFamily: FONTS.bodyBold, fontSize: 11, marginTop: 2 },
    kpiSub: { fontFamily: FONTS.bodyMedium, fontSize: 11, marginTop: 2 },
    needsDot: { position: "absolute", top: 9, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: "#E8A33D" },
    sectionLabel: { fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 22, marginBottom: 9, paddingHorizontal: 20 },
    chartCard: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, padding: 15 },
    xLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
    xLabel: { fontFamily: FONTS.bodyMedium, fontSize: 9.5, flex: 1, textAlign: "center" },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 9, height: 9, borderRadius: 5 },
    legendText: { fontFamily: FONTS.bodySemibold, fontSize: 11.5 },
    emptyChart: { fontFamily: FONTS.bodyMedium, fontSize: 13, textAlign: "center", paddingVertical: 30 },
    insightCard: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, padding: 15 },
    dayRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 96 },
    dayCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
    dayBarTrack: { width: "100%", height: 84, justifyContent: "flex-end", alignItems: "center" },
    dayBar: { width: "100%", borderRadius: 5, minHeight: 4 },
    dayLetter: { fontSize: 9.5 },
    insightNote: { fontFamily: FONTS.bodyMedium, fontSize: 12, marginTop: 12, lineHeight: 17 },
    mixRow: { marginBottom: 12 },
    mixTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    mixLabel: { fontFamily: FONTS.bodySemibold, fontSize: 13.5 },
    mixPct: { fontFamily: FONTS.display, fontSize: 13, letterSpacing: -0.2 },
    mixTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
    mixFill: { height: 7, borderRadius: 4 },
    flowRow: { flexDirection: "row", marginBottom: 4 },
    flowCell: { flex: 1, alignItems: "center", paddingVertical: 4 },
    flowNum: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.5 },
    flowLabel: { fontFamily: FONTS.bodySemibold, fontSize: 10.5, letterSpacing: 0.2, marginTop: 3 },
    retentionRow: { marginTop: 12 },
    aiCard: { marginHorizontal: 20, marginTop: 22, borderRadius: 16, padding: 16 },
    aiHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    aiEyebrow: { fontSize: 11.5, fontWeight: "700", color: "#fff" },
    aiNarrative: { fontSize: 13.5, color: "#e6ddf2", lineHeight: 20 },
    aiProjection: { fontSize: 12.5, color: "#C792EA", lineHeight: 18, marginTop: 10, fontWeight: "600" },
    aiRec: { flexDirection: "row", gap: 8, marginTop: 10 },
    aiRecDot: { color: "#C792EA", fontSize: 14, lineHeight: 18 },
    aiRecText: { flex: 1, fontSize: 12.5, color: "#e6ddf2", lineHeight: 18 },
    aiOff: { fontSize: 12, textAlign: "center", marginTop: 22, paddingHorizontal: 40, lineHeight: 17 },
  });
}
