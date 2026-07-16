/**
 * The Big Five, ALWAYS all five dimensions (it iterates PERSONALITY_DIMENSIONS —
 * never a hand-picked subset, or the card would quietly show a partial
 * personality). Shared by the canonical editor and the read-only profile view.
 *
 * Scores are 0-100 from personalityScoring; numbers render in Space Grotesk per
 * the design system.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import { interpretBigFive } from "../../utils/personalityInterpret";

export default function BigFiveBars({ personality, compact = false }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const rows = interpretBigFive(personality);
  const s = createStyles(colors);

  return (
    <View style={compact ? null : s.wrap}>
      {rows.map((r) => (
        <View key={r.key} style={s.row}>
          <Text style={[s.label, { color: colors.textSecondary }]} numberOfLines={1}>
            {t(r.labelKey)}
          </Text>
          <View style={[s.track, { backgroundColor: colors.sunken }]}>
            <View style={[s.fill, { width: `${r.score}%` }]} />
          </View>
          <Text style={s.score}>{r.score}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { gap: 2 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    label: { flex: 0.42, fontFamily: FONTS.bodySemibold, fontSize: 12.5 },
    track: { flex: 0.48, height: 7, borderRadius: 4, overflow: "hidden" },
    fill: { height: 7, borderRadius: 4, backgroundColor: "#7C3AED" },
    // Numbers = Space Grotesk (design system).
    score: {
      flex: 0.1,
      textAlign: "right",
      fontFamily: FONTS.display,
      fontSize: 12.5,
      color: "#7C3AED",
      letterSpacing: -0.5,
    },
  });
}
