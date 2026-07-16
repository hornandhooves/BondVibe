import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../Icon";

/**
 * "Why we're showing you this" — the deterministic affinity breakdown (P1).
 * Renders the per-signal bars + the score pill, or the honest
 * "affinity under construction" state (never a fabricated %). The score comes
 * from computeAffinity (pure JS) — never from the AI.
 */
export default function SignalBreakdown({ affinity }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const s = createStyles(colors);
  if (!affinity) return null;

  if (affinity.status === "under_construction") {
    return (
      <View style={[s.uc, { borderColor: colors.border }]}>
        <View style={[s.ucIcon, { backgroundColor: "#EDE4FC" }]}>
          <Icon name="ai" size={22} color="#7C3AED" />
        </View>
        <Text style={[s.ucTitle, { color: colors.text }]}>
          {t("matchmaking.affinity.underConstructionTitle")}
        </Text>
        <Text style={[s.ucBody, { color: colors.textSecondary }]}>
          {t("matchmaking.affinity.underConstructionBody")}
        </Text>
      </View>
    );
  }

  const signals = (affinity.signals || []).filter((x) => x.value !== null);
  return (
    <View style={[s.wrap, { borderColor: colors.border }]}>
      <View style={s.head}>
        <Text style={[s.title, { color: colors.text }]}>{t("matchmaking.affinity.title")}</Text>
        <View style={s.scorePill}>
          <Text style={s.scoreTxt}>{affinity.score}%</Text>
        </View>
      </View>
      {signals.map((sig) => {
        const pct = Math.round(sig.value * 100);
        const strong = sig.value >= 0.5;
        return (
          <View key={sig.key} style={s.row}>
            <Text style={[s.rowLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {t(`matchmaking.affinity.signal.${sig.key}`)}
            </Text>
            <View style={[s.track, { backgroundColor: strong ? "#F1EAFB" : "#EDE9F6" }]}>
              <View style={[s.fill, { width: `${pct}%`, backgroundColor: strong ? "#7C3AED" : "#A574EC" }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 16 },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
    title: { fontFamily: FONTS.bodyExtra, fontSize: 15 },
    scorePill: { backgroundColor: "#EDE4FC", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
    scoreTxt: { fontFamily: FONTS.display, fontSize: 16, color: "#7C3AED", letterSpacing: -0.5 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 11 },
    rowLabel: { flex: 0.42, fontFamily: FONTS.bodySemibold, fontSize: 12.5 },
    track: { flex: 0.58, height: 7, borderRadius: 4, overflow: "hidden" },
    fill: { height: 7, borderRadius: 4 },
    uc: { borderWidth: 1, borderRadius: 18, padding: 20, marginTop: 16, alignItems: "center" },
    ucIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 12 },
    ucTitle: { fontFamily: FONTS.display, fontSize: 15.5, marginBottom: 6, textAlign: "center" },
    ucBody: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
  });
}
