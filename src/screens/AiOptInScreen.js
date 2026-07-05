/**
 * AiOptInScreen — "Meet Kinlo AI" one-time opt-in (§2.1). Gates ALL AI.
 * Shown at the end of first-run onboarding and reachable from Settings.
 * Writes users/{uid}.aiOptIn; declining is a first-class choice ("Not now").
 */
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";
import useAiOptIn from "../hooks/useAiOptIn";
import { TYPE, SPACING, RADII, BRAND, AI, ELEVATION } from "../constants/theme-tokens";

export default function AiOptInScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { setOptIn } = useAiOptIn();
  const [busy, setBusy] = useState(false);
  // During onboarding we land on the tab shell afterwards; from Settings we pop.
  const fromOnboarding = route?.params?.fromOnboarding === true;

  const finish = async (value) => {
    if (busy) return;
    setBusy(true);
    try {
      await setOptIn(value);
    } catch {
      // Non-blocking: default stays off; Settings can change it later.
    }
    // Cold boots land here via initialRouteName (no params, no back stack):
    // treat "nowhere to go back to" the same as onboarding.
    if (fromOnboarding || !navigation.canGoBack()) {
      navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
    } else {
      navigation.goBack();
    }
    setBusy(false);
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.wrap}>
        <LinearGradient
          colors={AI.panel}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.orb, ELEVATION.floatingNeutral]}
        >
          <Icon name="ai" size={44} color={AI.accent} />
        </LinearGradient>

        <Text style={[TYPE.display, styles.title, { color: colors.text }]}>
          Meet Kinlo AI
        </Text>
        <Text style={[TYPE.body, styles.subtitle, { color: colors.textSecondary }]}>
          Finds your people and your events, from your real activity on Kinlo.
        </Text>

        <View style={styles.points}>
          {[
            "Only you see what it learns",
            "Never public · never sold",
            "Turn it off anytime in Settings",
          ].map((p) => (
            <View key={p} style={styles.pointRow}>
              <Icon name="check" size={16} color={colors.success} />
              <Text style={[TYPE.body, { color: colors.text }]}>{p}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={() => finish(true)} disabled={busy} activeOpacity={0.85} testID="ai-opt-in">
          <LinearGradient
            colors={BRAND.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.cta, ELEVATION.floatingBrand]}
          >
            <Text style={[TYPE.label, styles.ctaText]}>Turn on Kinlo AI</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => finish(false)} disabled={busy} style={styles.later} testID="ai-not-now">
          <Text style={[TYPE.label, { color: colors.textTertiary }]}>Not now</Text>
        </TouchableOpacity>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", paddingHorizontal: SPACING.xxl, gap: SPACING.md },
  orb: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: SPACING.sm,
  },
  title: { textAlign: "center" },
  subtitle: { textAlign: "center", marginBottom: SPACING.sm },
  points: { gap: SPACING.sm, marginVertical: SPACING.lg, alignSelf: "center" },
  pointRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  cta: {
    height: 54,
    borderRadius: RADII.button,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#FFFFFF", fontSize: 16 },
  later: { alignItems: "center", paddingVertical: SPACING.md },
});
