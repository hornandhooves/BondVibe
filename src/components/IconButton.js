import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { FONTS } from '../constants/theme-tokens';

/**
 * Circular icon button per the "07/Buttons" Icon buttons row — a default
 * (white + border) and active/selected (filled primary) state, with an
 * optional small count badge (e.g. a cart item count). The caller owns the
 * icon's own color (pass a colored <Icon>) since IconButton only controls
 * the surrounding circle.
 */
export default function IconButton({
  icon,
  active = false,
  badge,
  onPress,
  size = 44,
  style,
  ...pressableProps
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: active ? colors.primary : colors.surface,
          borderWidth: active ? 0 : 1,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...pressableProps}
    >
      {icon}
      {typeof badge === 'number' && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.clay }]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontFamily: FONTS.bodyBold, fontSize: 10 },
});
