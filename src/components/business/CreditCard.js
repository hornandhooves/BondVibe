/**
 * CreditCard — a member's active package + credit balance with manual +/-
 * steppers (host adjusts by hand, kinlo_business/01 §3). When the member has no
 * package, invites the host to assign one.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../Icon";
import { useTheme } from "../../contexts/ThemeContext";
import { isPackageExpired } from "../../services/businessPackagesService";
import { formatDate } from "../../utils/formatDate";

export default function CreditCard({ member, onPlus, onMinus, onAssign }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const pkg = member?.activePackage;

  if (!pkg) {
    return (
      <TouchableOpacity
        style={[styles.assignCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
        onPress={onAssign}
        activeOpacity={0.85}
      >
        <View style={[styles.iconTile, { backgroundColor: colors.brandSoft }]}>
          <Icon name="ticket" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.assignText, { color: colors.primary }]}>{t("business.credits.assign")}</Text>
        <Icon name="forward" size={18} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  }

  const expired = isPackageExpired(pkg);
  const remaining = member.creditBalance || 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.top}>
        <View style={[styles.iconTile, { backgroundColor: colors.brandSoft }]}>
          <Icon name="ticket" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{pkg.name}</Text>
          <Text style={[styles.sub, { color: expired ? colors.error : colors.textTertiary }]}>
            {t("business.credits.remaining", { remaining, total: pkg.creditsTotal || 0 })}
            {pkg.expiresAt
              ? ` · ${
                  expired
                    ? t("business.credits.expired")
                    : t("business.credits.expires", { date: formatDate(pkg.expiresAt) })
                }`
              : ""}
          </Text>
        </View>
        <View style={styles.steppers}>
          <TouchableOpacity style={[styles.stepBtn, { backgroundColor: colors.surfaceGlass }]} onPress={onMinus}>
            <Text style={[styles.stepText, { color: colors.text }]}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.stepBtn, { backgroundColor: colors.primary }]} onPress={onPlus}>
            <Text style={[styles.stepText, { color: "#fff" }]}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity onPress={onAssign} style={styles.changeRow}>
        <Text style={[styles.changeText, { color: colors.textSecondary }]}>{t("business.credits.change")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "700" },
  sub: { fontSize: 11.5, marginTop: 2 },
  steppers: { flexDirection: "row", gap: 6 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 18, fontWeight: "700", lineHeight: 20 },
  changeRow: { marginTop: 10, alignSelf: "flex-start" },
  changeText: { fontSize: 12.5, fontWeight: "700" },
  assignCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  assignText: { flex: 1, fontSize: 14, fontWeight: "700" },
});
