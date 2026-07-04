/**
 * StatCard — metric tile (§3.6): caption title, display value (Space Grotesk),
 * optional delta in success/danger. Used in Analytics, Host dashboard, Profile.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII, ELEVATION } from "../constants/theme-tokens";

export default function StatCard({ title, value, delta, deltaPositive = true, style }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        ELEVATION.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[TYPE.caption, { color: colors.textTertiary }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[TYPE.display, styles.value, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      {delta ? (
        <Text
          style={[
            TYPE.caption,
            { color: deltaPositive ? colors.success : colors.error },
          ]}
        >
          {delta}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: RADII.card,
    borderWidth: 1,
    padding: SPACING.card,
    gap: 2,
  },
  value: { fontSize: 24, lineHeight: 30 },
});
