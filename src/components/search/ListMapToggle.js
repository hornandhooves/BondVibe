/**
 * List | Map segmented toggle for the Search header (F1). Compact pills that
 * match the app's chip style; the active pill uses the brand color. Default = List.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";

export default function ListMapToggle({ value, onChange }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);

  const options = [
    { key: "list", label: t("searchEvents.viewList") },
    { key: "map", label: t("searchEvents.viewMap") },
  ];

  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            activeOpacity={0.85}
            style={[styles.pill, active && { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            testID={`search-view-${o.key}`}
          >
            <Text
              style={[
                styles.pillText,
                { color: active ? colors.onPrimary : colors.textSecondary, fontWeight: active ? "800" : "700" },
              ]}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    track: {
      flexDirection: "row",
      borderRadius: 11,
      borderWidth: 1,
      padding: 3,
      gap: 3,
    },
    pill: {
      paddingHorizontal: 13,
      paddingVertical: 6,
      borderRadius: 8,
    },
    pillText: { fontSize: 12.5, letterSpacing: -0.1 },
  });
}
