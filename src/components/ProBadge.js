/**
 * ProBadge — pill with brand gradient + crown, "PRO" or "PLUS" (§3.6).
 * Marks any locked feature affordance.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "./Icon";
import { BRAND, RADII, FONTS } from "../constants/theme-tokens";

export default function ProBadge({ tier = "pro", size = "md", style }) {
  const label = tier === "plus" ? "PLUS" : "PRO";
  const small = size === "sm";
  return (
    <LinearGradient
      colors={BRAND.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.pill, small && styles.pillSm, style]}
    >
      <Icon name="pro" size={small ? 10 : 12} color="#FFFFFF" />
      <Text style={[styles.text, small && styles.textSm]}>{label}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: RADII.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  pillSm: { paddingHorizontal: 8, paddingVertical: 3 },
  text: { fontFamily: FONTS.bodyExtra, fontSize: 11, color: "#FFFFFF", letterSpacing: 0.5 },
  textSm: { fontSize: 10 },
});
