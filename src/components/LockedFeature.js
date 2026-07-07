/**
 * LockedFeature — dimmed placeholder for a gated feature (§3.6): centered
 * ProBadge, one-line value prop, CTA to the right paywall. Never a dead end.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import ProBadge from "./ProBadge";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII, ELEVATION } from "../constants/theme-tokens";

export default function LockedFeature({ tier = "pro", title, valueLine, onUnlock, style }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const label = tier === "plus" ? "Kinlo Plus" : "Kinlo Pro";
  return (
    <View
      style={[
        styles.card,
        ELEVATION.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      <ProBadge tier={tier} />
      {title ? (
        <Text style={[TYPE.title, { color: colors.text }]}>{title}</Text>
      ) : null}
      {valueLine ? (
        <Text style={[TYPE.body, styles.value, { color: colors.textSecondary }]}>
          {valueLine}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.cta, { backgroundColor: colors.primary }]}
        onPress={onUnlock}
        activeOpacity={0.85}
      >
        <Text style={[TYPE.label, styles.ctaText]}>{t("lockedFeature.unlockWith", { label })}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    padding: SPACING.xl,
    alignItems: "center",
    gap: SPACING.sm,
  },
  value: { textAlign: "center" },
  cta: {
    borderRadius: RADII.button,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  ctaText: { color: "#FFFFFF" },
});
