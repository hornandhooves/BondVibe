/**
 * GuestCodeCard — the guest-code → QR onboarding (kinlo_business/01 §2).
 * Shows the member's short code + QR the host can share (SMS/print/desk). The
 * member enters/scans it in Kinlo to link their account to THIS record and
 * unlock their QR check-in pass. Issuing codes = Pro (gated upstream).
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Share } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useTranslation } from "react-i18next";
import Icon from "../Icon";
import { useTheme } from "../../contexts/ThemeContext";

export default function GuestCodeCard({ code, businessName, redeemed, onRegenerate }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!code) return null;

  const share = async () => {
    try {
      await Share.share({
        message: t("business.guestCode.shareMessage", {
          business: businessName || t("business.hub.defaultName"),
          code,
        }),
      });
    } catch (e) {
      /* user cancelled */
    }
  };

  if (redeemed) {
    return (
      <View style={[styles.linkedCard, { backgroundColor: `${colors.success}18`, borderColor: `${colors.success}44` }]}>
        <Icon name="successCircle" size={18} color={colors.success} />
        <Text style={[styles.linkedText, { color: colors.success }]}>
          {t("business.guestCode.linked")}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.guestCode.title")}</Text>
      <View style={styles.qrWrap}>
        <QRCode value={code} size={132} />
      </View>
      <Text style={[styles.code, { color: colors.text }]}>{code}</Text>
      <Text style={[styles.hint, { color: colors.textTertiary }]}>{t("business.guestCode.hint")}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={share} activeOpacity={0.85}>
          <Icon name="forward" size={16} color="#fff" />
          <Text style={styles.btnText}>{t("business.guestCode.share")}</Text>
        </TouchableOpacity>
        {onRegenerate && (
          <TouchableOpacity style={[styles.btnGhost, { borderColor: colors.border }]} onPress={onRegenerate} activeOpacity={0.85}>
            <Text style={[styles.btnGhostText, { color: colors.textSecondary }]}>
              {t("business.guestCode.regenerate")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, alignItems: "center" },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", alignSelf: "flex-start" },
  qrWrap: { backgroundColor: "#fff", padding: 12, borderRadius: 12, marginTop: 12, marginBottom: 12 },
  code: { fontSize: 22, fontWeight: "800", letterSpacing: 1 },
  hint: { fontSize: 12, textAlign: "center", marginTop: 6, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14, alignSelf: "stretch" },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 22 },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  btnGhost: { flex: 1, alignItems: "center", justifyContent: "center", height: 44, borderRadius: 22, borderWidth: 1 },
  btnGhostText: { fontSize: 14, fontWeight: "700" },
  linkedCard: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 14, padding: 14 },
  linkedText: { fontSize: 13.5, fontWeight: "700" },
});
