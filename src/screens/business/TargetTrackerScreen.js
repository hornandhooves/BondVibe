/**
 * TargetTrackerScreen — Revenue Targets goal vs actual vs projection
 * (design_handoff_revenue_targets). Reads the goal doc + real payments, rolls up
 * by the selected period, and reads pace honestly: attainment = actual ÷ target,
 * on-pace = projection ÷ target, expected-today = target prorated to the day.
 * Projection is a 3-mo run-rate shown "(±)", never as an exact promise. Guards
 * divide-by-zero → "—".
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import GoalLineChart, { GOAL_CHART_COLORS } from "../../components/GoalLineChart";
import { useTheme } from "../../contexts/ThemeContext";
import { listPaymentsInRange } from "../../services/businessPaymentsService";
import { getGoal, computeTracker, fyStartDate, fiscalMonthDate, TRACKER_PERIODS } from "../../services/businessGoalsService";
import { formatCentavosCompact } from "../../utils/pricing";
import { FONTS } from "../../constants/theme-tokens";

const ATTAIN_GRADIENT = ["#0E3D33", "#155C4B"];
const POS = "#C3E88D";
const BEHIND = "#B45309";
const ON_TRACK = "#1F8A6E";
const CARD_BORDER = "#ECE8F2";

export default function TargetTrackerScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const [goal, setGoal] = useState(null);
  const [payments, setPayments] = useState([]);
  const [period, setPeriod] = useState("quarter");
  const [loading, setLoading] = useState(true);
  const now = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    const g = await getGoal();
    setGoal(g);
    if (g) {
      const s = fyStartDate(g.fyStartMonth || 0, now);
      const end = fiscalMonthDate(g.fyStartMonth || 0, 12, now);
      const pays = await listPaymentsInRange(s.toISOString(), end.toISOString());
      setPayments(pays);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const styles = createStyles(colors);
  const cardBorder = isDark ? colors.border : CARD_BORDER;

  const periodLabel = (p, position) => {
    const cur = position - 1;
    if (p === "month") return fiscalMonthDate(goal.fyStartMonth || 0, cur, now).toLocaleDateString(i18n.language, { month: "short" });
    if (p === "quarter") return t("business.goal.qN", { n: Math.floor(cur / 3) + 1 });
    if (p === "semester") return t("business.goal.hN", { n: Math.floor(cur / 6) + 1 });
    return t("business.goal.periodYear");
  };

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </GradientBackground>
    );
  }

  if (!goal) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={22} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.goal.trackerTitle")}</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("business.goal.emptyTitle")}</Text>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t("business.goal.emptyText")}</Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate("BusinessSetTarget")}>
            <Text style={styles.emptyBtnText}>{t("business.goal.setGoal")}</Text>
          </TouchableOpacity>
        </View>
      </GradientBackground>
    );
  }

  const tr = computeTracker(goal, payments, period, now);
  const attainPct = tr.attainment == null ? "—" : `${tr.attainment}%`;

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.goal.trackerTitle")}</Text>
        <TouchableOpacity onPress={() => navigation.navigate("BusinessSetTarget")}>
          <Icon name="edit" size={20} color="#4F5BD5" />
        </TouchableOpacity>
      </View>

      {/* Period toggle */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.periodRow}>
        {TRACKER_PERIODS.map((p) => {
          const active = period === p;
          return (
            <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={[styles.periodChip, active ? { backgroundColor: isDark ? colors.text : "#171523" } : { backgroundColor: colors.surface, borderColor: cardBorder, borderWidth: 1 }]}>
              <Text style={[active ? styles.periodActive : styles.periodInactive, { color: active ? (isDark ? colors.background : "#F5F3F9") : colors.textSecondary }]}>{t(`business.goal.period.${p}`)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Attainment card */}
        <View style={styles.attainShadow}>
          <LinearGradient colors={ATTAIN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.attainCard}>
            <Text style={styles.attainEyebrow}>{t("business.goal.attainmentEyebrow", { period: periodLabel(period, tr.position) })}</Text>
            <View style={styles.attainTop}>
              <Text style={styles.attainPct}>{attainPct}</Text>
              {tr.onPace != null && <Text style={styles.attainPace}>{t("business.goal.onPace", { n: tr.onPace })}</Text>}
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, tr.attainment || 0))}%` }]} />
              <View style={[styles.barTick, { left: `${Math.min(100, Math.max(0, tr.expectedPct))}%` }]} />
            </View>
            <View style={styles.attainFootRow}>
              <Text style={styles.attainFoot}>
                {t("business.goal.ofGoal", { actual: formatCentavosCompact(tr.actualCents), target: formatCentavosCompact(tr.targetCents) })}
              </Text>
              <Text style={styles.attainFoot}>{t("business.goal.expectedToday", { n: tr.expectedPct })}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Chart */}
        <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.goal.chartTitle")}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <GoalLineChart series={tr.chart} height={132} />
          <View style={styles.xLabels}>
            {tr.chart.map((c, i) => (
              <Text key={i} style={[styles.xLabel, { color: c.isToday ? ON_TRACK : "#a09bb0", fontFamily: c.isToday ? FONTS.bodyBold : FONTS.bodyMedium }]} numberOfLines={1}>
                {c.isToday ? t("business.goal.today") : new Date(2000, c.monthIndex, 1).toLocaleDateString(i18n.language, { month: "short" })}
              </Text>
            ))}
          </View>
          <View style={styles.legend}>
            {[
              { c: GOAL_CHART_COLORS.goal, k: "legendGoal", dashed: false },
              { c: GOAL_CHART_COLORS.actual, k: "legendActual", dashed: false },
              { c: GOAL_CHART_COLORS.actual, k: "legendProjection", dashed: true },
            ].map((l) => (
              <View key={l.k} style={styles.legendItem}>
                <View style={[styles.legendDash, { backgroundColor: l.dashed ? "transparent" : l.c, borderColor: l.c, borderWidth: l.dashed ? 1.5 : 0, borderStyle: l.dashed ? "dashed" : "solid" }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t(`business.goal.${l.k}`)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Roll-up rows */}
        <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.goal.rollupTitle")}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          {tr.rollup.map((r, i) => {
            const tone = r.ahead == null ? colors.textTertiary : r.ahead ? ON_TRACK : BEHIND;
            const projText =
              r.projectedCents == null
                ? "—"
                : r.period === "month"
                  ? t("business.goal.projAmount", { amount: formatCentavosCompact(r.projectedCents) })
                  : r.projPct == null
                    ? "—"
                    : t("business.goal.projPct", { n: r.projPct });
            return (
              <View key={r.period} style={[styles.rollRow, i > 0 && { borderTopColor: colors.divider || "#F0ECF6", borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rollLabel, { color: colors.text }]}>{t(`business.goal.rollup.${r.period}`, { month: periodLabel("month", tr.position) })}</Text>
                  <Text style={[styles.rollSub, { color: colors.textTertiary }]}>
                    {t("business.goal.ofGoalRow", { actual: formatCentavosCompact(r.actualCents), target: formatCentavosCompact(r.targetCents) })}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.rollPct, { color: tone }]}>{r.pct == null ? "—" : `${r.pct}%`}</Text>
                  <Text style={[styles.rollProj, { color: colors.textTertiary }]}>{projText}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text style={[styles.footnote, { color: colors.textTertiary }]}>{t("business.goal.footnote")}</Text>
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 60, paddingBottom: 8 },
    headerTitle: { fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.4 },
    periodRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10, alignItems: "center" },
    periodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
    periodActive: { fontFamily: FONTS.bodyBold, fontSize: 12 },
    periodInactive: { fontFamily: FONTS.bodySemibold, fontSize: 12 },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    attainShadow: { borderRadius: 18, shadowColor: "rgba(42,30,61,1)", shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
    attainCard: { borderRadius: 18, padding: 18 },
    attainEyebrow: { fontFamily: FONTS.bodySemibold, fontSize: 11.5, color: "#9FDCC7" },
    attainTop: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 4 },
    attainPct: { fontFamily: FONTS.display, fontSize: 30, letterSpacing: -1, color: "#fff" },
    attainPace: { fontFamily: FONTS.bodyBold, fontSize: 12, color: POS },
    barTrack: { height: 8, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.22)", marginTop: 14, overflow: "visible", justifyContent: "center" },
    barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 5, backgroundColor: POS },
    barTick: { position: "absolute", width: 2, height: 14, backgroundColor: "#fff", top: -3 },
    attainFootRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
    attainFoot: { fontFamily: FONTS.bodyMedium, fontSize: 10.5, color: "#9FDCC7" },
    eyebrow: { fontFamily: FONTS.bodyBold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 20, marginBottom: 9, paddingHorizontal: 4 },
    card: { borderWidth: 1, borderRadius: 16, padding: 15 },
    xLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
    xLabel: { fontSize: 9, flex: 1, textAlign: "center" },
    legend: { flexDirection: "row", gap: 14, marginTop: 12, flexWrap: "wrap" },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDash: { width: 16, height: 3, borderRadius: 2 },
    legendText: { fontFamily: FONTS.bodySemibold, fontSize: 10.5 },
    rollRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11 },
    rollLabel: { fontFamily: FONTS.bodyBold, fontSize: 13 },
    rollSub: { fontFamily: FONTS.bodyMedium, fontSize: 10.5, marginTop: 2 },
    rollPct: { fontFamily: FONTS.display, fontSize: 15, letterSpacing: -0.3 },
    rollProj: { fontFamily: FONTS.bodyMedium, fontSize: 9.5, marginTop: 2 },
    footnote: { fontFamily: FONTS.bodyMedium, fontSize: 11, textAlign: "center", marginTop: 18, paddingHorizontal: 20, lineHeight: 16 },
    empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
    emptyEmoji: { fontSize: 40, marginBottom: 12 },
    emptyTitle: { fontFamily: FONTS.bodyExtra, fontSize: 17, marginBottom: 8 },
    emptyText: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, textAlign: "center", lineHeight: 19, marginBottom: 20 },
    emptyBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
    emptyBtnText: { color: "#fff", fontFamily: FONTS.bodyExtra, fontSize: 15 },
  });
}
