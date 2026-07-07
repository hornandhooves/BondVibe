/**
 * Shared subscription checkout UI for E2 (Kinlo Pro) and E3 (Kinlo Plus).
 * Payment runs through Stripe's hosted Checkout, matching the existing Pro flow.
 */
import React from "react";
import Icon from "../../components/Icon";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { MatchHeader, PrimaryButton } from "./matchUi";

export default function SubscriptionCheckoutView({
  title,
  planName,
  amount,
  currency,
  interval,
  note,
  loading,
  onSubscribe,
  onBack,
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={title} onBack={onBack} />
      <View style={styles.content}>
        <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.plan, { color: colors.text }]}>{planName}</Text>
            <Text style={[styles.amount, { color: colors.text }]}>
              ${amount} {currency}
            </Text>
          </View>
          <Text style={[styles.interval, { color: colors.textSecondary }]}>
            {t("matching.checkout.billedEvery", { interval })}
          </Text>
          {!!note && <Text style={[styles.note, { color: colors.textSecondary }]}>{note}</Text>}

          {/* Stripe card visual */}
          <View style={styles.cardRow}>
            <View style={styles.stripeCard}>
              <Text style={styles.stripeDigits}>•••• 4242</Text>
            </View>
            <Text style={[styles.viaStripe, { color: colors.textSecondary }]}>{t("matching.checkout.viaStripe")}</Text>
          </View>
        </View>

        <View style={styles.secure}>
          <Icon name="lock" size={14} color={colors.textTertiary} />
          <Text style={[styles.secureText, { color: colors.textTertiary }]}>
            {t("matching.checkout.securePayment")}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={t("matching.checkout.subscribe", { amount, interval })}
          onPress={onSubscribe}
          loading={loading}
        />
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
    summary: { borderWidth: 1, borderRadius: 20, padding: 20 },
    rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    plan: { fontSize: 18, fontWeight: "800" },
    amount: { fontSize: 18, fontWeight: "800" },
    interval: { fontSize: 13.5, marginTop: 6 },
    note: { fontSize: 13.5, marginTop: 12, lineHeight: 19 },
    cardRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },
    stripeCard: {
      width: 64,
      height: 42,
      borderRadius: 8,
      backgroundColor: "#1a1f36",
      alignItems: "center",
      justifyContent: "center",
    },
    stripeDigits: { color: "#fff", fontSize: 11, fontWeight: "700" },
    viaStripe: { fontSize: 13 },
    secure: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 24 },
    secureText: { fontSize: 12.5 },
    footer: { paddingHorizontal: 24, paddingBottom: 28 },
  });
}
