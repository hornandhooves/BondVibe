/**
 * Reusable star rating row. Renders Math.round(rating) filled stars and,
 * when showEmpty is true, outline stars up to 5. Fill color defaults to the
 * theme's warning token (gold); override via the `color` prop.
 */
import React from "react";
import { View, StyleSheet } from "react-native";
import Icon from "./Icon";
import { useTheme } from "../contexts/ThemeContext";

export default function StarRow({ rating = 0, size = 14, showEmpty = true, color, style }) {
  const { colors } = useTheme();
  const fillColor = color || colors.warning;
  const filled = Math.max(0, Math.min(5, Math.round(rating || 0)));
  const total = showEmpty ? 5 : filled;

  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: total }, (_, i) => {
        const isFilled = i < filled;
        return (
          <Icon
            key={i}
            name="star"
            size={size}
            color={isFilled ? fillColor : colors.border}
            fill={isFilled ? fillColor : "none"}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
});
