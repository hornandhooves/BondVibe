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
import { useTranslation } from "react-i18next";
import useClaude from "../../hooks/useClaude";
import useAiOptIn from "../../hooks/useAiOptIn";
import { TYPE, SPACING, RADII } from "../../constants/theme-tokens";

export default function MemberPulseCard({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { aiOptIn } = useAiOptIn();
  const { data, loading, fallback, error } = useClaude(
    "member_intel",
    {},
    { enabled: aiOptIn, cacheKey: "member_intel", ttlMs: 60 * 60 * 1000 }
  );

  if (!aiOptIn) return null;
  if (loading) return <AILoadingCard eyebrow={t("memberPulseCard.aiCommunityPulse")} style={styles.block} />;
  if (error === "needs_pro") {
    return (
      <LockedFeature
        tier="pro"
        title={t("memberPulseCard.memberIntelligence")}
        valueLine={t("memberPulseCard.valueLine")}
        onUnlock={() => navigation.navigate("ProUpsell", { from: "member_intel" })}
        style={styles.block}
      />
    );
  }
  if (fallback || !data) return null; // plain CRM below, never fake

  return (
    <View style={styles.block}>
      <AICard eyebrow={t("memberPulseCard.aiCommunityPulse")}>
        <AIText>{data.pulse}</AIText>
      </AICard>
      <View style={styles.tiles}>
        <StatCard
          title={t("memberPulseCard.sentiment")}
          value={data.metrics.sentiment != null ? `${data.metrics.sentiment}%` : "–"}
        />
        <StatCard title={t("memberPulseCard.coolingOff")} value={String(data.metrics.coolingOff)} />
        <StatCard title={t("memberPulseCard.regulars")} value={String(data.metrics.regulars)} />
      </View>
      {data.winBack?.message ? (
        <View style={[styles.winBack, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[TYPE.eyebrow, { color: colors.textTertiary }]}>{t("memberPulseCard.aiDraftedWinBack")}</Text>
          <Text selectable style={[TYPE.body, { color: colors.text }]}>{data.winBack.message}</Text>
          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>
            {t("memberPulseCard.forCoolingOffMembers", {
              count: data.winBack.audienceCount ?? data.metrics.coolingOff,
            })}
          </Text>
        </View>
      ) : null}
      <Text style={[TYPE.caption, styles.privacy, { color: colors.textTertiary }]}>
        {t("memberPulseCard.privacyNote")}
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
