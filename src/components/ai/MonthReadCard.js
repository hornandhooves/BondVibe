/**
 * MonthReadCard — AI Analytics (ai_features/16A) atop HostAnalytics:
 * "Kinlo AI read your month" narrative + "What to do next" recommendations.
 * Freemium taste: non-Pro gets the narrative (headline) — recommendations
 * are stripped server-side and shown as a locked affordance.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Icon from "../Icon";
import AICard, { AIText } from "../AICard";
import AILoadingCard from "../AILoadingCard";
import ProBadge from "../ProBadge";
import { useTheme } from "../../contexts/ThemeContext";
import useClaude from "../../hooks/useClaude";
import useAiOptIn from "../../hooks/useAiOptIn";
import { TYPE, SPACING, RADII, ELEVATION } from "../../constants/theme-tokens";

export default function MonthReadCard({ navigation }) {
  const { colors } = useTheme();
  const { aiOptIn } = useAiOptIn();
  const { data, loading, fallback } = useClaude(
    "ai_analytics",
    {},
    { enabled: aiOptIn, cacheKey: "ai_analytics", ttlMs: 60 * 60 * 1000 }
  );

  if (!aiOptIn) return null;
  if (loading) return <AILoadingCard eyebrow="Kinlo AI read your month" style={styles.block} />;
  if (fallback || !data) return null;

  return (
    <View style={styles.block}>
      <AICard eyebrow="Kinlo AI read your month">
        <AIText>{data.narrative}</AIText>
      </AICard>

      {data.locked ? (
        <TouchableOpacity
          style={[styles.lockedRow, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate("ProUpsell", { from: "ai_analytics" })}
          activeOpacity={0.85}
        >
          <ProBadge tier="pro" size="sm" />
          <Text style={[TYPE.body, styles.lockedText, { color: colors.textSecondary }]}>
            Unlock "what to do next" — ranked actions from your numbers
          </Text>
          <Icon name="forward" size={16} color={colors.textTertiary} />
        </TouchableOpacity>
      ) : (
        (data.recommendations || []).length > 0 && (
          <View style={[styles.recs, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[TYPE.eyebrow, { color: colors.textTertiary }]}>WHAT TO DO NEXT · AI</Text>
            {data.recommendations.map((r) => (
              <View key={r.text} style={styles.recRow}>
                <Icon name="ai" size={14} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[TYPE.bodySemibold, { color: colors.text }]}>{r.text}</Text>
                  {r.expectedImpact ? (
                    <Text style={[TYPE.caption, { color: colors.success }]}>{r.expectedImpact}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACING.md, marginBottom: SPACING.lg },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderRadius: RADII.card,
    borderWidth: 1,
    padding: SPACING.card,
  },
  lockedText: { flex: 1 },
  recs: { borderRadius: RADII.card, borderWidth: 1, padding: SPACING.card, gap: SPACING.md },
  recRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
});
