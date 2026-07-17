import { Platform } from 'react-native';

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

// ─────────────────────────────────────────────────────────────────────────────
// Redesign system tokens (kinlo_build/01_REDESIGN_SPEC.md §3). Everything below
// is ADDITIVE — no existing token name changes.
// ─────────────────────────────────────────────────────────────────────────────

// §3.2 Type ramp — one place for font family + size + weight combos.
// Usage: <Text style={[TYPE.title, { color: colors.text }]}>
export const TYPE = {
  display: { fontFamily: FONTS.display, fontSize: 28, lineHeight: 34 },
  displayLg: { fontFamily: FONTS.display, fontSize: 40, lineHeight: 46 },
  title: { fontFamily: FONTS.display, fontSize: 18, lineHeight: 24 },
  titleLg: { fontFamily: FONTS.display, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: FONTS.body, fontSize: 14.5, lineHeight: 21 },
  bodySemibold: { fontFamily: FONTS.bodySemibold, fontSize: 14.5, lineHeight: 21 },
  label: { fontFamily: FONTS.bodySemibold, fontSize: 13, lineHeight: 18 },
  eyebrow: {
    fontFamily: FONTS.display,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  caption: { fontFamily: FONTS.bodyMedium, fontSize: 11.5, lineHeight: 16 },
};

// §3.3 Spacing (4pt base) & radius. Use these — never ad-hoc numbers.
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screen: 20, // horizontal screen padding
  card: 16, // card padding
};

export const RADII = {
  pill: 999,
  card: 18,
  cardLg: 22,
  button: 27,
  tile: 12,
  sheet: 28, // bottom-sheet top corners
};

// §3.4 AI signature surfaces — intentionally dark in BOTH themes
// ("this is Claude" visual signature).
export const AI = {
  bg: '#160F22',
  panel: ['#2A1E3D', '#42265C'], // LinearGradient 135°
  accent: '#C792EA',
  textOnDark: '#e6ddf2',
};

// Dark invitation hero (become-host gate). A brand surface, so it's identical in
// both themes — same rationale as BRAND.gradient. Deliberately NOT AI.panel:
// they happen to look alike today, but an AI restyle must not silently repaint
// the host gate.
export const HERO_PANEL = ['#2A1E3D', '#4A2A6E']; // LinearGradient 135°

// §3.4 Match-type accents + misc roles shared by both themes.
export const MATCH_COLORS = {
  friend: { fg: '#1F8A6E', soft: '#E1F5EC' },
  professional: { fg: '#4F5BD5', soft: '#E6EAFB' },
  romantic: { fg: '#E91E8C', soft: '#FBE4F1' },
};

export const AVATAR_PASTELS = ['#ECE6FB', '#FBE4F1', '#E6EAFB', '#E1F5EC', '#FBEDE4'];

export const LIME_GOOD = '#C3E88D';

// §3.5 Elevation — cross-platform (iOS shadow* / Android elevation).
// Usage: style={[ELEVATION.card, ...]}  (colors stay theme-agnostic per spec)
const shadow = (color, offsetY, radius, opacity, elevation) =>
  Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowRadius: radius,
      shadowOpacity: opacity,
    },
    android: { elevation },
    default: {},
  });

export const ELEVATION = {
  card: shadow('#000000', 1, 3, 0.06, 2),
  floatingBrand: shadow('#7C3AED', 9, 22, 0.28, 8),
  floatingNeutral: shadow('#1E1432', 10, 30, 0.14, 10),
};

// In ThemeContext.js:
//   import { WARMTH, AURORA } from '../constants/theme-tokens';
//   const colors = isDark ? AURORA : WARMTH;
