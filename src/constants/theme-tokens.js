// Kinlo — Theme tokens (Warmth = light · Aurora = dark)
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

// Clean (day/light) — fuente de verdad: Kinlo Design System §2
export const WARMTH = {
  background: '#F1F0F4',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceGlass: 'rgba(255, 255, 255, 0.90)',
  sunken: '#F7F5FB',
  frame: '#DDDAE4',
  text: '#1a1d29',
  textSecondary: '#5b6072',
  textTertiary: '#8a8f9c',
  primary: '#7C3AED',
  primaryLight: '#9461f7',
  primaryDark: '#6320c4',
  brand: '#7C3AED',
  brandSoft: '#F1E9FE',
  secondary: '#1F8A6E',
  secondaryLight: '#2FA888',
  accent: '#7C3AED',
  success: '#1F8A6E',
  successBg: '#E1F5EC',
  warning: '#B45309',
  warnSoft: '#FBEFD6',
  error: '#c25b5b',
  border: '#EEEDF2',
  borderLight: '#F7F5FB',
  borderStrong: '#DDDAE4',
  hardShadow: 'rgba(0,0,0,0.08)',
  ink: '#1a1d29',
  onInk: '#FFFFFF',
  onPrimary: '#FFFFFF',
  glow: 'rgba(124, 58, 237, 0.15)',
  glowCyan: 'rgba(31, 138, 110, 0.15)',
  shadow: 'rgba(0,0,0,0.06)',
  gradientPrimary: BRAND.gradient,
  // Superficies oscuras puntuales (QR, paywall, banner Pro)
  dark: '#160F22',
  lilac: '#C792EA',
};

// Aurora (dark) — mismo sistema Kinlo, versión nocturna. Sin rosa neón.
export const AURORA = {
  background: '#160F22',
  surface: '#1E1438',
  surfaceElevated: '#261A48',
  surfaceGlass: 'rgba(30, 20, 56, 0.85)',
  sunken: '#12092E',
  frame: '#2D2050',
  text: '#F0EEFB',
  textSecondary: '#A89BC8',
  textTertiary: '#7A6F96',
  primary: '#9461f7',
  primaryLight: '#b48dff',
  primaryDark: '#7C3AED',
  brand: '#9461f7',
  brandSoft: '#2D1A6E',
  secondary: '#1F8A6E',
  secondaryLight: '#2FA888',
  accent: '#9461f7',
  success: '#3DE0A0',
  successBg: '#0F3A2E',
  warning: '#FFB23D',
  warnSoft: '#3A2800',
  error: '#FF6B6B',
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.04)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',
  hardShadow: 'rgba(0, 0, 0, 0.40)',
  ink: '#F0EEFB',
  onInk: '#160F22',
  onPrimary: '#FFFFFF',
  glow: 'rgba(148, 97, 247, 0.30)',
  glowCyan: 'rgba(31, 138, 110, 0.25)',
  shadow: 'rgba(0, 0, 0, 0.35)',
  gradientPrimary: BRAND.gradient,
  dark: '#0A0515',
  lilac: '#C792EA',
};

// In ThemeContext.js:
//   import { WARMTH, AURORA } from '../constants/theme-tokens';
//   const colors = isDark ? AURORA : WARMTH;
