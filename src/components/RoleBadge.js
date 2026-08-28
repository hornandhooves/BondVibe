/**
 * RoleBadge — small role tag for managed-event surfaces (KIN-242). Marks a
 * card where the viewer manages the event but isn't its creator. Built as a
 * component (not an inline <Text>) so more roles/surfaces can reuse it later.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";

const LABEL_KEYS = {
  coHost: "manage.coHostTag",
  staff: "manage.staffTag",
};

export default function RoleBadge({ role = "coHost", style }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const labelKey = LABEL_KEYS[role];
  if (!labelKey) return null;
  return (
    <View style={[styles.pill, { backgroundColor: `${colors.secondary}1A` }, style]}>
      <Text style={[TYPE.caption, { color: colors.secondary }]}>{t(labelKey)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
});
