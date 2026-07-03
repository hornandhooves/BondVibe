// Kinlo — category glyphs. Delegates to the central <Icon> (Notion style) so
// categories render identically on every device, in brand color.

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import Icon from './Icon';

// Delegates to the central <Icon> (Notion style) so category glyphs share the
// same stroke/color rules. The category taxonomy lives in Icon's NAME_TO_COMPONENT.
export function CategoryIcon({ category, size = 22, color }) {
  return (
    <Icon name={category || 'other'} size={size} color={color} tone="brand" />
  );
}

// Keeps the user's chosen emoji, but inside a consistent branded tile.
export function AvatarFrame({ children, size = 84 }) {
  const { colors } = useTheme();
  return (
    <View style={{
      width: size, height: size, borderRadius: size * 0.26,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 2, borderColor: colors.borderStrong,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
    }}>
      {children}
    </View>
  );
}

// Convenience wrappers over the central <Icon> (kept for any external callers).
export const VerifiedIcon = (props) => <Icon name="verified" {...props} />;
export const ProfileIcon = (props) => <Icon name="profile" {...props} />;
