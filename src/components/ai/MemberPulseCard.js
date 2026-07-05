/**
 * MemberPulseCard — Member Intelligence (ai_features/13) atop HostCRM:
 * aggregate pulse + metric tiles + AI-drafted win-back message.
 * Pro-only (server-enforced); non-Pro sees the LockedFeature affordance.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import AICard, { AIText } from "../AICard";
import AILoadingCard from "../AILoadingCard";
import LockedFeature from "../LockedFeature";
import StatCard from "../StatCard";
import { useTheme } from "../../contexts/ThemeContext";
import useClaude from "../../hooks/useClaude";
import useAiOptIn from "../../hooks/useAiOptIn";
import { TYPE, SPACING, RADII } from "../../constants/theme-tokens";

export default function MemberPulseCard({ navigation }) {
  const { colors } = useTheme();
  const { aiOptIn } = useAiOptIn();
  const { data, loading, fallback, error } = useClaude(
    "member_intel",
    {},
    { enabled: aiOptIn, cacheKey: "member_intel", ttlMs: 60 * 60 * 1000 }
  );

  if (!aiOptIn) return null;
  if (loading) return <AILoadingCard eyebrow="AI community pulse" style={styles.block} />;
  if (error === "needs_pro") {
    return (
      <LockedFeature
        tier="pro"
        title="Member Intelligence"
        valueLine="AI reads your community's pulse and drafts win-backs for cooling-off members."
        onUnlock={() => navigation.navigate("ProUpsell", { from: "member_intel" })}
        style={styles.block}
      />
    );
  }
  if (fallback || !data) return null; // plain CRM below, never fake

  return (
    <View style={styles.block}>
      <AICard eyebrow="AI community pulse">
        <AIText>{data.pulse}</AIText>
      </AICard>
      <View style={styles.tiles}>
        <StatCard
          title="Sentiment"
          value={data.metrics.sentiment != null ? `${data.metrics.sentiment}%` : "–"}
        />
        <StatCard title="Cooling off" value={String(data.metrics.coolingOff)} />
        <StatCard title="Regulars" value={String(data.metrics.regulars)} />
      </View>
      {data.winBack?.message ? (
        <View style={[styles.winBack, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[TYPE.eyebrow, { color: colors.textTertiary }]}>AI-DRAFTED WIN-BACK</Text>
          <Text selectable style={[TYPE.body, { color: colors.text }]}>{data.winBack.message}</Text>
          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
            For {data.winBack.audienceCount ?? data.metrics.coolingOff} cooling-off members ·
            long-press to copy · send it from Groups
          </Text>
        </View>
      ) : null}
      <Text style={[TYPE.caption, styles.privacy, { color: colors.textTertiary }]}>
        Aggregated & privacy-safe · AI never sees individual DMs
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: SPACING.md, marginBottom: SPACING.lg },
  tiles: { flexDirection: "row", gap: SPACING.sm },
  winBack: { borderRadius: RADII.card, borderWidth: 1, padding: SPACING.card, gap: SPACING.sm },
  privacy: { textAlign: "center" },
});
