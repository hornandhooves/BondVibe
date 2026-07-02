// Kinlo — Bold Pop primitives
// The visual language (2px outline, hard offset shadow, big type) lives here so
// screens compose it instead of re-implementing per file. All colors come from
// useTheme() tokens, so Warmth/Aurora switch automatically.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { FONTS } from '../constants/theme-tokens';

// Hard offset block shadow (the Bold Pop signature). RN: radius 0 + full opacity.
function hardShadow(color, offset = 5) {
  return {
    shadowColor: color,
    shadowOffset: { width: offset, height: offset },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: offset + 1,
  };
}

// ---------- BVCard ----------
export function BVCard({ children, style, shadow = true, shadowColor }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: colors.borderStrong,
          borderRadius: 20,
          padding: 18,
        },
        shadow && hardShadow(shadowColor || colors.hardShadow),
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------- BVButton ----------
export function BVButton({ label, onPress, variant = 'solid', icon, style }) {
  const { colors } = useTheme();
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: solid ? colors.primary : colors.surface,
          borderWidth: 2,
          borderColor: colors.borderStrong,
          borderRadius: 30,
          paddingVertical: 13,
          paddingHorizontal: 22,
          transform: [{ translateX: pressed ? 2 : 0 }, { translateY: pressed ? 2 : 0 }],
        },
        solid && !( /* pressed handled above */ false) && hardShadow(colors.hardShadow, 3),
        style,
      ]}
    >
      {icon}
      <Text style={{ color: solid ? colors.onPrimary : colors.text, fontFamily: FONTS.bodyBold, fontSize: 15 }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- BVBadge ----------
// tone: 'primary' | 'secondary' | 'success' | 'ink'
export function BVBadge({ label, tone = 'secondary', icon }) {
  const { colors } = useTheme();
  const bg = {
    primary: colors.primary,
    secondary: colors.secondary,
    success: colors.success,
    ink: colors.ink,
  }[tone];
  const fg = tone === 'ink' ? colors.onInk
    : tone === 'secondary' ? colors.onInk
    : colors.onPrimary;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: bg, borderWidth: 2, borderColor: colors.borderStrong,
      borderRadius: 30, paddingVertical: 5, paddingHorizontal: 11, alignSelf: 'flex-start',
    }}>
      {icon}
      <Text style={{ color: fg, fontFamily: FONTS.bodyExtra, fontSize: 12, letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

// ---------- BVStat ----------
export function BVStat({ value, label, highlight = false }) {
  const { colors } = useTheme();
  return (
    <View style={[
      {
        flex: 1, borderWidth: 2, borderColor: highlight ? colors.borderStrong : colors.borderStrong,
        borderRadius: 16, paddingVertical: 13, paddingHorizontal: 6, alignItems: 'center',
        backgroundColor: highlight ? colors.primary : colors.surface,
      },
      highlight && hardShadow(colors.hardShadow, 3),
    ]}>
      <Text style={{
        fontSize: 24, fontFamily: FONTS.display, letterSpacing: -1,
        color: highlight ? colors.onPrimary : colors.text,
      }}>{value}</Text>
      <Text style={{
        fontSize: 11, fontFamily: FONTS.bodySemibold, marginTop: 2,
        color: highlight ? 'rgba(255,255,255,0.85)' : colors.textSecondary,
      }}>{label}</Text>
    </View>
  );
}

// ---------- SectionHeader ----------
export function SectionHeader({ title, action, onAction }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <Text style={{ fontSize: 15, fontFamily: FONTS.displaySemibold, letterSpacing: -0.3, color: colors.text }}>
        {title}
      </Text>
      <View style={{ flex: 1, height: 2, backgroundColor: colors.border }} />
      {action ? (
        <Text onPress={onAction} style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
          {action}
        </Text>
      ) : null}
    </View>
  );
}
