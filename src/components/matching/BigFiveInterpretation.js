/**
 * "What this means" — the Big Five reading.
 *
 * A) DETERMINISTIC (always): one fixed phrase per (dimension × band). Same score
 *    → same text, forever. No model involved.
 * B) AI SUMMARY (optional): 1-2 sentences synthesizing all five, from the
 *    personality_summary feature, grounded in the real scores. If AI is off, the
 *    call falls back, or the quiz is incomplete → the summary simply DOESN'T
 *    RENDER. We never show an invented summary, and the deterministic reading
 *    below stands on its own.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS, AI } from "../../constants/theme-tokens";
import Icon from "../Icon";
import useClaude from "../../hooks/useClaude";
import useAiOptIn from "../../hooks/useAiOptIn";
import { interpretBigFive, isInterpretable } from "../../utils/personalityInterpret";

const SUMMARY_TTL_MS = 24 * 60 * 60 * 1000; // the scores rarely move

const BAND_COLOR = {
  high: { fg: "#7C3AED", bg: "#EDE4FC" },
  mid: { fg: "#4F5BD5", bg: "#E6EAFB" },
  low: { fg: "#5b6072", bg: "#F1F0F4" },
};

export default function BigFiveInterpretation({ personality }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { aiOptIn } = useAiOptIn();
  const complete = isInterpretable(personality);
  // Only ask the model when there's a real, complete profile to synthesize.
  const { data, fallback } = useClaude(
    "personality_summary",
    {},
    { enabled: aiOptIn && complete, cacheKey: "personality_summary", ttlMs: SUMMARY_TTL_MS }
  );
  const rows = interpretBigFive(personality).filter((r) => r.band);
  const s = createStyles(colors);
  if (rows.length === 0) return null;

  const summary = !fallback && data?.summary ? data.summary : null;

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[s.title, { color: colors.text }]}>{t("personalityQuiz.interpretTitle")}</Text>

      {/* B — AI synthesis. Absent (not faked) when unavailable. */}
      {summary ? (
        <View style={s.aiBlock}>
          <View style={s.aiHead}>
            <Icon name="ai" size={13} color={AI.accent} />
            <Text style={s.aiEyebrow}>{t("personalityQuiz.summaryEyebrow")}</Text>
          </View>
          <Text style={s.aiText}>{summary}</Text>
        </View>
      ) : null}

      {/* A — deterministic, per dimension. */}
      {rows.map((r) => {
        const c = BAND_COLOR[r.band];
        return (
          <View key={r.key} style={s.row}>
            <View style={s.rowHead}>
              <Text style={[s.dim, { color: colors.text }]}>{t(r.labelKey)}</Text>
              <View style={[s.band, { backgroundColor: c.bg }]}>
                <Text style={[s.bandText, { color: c.fg }]}>{t(r.bandLabelKey)}</Text>
              </View>
            </View>
            <Text style={[s.phrase, { color: colors.textSecondary }]}>{t(r.textKey)}</Text>
          </View>
        );
      })}

      <Text style={[s.note, { color: colors.textTertiary }]}>{t("personalityQuiz.interpretNote")}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    // Flat card: 1px border, no shadow (design system).
    card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 4 },
    title: { fontFamily: FONTS.display, fontSize: 16, marginBottom: 8 },
    aiBlock: { backgroundColor: AI.bg, borderRadius: 14, padding: 14, marginBottom: 14, gap: 6 },
    aiHead: { flexDirection: "row", alignItems: "center", gap: 6 },
    aiEyebrow: {
      fontFamily: FONTS.display, fontSize: 10, color: AI.accent,
      letterSpacing: 0.8, textTransform: "uppercase",
    },
    aiText: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, lineHeight: 20, color: AI.textOnDark },
    row: { marginBottom: 12 },
    rowHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
    dim: { fontFamily: FONTS.bodyBold, fontSize: 13.5 },
    band: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    bandText: { fontFamily: FONTS.bodyBold, fontSize: 10.5 },
    phrase: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, lineHeight: 18 },
    note: { fontFamily: FONTS.body, fontSize: 11, lineHeight: 15, marginTop: 4 },
  });
}
