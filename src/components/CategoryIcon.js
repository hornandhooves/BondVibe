// Kinlo — Icon system
// Replaces system emojis (☕ ⛰ 🎵 😊) with lucide-react-native icons the app
// already depends on, so categories render identically on every device, in brand color.

import React from 'react';
import { View } from 'react-native';
import {
  Coffee, Mountain, Music, UtensilsCrossed, Dumbbell, Palette,
  Gamepad2, BookOpen, PartyPopper, Sparkles, ShieldCheck, User,
} from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

// category id (as stored in Firestore) -> lucide icon. Extend as needed.
const CATEGORY_ICON = {
  coffee: Coffee,
  outdoor: Mountain,
  music: Music,
  food: UtensilsCrossed,
  sports: Dumbbell,
  art: Palette,
  games: Gamepad2,
  books: BookOpen,
  nightlife: PartyPopper,
  other: Sparkles,
};

export function CategoryIcon({ category, size = 22, color }) {
  const { colors } = useTheme();
  const Cmp = CATEGORY_ICON[category] || Sparkles;
  return <Cmp size={size} color={color || colors.primary} strokeWidth={1.9} />;
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
      shadowColor: colors.hardShadow, shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1, shadowRadius: 0, elevation: 6,
    }}>
      {children}
    </View>
  );
}

export { ShieldCheck as VerifiedIcon, User as ProfileIcon };
