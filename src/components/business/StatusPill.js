/**
 * StatusPill — member lifecycle status (active / at-risk / inactive).
 * All-vertical, i18n copy, theme colors only (no hardcoded palette).
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { MEMBER_STATUS } from "../../services/businessMembersService";

export default function StatusPill({ status, dotOnly = false, size = "md" }) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const meta = {
    [MEMBER_STATUS.ACTIVE]: { key: "business.status.active", color: colors.success },
    [MEMBER_STATUS.AT_RISK]: { key: "business.status.atRisk", color: colors.warning },
    [MEMBER_STATUS.INACTIVE]: { key: "business.status.inactive", color: colors.textTertiary },
  }[status] || { key: "business.status.active", color: colors.success };

  if (dotOnly) {
    return <View style={[styles.dot, { backgroundColor: meta.color }]} />;
  }

  const small = size === "sm";
  return (
    <View style={[styles.pill, small && styles.pillSm, { backgroundColor: `${meta.color}22` }]}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={[styles.label, small && styles.labelSm, { color: meta.color }]}>
        {t(meta.key)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  pillSm: { paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: "700" },
  labelSm: { fontSize: 10.5 },
});
