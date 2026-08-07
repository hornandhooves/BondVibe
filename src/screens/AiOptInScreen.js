/**
 * AiOptInScreen — "Meet Kinlo AI" one-time opt-in (§2.1). Gates ALL AI.
 * Shown at the end of first-run onboarding and reachable from Settings.
 * Writes users/{uid}.aiOptIn; declining is a first-class choice ("Not now").
 *
 * PIXEL-FIDELITY SPEC: redesigned onto the new Kinlo palette — deliberately
 * OFF the AI.* "signature dark surface" tokens (see their own comment in
 * theme-tokens.js) per this screen's new mock, which puts it on the normal
 * light/dark theme background with a solid colors.primary icon tile. AI.*
 * itself, and its other consumers (AICard, AskKinloScreen, etc.), are
 * untouched — this is a scoped exception for this one screen, not a
 * reversal of the "don't silently repaint the AI signature" rule.
 */
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import Button from "../components/Button";
import { useTheme } from "../contexts/ThemeContext";
import useAiOptIn from "../hooks/useAiOptIn";
import { TYPE, SPACING } from "../constants/theme-tokens";

export default function AiOptInScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.wrap}>
        <View style={[styles.orb, { backgroundColor: colors.primary }]}>
          <Icon name="ai" size={40} color="#FFFFFF" />
        </View>

        <Text style={[TYPE.display, styles.title, { color: colors.text }]}>
          {t("aiOptIn.title")}
        </Text>
        <Text style={[TYPE.body, styles.subtitle, { color: colors.textSecondary }]}>
          {t("aiOptIn.subtitle")}
        </Text>

        <View style={styles.points}>
          {[
            t("aiOptIn.point1"),
            t("aiOptIn.point2"),
            t("aiOptIn.point3"),
          ].map((p) => (
            <View key={p} style={styles.pointRow}>
              <Icon name="check" size={16} color={colors.success} />
              <Text style={[TYPE.body, { color: colors.text }]}>{p}</Text>
            </View>
          ))}
        </View>

        <Button
          label={t("aiOptIn.cta")}
          onPress={() => finish(true)}
          disabled={busy}
          fullWidth
          size="lg"
          style={styles.cta}
          testID="ai-opt-in"
        />

        <TouchableOpacity onPress={() => finish(false)} disabled={busy} style={styles.later} testID="ai-not-now">
          <Text style={[TYPE.label, { color: colors.textTertiary }]}>{t("aiOptIn.notNow")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  wrap: { flex: 1, justifyContent: "center", paddingHorizontal: SPACING.xxl, gap: SPACING.md },
  orb: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: SPACING.sm,
  },
  title: { textAlign: "center" },
  subtitle: { textAlign: "center", marginBottom: SPACING.sm },
  points: { gap: SPACING.md, marginVertical: SPACING.lg, alignSelf: "center" },
  pointRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  cta: { marginTop: SPACING.sm },
  later: { alignItems: "center", paddingVertical: SPACING.md },
});
