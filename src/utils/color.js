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
