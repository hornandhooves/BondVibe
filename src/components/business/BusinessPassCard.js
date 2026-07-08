/**
 * BusinessPassCard — the attendee's check-in pass for a business they've linked
 * to (via a redeemed guest code). Shows a QR the host scans to mark them present
 * and auto-deduct a credit. Used on the redeem-success and "my passes" views.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { buildBusinessPassPayload } from "../../services/businessPassService";

export default function BusinessPassCard({ pass }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!pass?.bizId || !pass?.memberId) return null;

  const pkg = pass.activePackage;
  let creditLine = null;
  if (pkg) {
    creditLine = t("business.credits.remaining", { remaining: pass.creditBalance || 0, total: pkg.creditsTotal || 0 });
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.biz, { color: colors.text }]} numberOfLines={1}>
        {pass.businessName || t("business.pass.defaultBusiness")}
      </Text>
      {!!pass.memberName && (
        <Text style={[styles.member, { color: colors.textTertiary }]} numberOfLines={1}>{pass.memberName}</Text>
      )}
      <View style={styles.qrWrap}>
        <QRCode value={buildBusinessPassPayload(pass.bizId, pass.memberId)} size={150} />
      </View>
      {creditLine && <Text style={[styles.credits, { color: colors.textSecondary }]}>{creditLine}</Text>}
      <Text style={[styles.hint, { color: colors.textTertiary }]}>{t("business.pass.hint")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 18, alignItems: "center" },
  biz: { fontSize: 17, fontWeight: "800" },
  member: { fontSize: 12.5, marginTop: 2 },
  qrWrap: { backgroundColor: "#fff", padding: 14, borderRadius: 14, marginTop: 14, marginBottom: 12 },
  credits: { fontSize: 13.5, fontWeight: "700", marginBottom: 6 },
  hint: { fontSize: 12, textAlign: "center", lineHeight: 17 },
});
