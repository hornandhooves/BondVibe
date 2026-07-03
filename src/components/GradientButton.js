/**
 * GradientButton — primary CTA button with brand gradient.
 * Replaces flat-color primary buttons. Secondary variant stays flat white/surface.
 */
import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../contexts/ThemeContext";
import { BRAND } from "../constants/theme-tokens";

export default function GradientButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary", // "primary" | "secondary" | "danger"
  size = "md",         // "sm" | "md" | "lg"
  style,
}) {
  const { colors } = useTheme();
  const s = styles(colors, size);

  if (variant === "secondary") {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[s.base, s.secondary, disabled && s.disabled, style]}
      >
        {loading
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Text style={[s.label, { color: colors.text }]}>{label}</Text>
        }
      </TouchableOpacity>
    );
  }

  if (variant === "danger") {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[s.base, { backgroundColor: colors.error }, disabled && s.disabled, style]}
      >
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={[s.label, { color: "#fff" }]}>{label}</Text>
        }
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[s.base, disabled && s.disabled, style]}
    >
      <LinearGradient
        colors={BRAND.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {loading
        ? <ActivityIndicator size="small" color="#fff" />
        : <Text style={[s.label, { color: "#fff" }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

function styles(colors, size) {
  const height = size === "sm" ? 38 : size === "lg" ? 56 : 48;
  const fontSize = size === "sm" ? 13 : size === "lg" ? 17 : 15;
  return StyleSheet.create({
    base: {
      height,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      paddingHorizontal: 24,
    },
    secondary: {
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
    disabled: { opacity: 0.45 },
    label: { fontSize, fontWeight: "700", letterSpacing: -0.2 },
  });
}
