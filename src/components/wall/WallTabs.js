/**
 * Wall v2 tabs — Para ti · Siguiendo · Descubre (P0). Pixel spec (FIDELITY §5):
 * row gap 20, bottom border #ECE8F2; active = 800 ink + 2.5px underline in the
 * tab's accent (brand purple, or green on "Siguiendo"); inactive = 600 muted.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";

export default function WallTabs({ tabs, active, onChange }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {tabs.map((tab, i) => {
        const on = i === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.item}
            activeOpacity={0.7}
            onPress={() => onChange(i)}
            testID={`wall-tab-${tab.key}`}
          >
            <Text
              style={[
                styles.label,
                {
                  fontFamily: on ? FONTS.bodyExtra : FONTS.bodySemibold,
                  color: on ? colors.text : colors.textTertiary,
                },
              ]}
            >
              {tab.label}
            </Text>
            <View
              style={[
                styles.underline,
                { backgroundColor: on ? tab.accent || colors.primary : "transparent" },
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 20, paddingHorizontal: 18, paddingTop: 6, borderBottomWidth: 1 },
  item: { paddingBottom: 10, alignItems: "center" },
  label: { fontSize: 14.5 },
  underline: { height: 2.5, borderRadius: 2, alignSelf: "stretch", marginTop: 8, minWidth: 24 },
});
