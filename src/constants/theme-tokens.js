// BondVibe — Theme tokens (Warmth = light · Aurora = dark)
// Drop-in for the `colors` object in src/contexts/ThemeContext.js.
// Keeps EVERY existing token name so current screens recolor instantly,
// and ADDS Bold-Pop tokens (borderStrong, hardShadow, ink, onInk, onPrimary)
// plus the refined brand gradient.

// Typography — Space Grotesk for display/wordmark/numbers, Plus Jakarta Sans
// for UI/body. Names match the @expo-google-fonts weights loaded in App.js.
export const FONTS = {
  display: 'SpaceGrotesk_700Bold',
  displaySemibold: 'SpaceGrotesk_600SemiBold',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemibold: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
  bodyExtra: 'PlusJakartaSans_800ExtraBold',
};

export const BRAND = {
  // Fixed brand signature — same in every theme (logo, icon, splash, marketing).
  // Refined: dropped the cold indigo; ends on Aurora's exact magenta.
  gradient: ['#7C3AED', '#C026D3', '#FF3E9A'],
  // Optional warm bridge — Warmth hero moments only (contains both theme accents).
  gradientWarm: ['#E91E8C', '#F0573D'],
  violet: '#7C3AED',
  magenta: '#E91E8C',
};

export const WARMTH = {
  background: '#FBF6F1',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceGlass: 'rgba(255, 255, 255, 0.85)',
  text: '#2A2520',
  textSecondary: '#9A8D7E',
  textTertiary: '#B6A99B',
  primary: '#F0573D',
  primaryLight: '#FF7E5F',
  primaryDark: '#C2603F',
  secondary: '#1F8A6E',
  secondaryLight: '#2FA888',
  accent: '#1F8A6E',
  success: '#1F8A6E',
  successBg: '#DBF0E9',
  warning: '#E8A33D',
  error: '#E0413A',
  border: 'rgba(42, 37, 32, 0.10)',
  borderLight: 'rgba(42, 37, 32, 0.06)',
  borderStrong: '#2A2520',
  hardShadow: '#2A2520',
  ink: '#2A2520',
  onInk: '#FFFFFF',
  onPrimary: '#FFFFFF',
  glow: 'rgba(240, 87, 61, 0.25)',
  glowCyan: 'rgba(31, 138, 110, 0.25)',
  shadow: 'rgba(80, 60, 40, 0.12)',
  gradientPrimary: BRAND.gradient,
};

export const AURORA = {
  background: '#0E1117',
  surface: '#171B26',
  surfaceElevated: '#1C2130',
  surfaceGlass: 'rgba(22, 26, 38, 0.70)',
  text: '#EDEFF5',
  textSecondary: '#8B93A7',
  textTertiary: '#6B7385',
  primary: '#FF3E9A',
  primaryLight: '#FF6FB5',
  primaryDark: '#E6007A',
  secondary: '#3DDCFF',
  secondaryLight: '#7DE9FF',
  accent: '#3DDCFF',
  success: '#3DE0A0',
  successBg: '#0F3A2E',
  warning: '#FFB23D',
  error: '#FF6B6B',
  border: 'rgba(255, 255, 255, 0.12)',
  borderLight: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  hardShadow: '#FF3E9A',
  ink: '#EDEFF5',
  onInk: '#0E1117',
  onPrimary: '#FFFFFF',
  glow: 'rgba(255, 62, 154, 0.45)',
  glowCyan: 'rgba(61, 220, 255, 0.40)',
  shadow: 'rgba(0, 0, 0, 0.50)',
  gradientPrimary: BRAND.gradient,
};

// In ThemeContext.js:
//   import { WARMTH, AURORA } from '../constants/theme-tokens';
//   const colors = isDark ? AURORA : WARMTH;
