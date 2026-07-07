/**
 * BusinessFinanceScreen — Finance overview (kinlo_business/01 §6): revenue for a
 * range, breakdown by method, payment ledger with receipts, outstanding
 * balances, record a payment, and the payout (Stripe Connect) entry.
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
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import ListRow from "../../components/ListRow";
import { useTheme } from "../../contexts/ThemeContext";
import { getBusiness } from "../../services/businessService";
import {
  listPaymentsInRange,
  listOutstanding,
  revenueSummary,
  receiptText,
  PAYMENT_METHODS,
} from "../../services/businessPaymentsService";
import { RANGE_IDS, DEFAULT_RANGE, rangeBounds, rangeLabelKey } from "../../constants/businessRanges";
import { formatCentavos } from "../../utils/pricing";

export default function BusinessFinanceScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [rangeId, setRangeId] = useState(DEFAULT_RANGE);
  const [payments, setPayments] = useState([]);
  const [outstanding, setOutstanding] = useState([]);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  const bounds = rangeBounds(rangeId);

  const load = useCallback(async () => {
    setLoading(true);
    const [pays, owing, biz] = await Promise.all([
      listPaymentsInRange(bounds.from.toISOString(), bounds.to.toISOString()),
      listOutstanding(),
      getBusiness(),
    ]);
    setPayments(pays);
    setOutstanding(owing);
    setBusiness(biz);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const summary = revenueSummary(payments);
  const owedTotal = outstanding.reduce((s, m) => s + (m.balanceOwedCents || 0), 0);

  const onExport = async () => {
    const rows = [["date", "member", "amount", "method"], ...payments.map((p) => [
      new Date(p.date).toISOString().slice(0, 10),
      (p.memberName || "").replace(/,/g, " "),
      (p.amountCents / 100).toFixed(2),
      p.method,
    ])];
    try {
      await Share.share({ message: rows.map((r) => r.join(",")).join("\n") });
    } catch (e) {
      /* cancelled */
    }
  };

  const shareReceipt = async (p) => {
    try {
      await Share.share({ message: receiptText(p, business?.name, t(`business.payment.method.${p.method}`)) });
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
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.finance.title")}</Text>
        <TouchableOpacity onPress={onExport}>
          <Icon name="share" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeRow}>
        {RANGE_IDS.filter((r) => r !== "custom").map((id) => {
          const active = rangeId === id;
          return (
            <TouchableOpacity key={id} onPress={() => setRangeId(id)} style={[styles.rangeChip, { backgroundColor: active ? colors.text : colors.surfaceGlass }]}>
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
          {/* Total received */}
          <View style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.textTertiary }]}>{t("business.finance.totalReceived")}</Text>
            <Text style={[styles.totalValue, { color: colors.text }]}>{formatCentavos(summary.total)}</Text>
            <Text style={[styles.totalSub, { color: colors.textTertiary }]}>{t("business.finance.paymentsCount", { count: payments.length })}</Text>
          </View>

          {/* By method */}
          {summary.total > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.finance.byMethod")}</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {PAYMENT_METHODS.filter((m) => summary.byMethod[m]).map((m, i) => (
                  <View key={m} style={[styles.methodRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.methodName, { color: colors.text }]}>{t(`business.payment.method.${m}`)}</Text>
                    <Text style={[styles.methodAmount, { color: colors.text }]}>{formatCentavos(summary.byMethod[m])}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Outstanding */}
          {owedTotal > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.finance.outstanding")}</Text>
              <View style={[styles.card, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}44` }]}>
                <View style={styles.methodRow}>
                  <Text style={[styles.methodName, { color: colors.text }]}>
                    {t("business.finance.owedBy", { count: outstanding.length })}
                  </Text>
                  <Text style={[styles.methodAmount, { color: colors.warning }]}>{formatCentavos(owedTotal)}</Text>
                </View>
                {outstanding.slice(0, 4).map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.owedRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
                    onPress={() => navigation.navigate("BusinessMemberRecord", { memberId: m.id })}
                  >
                    <Text style={[styles.owedName, { color: colors.textSecondary }]} numberOfLines={1}>{m.name}</Text>
                    <Text style={[styles.owedAmt, { color: colors.textSecondary }]}>{formatCentavos(m.balanceOwedCents)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Payments ledger */}
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.finance.payments")}</Text>
          {payments.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t("business.finance.noPayments")}</Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {payments.slice(0, 20).map((p, i) => (
                <TouchableOpacity key={p.id} style={[styles.payRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]} onPress={() => shareReceipt(p)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.payMember, { color: colors.text }]} numberOfLines={1}>
                      {p.memberName || t("business.payment.walkIn")}
                    </Text>
                    <Text style={[styles.payMeta, { color: colors.textTertiary }]}>
                      {t(`business.payment.method.${p.method}`)} · {new Date(p.date).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[styles.payAmount, { color: colors.success }]}>{formatCentavos(p.amountCents)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Payouts */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 22 }]}>
            <ListRow
              icon="payment"
              title={t("business.finance.payouts")}
              subtitle={t("business.finance.payoutsSub")}
              onPress={() => navigation.navigate("StripeConnect")}
              divider={false}
            />
          </View>
        </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.recordBtn, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate("BusinessPaymentForm", {})}>
          <Icon name="add" size={18} color="#fff" />
          <Text style={styles.recordText}>{t("business.finance.record")}</Text>
        </TouchableOpacity>
      </View>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10 },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    rangeRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 10 },
    rangeChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16 },
    rangeText: { fontSize: 12.5, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    totalCard: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: "center" },
    totalLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
    totalValue: { fontSize: 34, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 },
    totalSub: { fontSize: 12.5, marginTop: 4 },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 22, marginBottom: 10, paddingHorizontal: 4 },
    card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, overflow: "hidden" },
    methodRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 13 },
    methodName: { fontSize: 14, fontWeight: "600" },
    methodAmount: { fontSize: 14, fontWeight: "800" },
    owedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
    owedName: { fontSize: 13, flex: 1 },
    owedAmt: { fontSize: 13, fontWeight: "700" },
    payRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
    payMember: { fontSize: 14, fontWeight: "700" },
    payMeta: { fontSize: 12, marginTop: 2 },
    payAmount: { fontSize: 15, fontWeight: "800" },
    emptyCard: { borderWidth: 1, borderRadius: 14, padding: 16, alignItems: "center" },
    emptyText: { fontSize: 13, textAlign: "center" },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    recordBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 27 },
    recordText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
