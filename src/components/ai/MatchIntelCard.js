/**
 * MatchIntelCard — Match Intelligence (ai_features/15) on MatchPerson:
 * "Why you two click" grounded rationale + 3 AI icebreakers.
 * Taste: rationale free; icebreakers are Plus (stripped server-side).
 * Privacy: only runs between two opted-in match profiles (server-checked).
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Icon from "../Icon";
import AICard, { AIText } from "../AICard";
import AILoadingCard from "../AILoadingCard";
import ProBadge from "../ProBadge";
import { useTheme } from "../../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import useClaude from "../../hooks/useClaude";
import useAiOptIn from "../../hooks/useAiOptIn";
import { TYPE, SPACING, RADII, ELEVATION } from "../../constants/theme-tokens";

export default function MatchIntelCard({ eventId, otherUid, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { aiOptIn } = useAiOptIn();
  const { data, loading, fallback } = useClaude(
    "match_intel",
    { eventId, otherUid },
    {
      enabled: aiOptIn && !!eventId && !!otherUid,
      cacheKey: `match_intel:${eventId}:${otherUid}`, // cache per pair (§15)
      ttlMs: 6 * 60 * 60 * 1000,
    }
  );

  if (!aiOptIn || fallback || (!loading && !data)) return null;
  if (loading) return <AILoadingCard eyebrow={t("matchIntelCard.whyYouTwoClick")} style={styles.block} />;

  return (
    <View style={styles.block}>
      <AICard eyebrow={t("matchIntelCard.whyYouTwoClick")}>
        <AIText>{data.rationale}</AIText>
      </AICard>

      {data.icebreakersLocked ? (
        <TouchableOpacity
          style={[styles.lockedRow, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate("PlusPaywall", { from: "match_intel" })}
          activeOpacity={0.85}
        >
          <ProBadge tier="plus" size="sm" />
          <Text style={[TYPE.body, styles.lockedText, { color: colors.textSecondary }]}>
            {t("matchIntelCard.unlockIcebreakers")}
          </Text>
          <Icon name="forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      ) : (
        (data.icebreakers || []).length > 0 && (
          <View style={[styles.breakers, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[TYPE.eyebrow, { color: colors.textTertiary }]}>
              {t("matchIntelCard.icebreakersHeader")}
            </Text>
            {data.icebreakers.map((b) => (
              <View key={b} style={[styles.breakerRow, { backgroundColor: colors.sunken }]}>
                <Icon name="ai" size={14} color={colors.primary} />
                <Text selectable style={[TYPE.body, styles.breakerText, { color: colors.text }]}>
                  {b}
                </Text>
              </View>
            ))}
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACING.md, marginVertical: SPACING.md },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderRadius: RADII.card,
    borderWidth: 1,
    padding: SPACING.card,
  },
  lockedText: { flex: 1 },
  breakers: { borderRadius: RADII.card, borderWidth: 1, padding: SPACING.card, gap: SPACING.sm },
  breakerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    borderRadius: RADII.tile,
    padding: SPACING.md,
  },
  breakerText: { flex: 1 },
});
