/**
 * AICard — the AI visual signature (§3.4/§3.6): dark gradient panel, sparkle +
 * eyebrow, grounded one-line reason, white text. Intentionally dark in BOTH
 * themes ("this is Claude"). P0 ships the shell; AI features fill it in P1/P2.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "./Icon";
import { TYPE, SPACING, RADII, AI, ELEVATION } from "../constants/theme-tokens";

export default function AICard({ eyebrow, children, onPress, style }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} activeOpacity={0.85} style={style}>
      <LinearGradient
        colors={AI.panel}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, ELEVATION.floatingNeutral]}
      >
        {eyebrow ? (
          <View style={styles.eyebrowRow}>
            <Icon name="ai" size={14} color={AI.accent} />
            <Text style={[TYPE.eyebrow, { color: AI.accent }]}>{eyebrow}</Text>
          </View>
        ) : null}
        <View style={styles.body}>{children}</View>
      </LinearGradient>
    </Wrapper>
  );
}

/** Convenience text for AICard bodies — white on the dark panel. */
export function AIText({ style, ...props }) {
  return <Text style={[TYPE.body, { color: AI.textOnDark }, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADII.cardLg,
    padding: SPACING.card,
    gap: SPACING.sm,
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  body: { gap: SPACING.xs },
});
