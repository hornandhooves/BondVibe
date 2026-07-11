/**
 * BusinessExpensesScreen — Expenses & P&L (dashboard handoff §8). The missing
 * half of Finance: expense categories + receipt photos + a real net profit /
 * margin over a range, with CSV export. Reuses businessRanges, formatCentavos,
 * revenueSummary and the Finance Share/CSV pattern. Net margin also flows into
 * the Dashboard KPIs (see computeDashboard).
 */
import React, { useState, useCallback } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import {
  listPaymentsInRange,
  revenueSummary,
} from "../../services/businessPaymentsService";
import {
  listExpensesInRange,
  expenseSummary,
  profitLoss,
  EXPENSE_CATEGORIES,
} from "../../services/businessExpensesService";
import { RANGE_IDS, DEFAULT_RANGE, rangeBounds, rangeLabelKey } from "../../constants/businessRanges";
import { formatCentavos } from "../../utils/pricing";
import { FONTS } from "../../constants/theme-tokens";

const PL_GRADIENT = ["#0E3D33", "#155C4B"]; // P&L summary card (135°)
const PL_POSITIVE = "#C3E88D"; // AI-positive accent for a healthy margin

export default function BusinessExpensesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const bounds = rangeBounds(rangeId);

  const load = useCallback(async () => {
    setLoading(true);
    const [pays, exps] = await Promise.all([
      listPaymentsInRange(bounds.from.toISOString(), bounds.to.toISOString()),
      listExpensesInRange(bounds.from.toISOString(), bounds.to.toISOString()),
    ]);
    setPayments(pays);
    setExpenses(exps);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const revenue = revenueSummary(payments).total;
  const exp = expenseSummary(expenses);
  const pl = profitLoss(revenue, exp.total);
  const maxCat = Math.max(1, ...Object.values(exp.byCategory));

  const onExport = async () => {
    const rows = [
      ["metric", "value"],
      ["range", t(rangeLabelKey(rangeId))],
      ["revenue", (revenue / 100).toFixed(2)],
      ["expenses", (exp.total / 100).toFixed(2)],
      ["net_profit", (pl.net / 100).toFixed(2)],
      ["margin_pct", pl.marginPct ?? ""],
      [],
      ["date", "category", "amount", "method"],
      ...expenses.map((x) => [
        new Date(x.date).toISOString().slice(0, 10),
        x.category,
        (x.amountCents / 100).toFixed(2),
        x.method,
      ]),
    ];
    try {
      await Share.share({ message: rows.map((r) => r.join(",")).join("\n") });
    } catch (e) {
      /* cancelled */
    }
  };

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.expense.plTitle")}</Text>
        <TouchableOpacity onPress={onExport}>
          <Icon name="share" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.rangeRow}>
        {RANGE_IDS.filter((r) => r !== "custom").map((id) => {
          const active = rangeId === id;
          return (
            <TouchableOpacity key={id} onPress={() => setRangeId(id)} style={[styles.rangeChip, { backgroundColor: active ? colors.text : colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.rangeText, { color: active ? colors.background : colors.textSecondary }]}>{t(rangeLabelKey(id))}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* P&L summary — real gradient card + soft dark shadow */}
          <View style={styles.plShadow}>
            <LinearGradient colors={PL_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plCard}>
              <View style={styles.plTopRow}>
                <View style={styles.plCol}>
                  <Text style={styles.plColLabel}>{t("business.expense.revenue")}</Text>
                  <Text style={styles.plColValue}>{formatCentavos(revenue)}</Text>
                </View>
                <View style={styles.plCol}>
                  <Text style={styles.plColLabel}>{t("business.expense.expensesLabel")}</Text>
                  <Text style={styles.plColValue}>−{formatCentavos(exp.total)}</Text>
                </View>
              </View>
              <View style={styles.plDivider} />
              <Text style={styles.plNetLabel}>{t("business.expense.netProfit")}</Text>
              <Text style={[styles.plNetValue, { color: pl.net >= 0 ? PL_POSITIVE : "#F8B4A0" }]}>
                {pl.net < 0 ? "−" : ""}{formatCentavos(Math.abs(pl.net))}
              </Text>
              {pl.marginPct != null && (
                <Text style={styles.plMargin}>{t("business.expense.margin", { pct: pl.marginPct })}</Text>
              )}
            </LinearGradient>
          </View>

          {/* By category */}
          {exp.total > 0 && (
            <>
              <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.expense.byCategory")}</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {EXPENSE_CATEGORIES.filter((c) => exp.byCategory[c]).map((c, i) => (
                  <View key={c} style={[styles.catRow, i > 0 && { marginTop: 14 }]}>
                    <View style={styles.catTop}>
                      <Text style={[styles.catName, { color: colors.text }]}>{t(`business.expense.category.${c}`)}</Text>
                      <Text style={[styles.catAmount, { color: colors.text }]}>{formatCentavos(exp.byCategory[c])}</Text>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: `${colors.primary}18` }]}>
                      <View style={[styles.barFill, { width: `${Math.round((exp.byCategory[c] / maxCat) * 100)}%`, backgroundColor: colors.primary }]} />
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Ledger */}
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.expense.ledger")}</Text>
          {expenses.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t("business.expense.noExpenses")}</Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {expenses.slice(0, 30).map((x, i) => (
                <View key={x.id} style={[styles.expRow, i > 0 && { borderTopColor: colors.divider || "#F0ECF6", borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={[styles.expIcon, { backgroundColor: `${colors.primary}12` }]}>
                    <Icon name="wallet" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.expCat, { color: colors.text }]}>{t(`business.expense.category.${x.category}`)}</Text>
                    <Text style={[styles.expMeta, { color: colors.textTertiary }]}>
                      {t(`business.payment.method.${x.method}`)} · {new Date(x.date).toLocaleDateString()}
                      {x.receiptUrl ? " · 📎" : ""}
                    </Text>
                  </View>
                  <Text style={[styles.expAmount, { color: colors.text }]}>−{formatCentavos(x.amountCents)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate("BusinessExpenseForm")} activeOpacity={0.9}>
          <Icon name="add" size={18} color="#fff" />
          <Text style={styles.addText}>{t("business.expense.add")}</Text>
        </TouchableOpacity>
      </View>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 60, paddingBottom: 8 },
    headerTitle: { fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.4 },
    rangeRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10, alignItems: "center" },
    rangeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, borderWidth: 1 },
    rangeText: { fontFamily: FONTS.bodyBold, fontSize: 12 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    // P&L card
    plShadow: {
      borderRadius: 18,
      shadowColor: "rgba(42,30,61,1)",
      shadowOpacity: 0.35,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 14 },
      elevation: 8,
    },
    plCard: { borderRadius: 18, padding: 18 },
    plTopRow: { flexDirection: "row", gap: 16 },
    plCol: { flex: 1 },
    plColLabel: { fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.65)" },
    plColValue: { fontFamily: FONTS.display, fontSize: 18, color: "#fff", marginTop: 4, letterSpacing: -0.3 },
    plDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.18)", marginVertical: 14 },
    plNetLabel: { fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.65)" },
    plNetValue: { fontFamily: FONTS.display, fontSize: 34, marginTop: 4, letterSpacing: -1 },
    plMargin: { fontFamily: FONTS.bodySemibold, fontSize: 12.5, color: "rgba(255,255,255,0.8)", marginTop: 4 },
    // eyebrow + cards
    eyebrow: { fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 22, marginBottom: 9, paddingHorizontal: 4 },
    card: { borderWidth: 1, borderRadius: 16, padding: 15 },
    catRow: {},
    catTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
    catName: { fontFamily: FONTS.bodySemibold, fontSize: 13.5 },
    catAmount: { fontFamily: FONTS.display, fontSize: 13.5, letterSpacing: -0.2 },
    barTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
    barFill: { height: 7, borderRadius: 4 },
    expRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11 },
    expIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    expCat: { fontFamily: FONTS.bodySemibold, fontSize: 14 },
    expMeta: { fontFamily: FONTS.bodyMedium, fontSize: 11.5, marginTop: 2 },
    expAmount: { fontFamily: FONTS.display, fontSize: 14, letterSpacing: -0.2 },
    emptyCard: { borderWidth: 1, borderRadius: 16, padding: 16, alignItems: "center" },
    emptyText: { fontFamily: FONTS.bodyMedium, fontSize: 13, textAlign: "center" },
    footer: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 6 },
    addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 27 },
    addText: { color: "#fff", fontFamily: FONTS.bodyExtra, fontSize: 16 },
  });
}
