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
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import useClaude from "../../hooks/useClaude";
import { computeDashboard, dashboardToCsv } from "../../services/businessAnalyticsService";
import { RANGE_IDS, DEFAULT_RANGE, rangeBounds, rangeLabelKey } from "../../constants/businessRanges";
import { formatCentavos } from "../../utils/pricing";

export default function BusinessDashboardScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE);
  const [customFrom, setCustomFrom] = useState(null);
  const [customTo, setCustomTo] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

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
  const maxBar = Math.max(1, ...(metrics?.series || []).map((s) => s.value));

  const kpis = metrics
    ? [
        { key: "active", value: metrics.activeInRange },
        { key: "attendance", value: metrics.attendanceCount, trend: metrics.attendanceTrend },
        { key: "newMembers", value: metrics.newMembers, trend: metrics.newTrend },
        { key: "prospects", value: metrics.prospects },
        { key: "atRisk", value: metrics.atRisk },
        { key: "churn", value: metrics.churn, estimate: true },
        { key: "recovered", value: metrics.recovered },
        { key: "revenue", value: metrics.revenueCents, trend: metrics.revenueTrend, money: true },
      ]
    : [];

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
        {/* Range selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeRow}>
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
            {/* KPI grid */}
            <View style={styles.kpiGrid}>
              {kpis.map((k) => (
                <View key={k.key} style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.kpiLabel, { color: colors.textTertiary }]}>
                    {t(`business.dashboard.kpi.${k.key}`)}
                    {k.estimate ? ` · ${t("business.dashboard.est")}` : ""}
                  </Text>
                  <Text style={[styles.kpiValue, { color: colors.text }]}>
                    {k.value == null ? "—" : k.money ? formatCentavos(k.value) : k.value}
                  </Text>
                  {typeof k.trend === "number" && (
                    <Text style={[styles.kpiTrend, { color: k.trend >= 0 ? colors.success : colors.error }]}>
                      {k.trend >= 0 ? "↑" : "↓"} {Math.abs(k.trend)}%
                    </Text>
                  )}
                </View>
              ))}
            </View>

            {/* Attendance chart */}
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.dashboard.attendanceTrend")}</Text>
            <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {metrics && metrics.attendanceCount > 0 ? (
                <View style={styles.chart}>
                  {metrics.series.map((s, i) => (
                    <View key={i} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { height: `${(s.value / maxBar) * 100}%`, backgroundColor: colors.primary }]} />
                      </View>
                      <Text style={[styles.barLabel, { color: colors.textTertiary }]}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.emptyChart, { color: colors.textTertiary }]}>{t("business.dashboard.noAttendance")}</Text>
              )}
            </View>

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
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10 },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    content: { paddingBottom: 40 },
    rangeRow: { paddingHorizontal: 20, gap: 8, paddingVertical: 8 },
    rangeChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16 },
    rangeText: { fontSize: 12.5, fontWeight: "700" },
    customRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
    loadingBox: { paddingVertical: 60, alignItems: "center" },
    kpiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10, marginTop: 8 },
    kpiCard: { width: "47%", borderWidth: 1, borderRadius: 14, padding: 13, flexGrow: 1 },
    kpiLabel: { fontSize: 11, fontWeight: "600" },
    kpiValue: { fontSize: 24, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
    kpiTrend: { fontSize: 11.5, fontWeight: "700", marginTop: 2 },
    kpiHint: { fontSize: 10, marginTop: 2 },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 22, marginBottom: 10, paddingHorizontal: 24 },
    chartCard: { marginHorizontal: 20, borderWidth: 1, borderRadius: 16, padding: 16 },
    chart: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 8 },
    barCol: { flex: 1, alignItems: "center", gap: 6 },
    barTrack: { width: "100%", height: 96, justifyContent: "flex-end", borderRadius: 6, overflow: "hidden", backgroundColor: "transparent" },
    barFill: { width: "100%", borderRadius: 6, minHeight: 3 },
    barLabel: { fontSize: 9.5 },
    emptyChart: { fontSize: 13, textAlign: "center", paddingVertical: 30 },
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
