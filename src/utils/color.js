/**
 * darkenHex — shades a #rrggbb color toward black by `amount` (0-1).
 * Used for pressed/active button states per the design system's
 * Default → Pressed pattern (a darker fill, not an opacity fade).
 */
export function darkenHex(hex, amount = 0.2) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const shade = (c) => Math.round(c * (1 - amount)).toString(16).padStart(2, '0');
  return `#${shade(r)}${shade(g)}${shade(b)}`;
}

/**
 * toAndroidColor — convert a colour to the #AARRGGBB form Android accepts.
 *
 * React Native parses colours itself, so `rgba(43, 43, 43, 0.42)` works fine in
 * JSX. Some native SDKs don't: @stripe/stripe-react-native hands `cardStyle`
 * straight to android.graphics.Color.parseColor, which takes only #RRGGBB /
 * #AARRGGBB and a few names. An rgba() string there throws
 * `IllegalArgumentException: Unknown color` while the view is being built, and
 * the app dies before the card form appears (KIN-210).
 *
 * A boundary converter, not a styling helper: use it on colours handed to a
 * native prop that documents hex, not on ordinary styles.
 */
const clamp255 = (n) => Math.max(0, Math.min(255, n));
const hex2 = (n) => clamp255(Math.round(n)).toString(16).padStart(2, "0");

const RGB_RE = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/**
 * Convert a colour string to the #AARRGGBB form Android's parseColor accepts.
 *
 * Alpha goes FIRST — Android's format is ARGB, not the RGBA that CSS uses, and
 * swapping them silently produces a wrong-but-parseable colour rather than an
 * error, which is worse than a crash.
 *
 * Anything already parseable (hex, or a named colour) is returned untouched, so
 * this is safe to wrap around a value whose format you don't control.
 *
 * @param {string} color e.g. "rgba(43, 43, 43, 0.42)", "#2b2b2b", "red"
 * @returns {string} "#AARRGGBB" for rgb/rgba input, the input unchanged otherwise
 */
export function toAndroidColor(color) {
  if (typeof color !== "string") return color;
  const m = RGB_RE.exec(color.trim());
  if (!m) return color;

  const r = parseFloat(m[1]);
  const g = parseFloat(m[2]);
  const b = parseFloat(m[3]);
  // A missing alpha means fully opaque, not transparent.
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return color;

  return `#${hex2(a * 255)}${hex2(r)}${hex2(g)}${hex2(b)}`;
}
