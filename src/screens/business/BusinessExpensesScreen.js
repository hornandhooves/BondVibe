/**
 * BusinessExpensesScreen — Expenses & P&L (dashboard handoff §8). The missing
 * half of Finance: a real net profit / margin over a range, with an Income |
 * Expenses toggle (income by method · expenses by category + ledger) under a
 * single fixed P&L card. Reuses businessRanges, revenueSummary, expenseSummary
 * and the Finance Share/CSV pattern. Net margin also flows into the Dashboard.
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
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import {
  listPaymentsInRange,
  revenueSummary,
  PAYMENT_METHODS,
} from "../../services/businessPaymentsService";
import {
  listExpensesInRange,
  expenseSummary,
  profitLoss,
  EXPENSE_CATEGORIES,
} from "../../services/businessExpensesService";
import { RANGE_IDS, DEFAULT_RANGE, rangeBounds, rangeLabelKey } from "../../constants/businessRanges";
import { formatCentavos, formatCentavosCompact } from "../../utils/pricing";
import { FONTS } from "../../constants/theme-tokens";
import { formatDate } from "../../utils/formatDate";

const PL_GRADIENT = ["#0E3D33", "#155C4B"]; // P&L summary card (135°)
const PL_EYEBROW = "#9FDCC7";
const PL_POSITIVE = "#C3E88D";
const PL_LOSS = "#F8B4A0";

export default function BusinessExpensesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE);
  const [customFrom, setCustomFrom] = useState(null);
  const [customTo, setCustomTo] = useState(null);
  const [tab, setTab] = useState("income"); // income | expenses
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Compute bounds fresh at load time (not memoized to mount) so the "to = now"
  // upper bound advances — otherwise a just-added expense dated after mount is
  // filtered out until the screen is remounted. Re-runs on focus + range change.
  const load = useCallback(async () => {
    const b = rangeBounds(rangeId, { from: customFrom, to: customTo });
    setLoading(true);
    const [pays, exps] = await Promise.all([
      listPaymentsInRange(b.from.toISOString(), b.to.toISOString()),
      listExpensesInRange(b.from.toISOString(), b.to.toISOString()),
    ]);
    setPayments(pays);
    setExpenses(exps);
    setLoading(false);
  }, [rangeId, customFrom, customTo]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const rev = revenueSummary(payments);
  const exp = expenseSummary(expenses);
  const pl = profitLoss(rev.total, exp.total);
  const maxCat = Math.max(1, ...Object.values(exp.byCategory));
  const periodLabel = t(rangeLabelKey(rangeId));

  const onExport = async () => {
    const rows = [
      ["metric", "value"],
      ["range", periodLabel],
      ["income", (rev.total / 100).toFixed(2)],
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
  const cardBorder = isDark ? colors.border : "#ECE8F2";

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

      {/* Period selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.rangeRow}>
        {RANGE_IDS.filter((r) => r !== "total").map((id) => {
          const active = rangeId === id;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => setRangeId(id)}
              style={[
                styles.rangeChip,
                active
                  ? { backgroundColor: isDark ? colors.text : "#171523" }
                  : { backgroundColor: colors.surface, borderColor: cardBorder, borderWidth: 1 },
              ]}
            >
              <Text style={[active ? styles.rangeTextActive : styles.rangeTextInactive, { color: active ? (isDark ? colors.background : "#F5F3F9") : colors.textSecondary }]}>
                {t(rangeLabelKey(id))}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {rangeId === "custom" && (
        <View style={styles.customRow}>
          <View style={{ flex: 1 }}>
            <DateField label={t("business.expense.from")} value={customFrom} onChange={setCustomFrom} onClear={() => setCustomFrom(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label={t("business.expense.to")} value={customTo} onChange={setCustomTo} onClear={() => setCustomTo(null)} minimumDate={customFrom || undefined} />
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* P&L summary — Net profit is the hero at the top; 3 sub-metrics below. */}
          <View style={styles.plShadow}>
            <LinearGradient colors={PL_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plCard}>
              <Text style={styles.plEyebrow}>{t("business.expense.netEyebrow", { period: periodLabel })}</Text>
              <Text style={[styles.plNet, { color: pl.net >= 0 ? PL_POSITIVE : PL_LOSS }]}>
                {pl.net < 0 ? "−" : ""}{formatCentavosCompact(Math.abs(pl.net))}
              </Text>
              <View style={styles.plSubRow}>
                {[
                  { label: t("business.expense.income"), value: formatCentavosCompact(rev.total), tone: "#fff" },
                  { label: t("business.expense.expensesLabel"), value: `−${formatCentavosCompact(exp.total)}`, tone: "#fff" },
                  { label: t("business.expense.marginLabel"), value: pl.marginPct == null ? "—" : `${pl.marginPct}%`, tone: pl.marginPct != null && pl.marginPct < 0 ? PL_LOSS : PL_POSITIVE },
                ].map((s) => (
                  <View key={s.label} style={styles.plSubCol}>
                    <Text style={styles.plSubLabel}>{s.label}</Text>
                    <Text style={[styles.plSubValue, { color: s.tone }]}>{s.value}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
          </View>

          {/* Income | Expenses toggle */}
          <View style={styles.toggleTrack}>
            {[
              { id: "income", label: t("business.expense.income") },
              { id: "expenses", label: t("business.expense.expensesLabel") },
            ].map((seg) => {
              const active = tab === seg.id;
              return (
                <TouchableOpacity key={seg.id} style={[styles.toggleSeg, active && { backgroundColor: colors.success }]} onPress={() => setTab(seg.id)} activeOpacity={0.85}>
                  <Text style={[active ? styles.toggleTextActive : styles.toggleTextInactive, { color: active ? "#fff" : colors.textSecondary }]}>{seg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {tab === "income" ? (
            /* INCOME — by method */
            rev.total > 0 ? (
              <>
                <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.expense.byMethod")}</Text>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                  {PAYMENT_METHODS.filter((m) => rev.byMethod[m]).map((m, i) => (
                    <View key={m} style={[styles.methodRow, i > 0 && { borderTopColor: colors.divider || "#F0ECF6", borderTopWidth: StyleSheet.hairlineWidth }]}>
                      <Text style={[styles.methodName, { color: colors.text }]}>{t(`business.payment.method.${m}`)}</Text>
                      <Text style={[styles.methodAmount, { color: colors.text }]}>{formatCentavos(rev.byMethod[m])}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t("business.expense.noIncome")}</Text>
              </View>
            )
          ) : (
            /* EXPENSES — by category + ledger */
            <>
              {exp.total > 0 && (
                <>
                  <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.expense.byCategory")}</Text>
                  <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                    {EXPENSE_CATEGORIES.filter((c) => exp.byCategory[c]).map((c, i) => (
                      <View key={c} style={[i > 0 && { marginTop: 14 }]}>
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

              <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.expense.ledger")}</Text>
              {expenses.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                  <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t("business.expense.noExpenses")}</Text>
                </View>
              ) : (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                  {expenses.slice(0, 30).map((x, i) => (
                    <View key={x.id} style={[styles.expRow, i > 0 && { borderTopColor: colors.divider || "#F0ECF6", borderTopWidth: StyleSheet.hairlineWidth }]}>
                      <View style={[styles.expIcon, { backgroundColor: `${colors.primary}12` }]}>
                        <Icon name="wallet" size={16} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.expCat, { color: colors.text }]}>{t(`business.expense.category.${x.category}`)}</Text>
                        <Text style={[styles.expMeta, { color: colors.textTertiary }]}>
                          {t(`business.payment.method.${x.method}`)} · {formatDate(x.date)}
                          {x.receiptUrl ? " · 📎" : ""}
                        </Text>
                      </View>
                      <Text style={[styles.expAmount, { color: colors.text }]}>−{formatCentavos(x.amountCents)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
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
    rangeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
    rangeTextActive: { fontFamily: FONTS.bodyBold, fontSize: 12 },
    rangeTextInactive: { fontFamily: FONTS.bodySemibold, fontSize: 12 },
    customRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    // P&L card — Net profit hero first
    plShadow: {
      borderRadius: 18,
      shadowColor: "rgba(42,30,61,1)",
      shadowOpacity: 0.35,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 14 },
      elevation: 8,
    },
    plCard: { borderRadius: 18, padding: 20 },
    plEyebrow: { fontFamily: FONTS.bodySemibold, fontSize: 11.5, letterSpacing: 0.3, color: PL_EYEBROW },
    plNet: { fontFamily: FONTS.display, fontSize: 32, letterSpacing: -1, marginTop: 6 },
    plSubRow: { flexDirection: "row", marginTop: 16, gap: 12 },
    plSubCol: { flex: 1 },
    plSubLabel: { fontFamily: FONTS.bodySemibold, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", color: PL_EYEBROW },
    plSubValue: { fontFamily: FONTS.display, fontSize: 16, letterSpacing: -0.3, marginTop: 4 },
    // toggle
    toggleTrack: { flexDirection: "row", backgroundColor: "#E7E3F0", borderRadius: 12, padding: 3, marginTop: 16 },
    toggleSeg: { flex: 1, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    toggleTextActive: { fontFamily: FONTS.bodyExtra, fontSize: 13.5 },
    toggleTextInactive: { fontFamily: FONTS.bodyBold, fontSize: 13.5 },
    // sections
    eyebrow: { fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 20, marginBottom: 9, paddingHorizontal: 4 },
    card: { borderWidth: 1, borderRadius: 16, padding: 15 },
    methodRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
    methodName: { fontFamily: FONTS.bodySemibold, fontSize: 14 },
    methodAmount: { fontFamily: FONTS.display, fontSize: 14, letterSpacing: -0.2 },
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
    emptyCard: { borderWidth: 1, borderRadius: 16, padding: 16, alignItems: "center", marginTop: 9 },
    emptyText: { fontFamily: FONTS.bodyMedium, fontSize: 13, textAlign: "center" },
    footer: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 6 },
    addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 27 },
    addText: { color: "#fff", fontFamily: FONTS.bodyExtra, fontSize: 16 },
  });
}
