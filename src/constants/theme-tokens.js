import { Platform } from 'react-native';

// Kinlo — Theme tokens (Warmth = light · Aurora = dark)
// Drop-in for the `colors` object in src/contexts/ThemeContext.js.
// Keeps EVERY existing token name so current screens recolor instantly,
// and ADDS Bold-Pop tokens (borderStrong, hardShadow, ink, onInk, onPrimary)
// plus the refined brand gradient.

// Typography — Domine (serif) for display/headings, Public Sans for UI/body,
// per the Kinlo design-system "02/Typography" sheet. Replaces the earlier
// Space Grotesk / Plus Jakarta Sans pairing app-wide. Names match the
// @expo-google-fonts weights loaded in App.js.
export const FONTS = {
  display: 'Domine_700Bold',
  displaySemibold: 'Domine_600SemiBold',
  body: 'PublicSans_400Regular',
  bodyMedium: 'PublicSans_500Medium',
  bodySemibold: 'PublicSans_600SemiBold',
  bodyBold: 'PublicSans_700Bold',
  bodyExtra: 'PublicSans_800ExtraBold',
  // heroSerif/heroSans/heroSansBold: kept as their own named entries (values
  // now identical to display/body/bodyBold above) because WelcomeScreen
  // imports them by these exact names — do not rename or remove.
  heroSerif: 'Domine_700Bold',
  heroSans: 'PublicSans_400Regular',
  heroSansBold: 'PublicSans_700Bold',
};

// KINLO wordmark spec: Avenir Next DemiBold — an Apple system font, free on
// iOS, not a Google Font we can bundle. Android has no equivalent installed,
// so it falls back to our loaded Plus Jakarta Sans Bold there. Shared by
// WelcomeScreen and LoginScreen (and any other screen showing the wordmark).
export const WORDMARK_FONT = Platform.select({
  ios: 'AvenirNext-DemiBold',
  default: FONTS.bodyBold,
});

export const BRAND = {
  // Fixed brand signature — same in every theme (logo, icon, splash, marketing).
  // Deep Jungle → Ocean Teal, matching the shipped app icon (assets/icon.png)
  // and the Kinlo "Color Palette" sheet. Replaces the old violet/magenta pair.
  gradient: ['#1e4d45', '#2f8f8d'],
  // Warm bridge — Sunset Clay → Ocean Teal.
  gradientWarm: ['#c86d4a', '#2f8f8d'],
};

// Clean (day/light) — Kinlo Color Palette sheet: Warm Sand / Limestone /
// Ocean Teal / Deep Jungle / Sunset Clay / Charcoal. Same token names as
// before so every screen already on `colors.*` recolors automatically.
export const WARMTH = {
  background: '#f4f0e8', // Warm Sand — bg-page
  surface: '#FFFFFF', // bg-surface
  surfaceElevated: '#FFFFFF',
  surfaceGlass: 'rgba(255, 255, 255, 0.90)',
  sunken: '#e3ddd2', // Limestone — bg-sunken
  frame: '#DDD6C7',
  text: '#2b2b2b', // Charcoal 100%
  textSecondary: 'rgba(43, 43, 43, 0.62)', // Charcoal 62%
  textTertiary: 'rgba(43, 43, 43, 0.42)', // Charcoal 42%
  primary: '#1e4d45', // Deep Jungle — color-primary
  primaryLight: '#3a6b61',
  primaryDark: '#153a34',
  brand: '#1e4d45',
  brandSoft: '#E4EDE9',
  secondary: '#2f8f8d', // Ocean Teal
  secondaryLight: '#4aa39e',
  accent: '#2f8f8d', // Ocean Teal — color-accent
  success: '#1F8A6E',
  successBg: '#E1F5EC',
  warning: '#B45309',
  warnSoft: '#FBEFD6',
  error: '#c25b5b',
  clay: '#c86d4a', // Sunset Clay — color-clay (badges, warm accents)
  claySoft: '#F3E3DA',
  border: '#EAE4D8',
  borderLight: '#F2EDE3',
  borderStrong: '#DDD6C7',
  hardShadow: 'rgba(43, 43, 43, 0.08)',
  ink: '#2b2b2b',
  onInk: '#FFFFFF',
  onPrimary: '#FFFFFF',
  glow: 'rgba(30, 77, 69, 0.15)',
  glowCyan: 'rgba(47, 143, 141, 0.15)',
  shadow: 'rgba(43, 43, 43, 0.06)',
  gradientPrimary: BRAND.gradient,
  // Superficies oscuras puntuales (QR, paywall, banner Pro)
  dark: '#0F2622',
  lilac: '#C792EA',
};

// Aurora (dark) — mismo sistema Kinlo, versión nocturna. Sin rosa neón.
// Aurora (dark) — Kinlo "Tokens" dark sheet: Night Page/Surface/Sunken, Ocean
// Teal promoted to primary (Deep Jungle reads too low-contrast on near-black),
// Sunset Clay brightened for accent. `border` is the sheet's literal
// `oklch(from #f4f0e8 l c h / 0.14)` — a relative-color expression that just
// takes Warm Sand's own hue/lightness at 14% alpha, i.e. exactly
// rgba(244,240,232,0.14); written that way since RN's style engine doesn't
// parse oklch()/relative-color CSS syntax.
export const AURORA = {
  background: '#1b1815', // Night Page
  surface: '#262219', // Night Surface
  surfaceElevated: '#262219',
  surfaceGlass: 'rgba(38, 34, 25, 0.85)',
  sunken: '#141210', // Night Sunken
  frame: 'rgba(244, 240, 232, 0.14)',
  text: '#f4f0e8', // Text — Warm Sand
  textSecondary: 'rgba(244, 240, 232, 0.62)',
  textTertiary: 'rgba(244, 240, 232, 0.42)',
  primary: '#2f8f8d', // Ocean Teal
  primaryLight: '#4aa3a0',
  primaryDark: '#1f6f6d',
  brand: '#2f8f8d',
  brandSoft: '#1E3B39',
  secondary: '#dd8659', // Sunset Clay, brightened
  secondaryLight: '#e79b74',
  accent: '#dd8659',
  success: '#52ac89',
  successBg: '#16302A',
  warning: '#FFB23D',
  warnSoft: '#3A2800',
  error: '#e2695c',
  clay: '#dd8659',
  claySoft: '#3A2418',
  border: 'rgba(244, 240, 232, 0.14)',
  borderLight: 'rgba(244, 240, 232, 0.08)',
  borderStrong: 'rgba(244, 240, 232, 0.20)',
  hardShadow: 'rgba(0, 0, 0, 0.40)',
  ink: '#f4f0e8',
  onInk: '#1b1815',
  onPrimary: '#FFFFFF',
  glow: 'rgba(47, 143, 141, 0.30)',
  glowCyan: 'rgba(82, 172, 137, 0.25)',
  shadow: 'rgba(0, 0, 0, 0.35)',
  gradientPrimary: BRAND.gradient,
  dark: '#141210',
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

  // "02/Typography" Type Scale sheet — exact sizes/weights, additive (the
  // entries above stay as-is since existing screens already consume them).
  heroTitle: { fontFamily: FONTS.display, fontSize: 24, lineHeight: 32 },
  heading1: { fontFamily: FONTS.display, fontSize: 20, lineHeight: 28 },
  heading2: { fontFamily: FONTS.displaySemibold, fontSize: 18, lineHeight: 26 },
  subtitle: { fontFamily: FONTS.bodySemibold, fontSize: 16, lineHeight: 24 },
  bodySpec: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  buttonText: { fontFamily: FONTS.bodySemibold, fontSize: 14, lineHeight: 20 },
  chipMd: { fontFamily: FONTS.bodySemibold, fontSize: 14, lineHeight: 20 },
  chipSm: { fontFamily: FONTS.bodySemibold, fontSize: 13, lineHeight: 18 },
  inputText: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 },
  inputLabel: { fontFamily: FONTS.bodySemibold, fontSize: 13, lineHeight: 18 },
  captionSpec: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 16 },
  tabLabel: { fontFamily: FONTS.bodySemibold, fontSize: 11, lineHeight: 16 },
};

// §3.3 Spacing (4pt base) & radius. Use these — never ad-hoc numbers.
// Scale matches the "05/Spacing, Radius" sheet (4/8/12/16/24/32/48/64).
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
  xxxxxl: 64,
  screen: 20, // horizontal screen padding
  card: 16, // card padding
};

// Corner Radius sheet: Input 14, Button 16, Card 20, Image 24.
export const RADII = {
  pill: 999,
  card: 20,
  cardLg: 22,
  button: 16,
  tile: 12,
  sheet: 28, // bottom-sheet top corners
  input: 14,
  image: 24,
};

// 07/Buttons spec — per-size height/radius/padding for the shared <Button>
// component (src/components/Button.js). "Width: Auto" per spec — a button
// hugs its label unless <Button fullWidth /> is passed.
export const BUTTON_SIZES = {
  lg: { height: 48, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  md: { height: 40, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  sm: { height: 32, borderRadius: 8, paddingHorizontal: 12, fontSize: 13, gap: 16 },
};

// Mobile Grid spec — reference values for screen layout math (column widths,
// etc). Existing SPACING.screen (20) is untouched for the same reason as
// RADII above; use GRID.margin where a screen is being newly built to spec.
export const GRID = {
  screenWidth: 390,
  screenHeight: 844,
  columns: 4,
  margin: 16,
  gutter: 12,
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
  floatingBrand: shadow('#1e4d45', 9, 22, 0.28, 8),
  floatingNeutral: shadow('#1E1432', 10, 30, 0.14, 10),
  // "06/Shadows" sheet — charcoal-based, named per surface.
  topBar: shadow('#2b2b2b', 2, 6, 0.08, 3),
  component: shadow('#2b2b2b', 1, 4, 0.06, 2),
  modal: shadow('#2b2b2b', 4, 16, 0.16, 8),
  navBar: shadow('#2b2b2b', -4, 12, 0.08, 3),
};

// In ThemeContext.js:
//   import { WARMTH, AURORA } from '../constants/theme-tokens';
//   const colors = isDark ? AURORA : WARMTH;
