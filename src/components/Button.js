import React from 'react';
import { Pressable, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { FONTS, BUTTON_SIZES } from '../constants/theme-tokens';
import { darkenHex } from '../utils/color';

// Disabled fill for the primary variant — a muted sage-gray per the
// "07/Buttons" Disabled swatch (not just a faded-opacity primary).
const DISABLED_PRIMARY_BG = '#B9C4BE';
const DISABLED_TEXT = 'rgba(255,255,255,0.85)';

/**
 * Shared button per the "07/Buttons" design-system spec: Primary (filled)
 * and Secondary (outlined) variants, LG/MD/SM sizes, a darker-fill/tinted
 * Pressed state (not an opacity fade), and a muted Disabled state. Defaults
 * to hugging its label ("Width: Auto" in the spec) — pass `fullWidth` for a
 * stretched CTA.
 */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  color,
  textColor,
  fullWidth = false,
  disabled = false,
  loading = false,
  icon = null,
  style,
  textStyle,
  ...pressableProps
}) {
  const { colors } = useTheme();
  const spec = BUTTON_SIZES[size];
  const tint = color || colors.primary;

  const isSecondary = variant === 'secondary';
  const resolvedTextColor = textColor || (isSecondary ? tint : colors.onPrimary);
  const pressedFill = isSecondary ? `${tint}1A` : darkenHex(tint, 0.2);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height: spec.height,
          borderRadius: spec.borderRadius,
          paddingHorizontal: spec.paddingHorizontal,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          gap: spec.gap || 8,
        },
        isSecondary
          ? {
              backgroundColor: pressed && !disabled && !loading ? pressedFill : 'transparent',
              borderWidth: 1.5,
              borderColor: disabled ? colors.borderStrong : tint,
            }
          : {
              backgroundColor: disabled
                ? DISABLED_PRIMARY_BG
                : pressed && !loading
                ? pressedFill
                : tint,
            },
        style,
      ]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary ? tint : resolvedTextColor} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text
            style={[
              styles.label,
              {
                color: disabled && !isSecondary ? DISABLED_TEXT : disabled ? colors.textTertiary : resolvedTextColor,
                fontSize: spec.fontSize,
              },
              textStyle,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FONTS.bodySemibold,
    letterSpacing: -0.2,
  },
});
