/**
 * SectionHeader — mono-eyebrow section label (§3.6) with optional right action.
 * Used above every grouped section.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING } from "../constants/theme-tokens";

export default function SectionHeader({ title, action, onAction, style }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      <Text style={[TYPE.eyebrow, { color: colors.textTertiary }]}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} hitSlop={hit}>
          <Text style={[TYPE.label, { color: colors.primary }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const hit = { top: 8, bottom: 8, left: 8, right: 8 };

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.screen,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
});
