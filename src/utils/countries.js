/**
 * Country dial codes for the phone-number picker. Flags are derived from the
 * ISO code (regional-indicator emoji) so we don't ship image assets. Add more
 * countries here — this is the single source for every phone field.
 */

/** Emoji flag from an ISO 3166-1 alpha-2 code, e.g. "MX" → 🇲🇽 */
export const flagEmoji = (iso) =>
  (iso || "")
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

// { code: ISO-2, dial: "+NN", name }. Ordered with the most relevant markets
// for BondVibe (Mexico default) near the top, then alphabetical-ish.
export const COUNTRIES = [
  { code: "MX", dial: "+52", name: "Mexico" },
  { code: "US", dial: "+1", name: "United States" },
  { code: "CA", dial: "+1", name: "Canada" },
  { code: "AR", dial: "+54", name: "Argentina" },
  { code: "BR", dial: "+55", name: "Brazil" },
  { code: "CL", dial: "+56", name: "Chile" },
  { code: "CO", dial: "+57", name: "Colombia" },
  { code: "CR", dial: "+506", name: "Costa Rica" },
  { code: "GT", dial: "+502", name: "Guatemala" },
  { code: "PE", dial: "+51", name: "Peru" },
  { code: "PA", dial: "+507", name: "Panama" },
  { code: "EC", dial: "+593", name: "Ecuador" },
  { code: "UY", dial: "+598", name: "Uruguay" },
  { code: "PY", dial: "+595", name: "Paraguay" },
  { code: "BO", dial: "+591", name: "Bolivia" },
  { code: "VE", dial: "+58", name: "Venezuela" },
  { code: "DO", dial: "+1", name: "Dominican Republic" },
  { code: "PR", dial: "+1", name: "Puerto Rico" },
  { code: "CU", dial: "+53", name: "Cuba" },
  { code: "HN", dial: "+504", name: "Honduras" },
  { code: "NI", dial: "+505", name: "Nicaragua" },
  { code: "SV", dial: "+503", name: "El Salvador" },
  { code: "BZ", dial: "+501", name: "Belize" },
  { code: "ES", dial: "+34", name: "Spain" },
  { code: "GB", dial: "+44", name: "United Kingdom" },
  { code: "FR", dial: "+33", name: "France" },
  { code: "DE", dial: "+49", name: "Germany" },
  { code: "IT", dial: "+39", name: "Italy" },
  { code: "PT", dial: "+351", name: "Portugal" },
  { code: "NL", dial: "+31", name: "Netherlands" },
  { code: "BE", dial: "+32", name: "Belgium" },
  { code: "CH", dial: "+41", name: "Switzerland" },
  { code: "AT", dial: "+43", name: "Austria" },
  { code: "IE", dial: "+353", name: "Ireland" },
  { code: "SE", dial: "+46", name: "Sweden" },
  { code: "NO", dial: "+47", name: "Norway" },
  { code: "DK", dial: "+45", name: "Denmark" },
  { code: "FI", dial: "+358", name: "Finland" },
  { code: "PL", dial: "+48", name: "Poland" },
  { code: "CZ", dial: "+420", name: "Czechia" },
  { code: "GR", dial: "+30", name: "Greece" },
  { code: "RO", dial: "+40", name: "Romania" },
  { code: "RU", dial: "+7", name: "Russia" },
  { code: "TR", dial: "+90", name: "Turkey" },
  { code: "IL", dial: "+972", name: "Israel" },
  { code: "AE", dial: "+971", name: "United Arab Emirates" },
  { code: "SA", dial: "+966", name: "Saudi Arabia" },
  { code: "ZA", dial: "+27", name: "South Africa" },
  { code: "EG", dial: "+20", name: "Egypt" },
  { code: "MA", dial: "+212", name: "Morocco" },
  { code: "IN", dial: "+91", name: "India" },
  { code: "CN", dial: "+86", name: "China" },
  { code: "JP", dial: "+81", name: "Japan" },
  { code: "KR", dial: "+82", name: "South Korea" },
  { code: "TH", dial: "+66", name: "Thailand" },
  { code: "ID", dial: "+62", name: "Indonesia" },
  { code: "PH", dial: "+63", name: "Philippines" },
  { code: "VN", dial: "+84", name: "Vietnam" },
  { code: "MY", dial: "+60", name: "Malaysia" },
  { code: "SG", dial: "+65", name: "Singapore" },
  { code: "AU", dial: "+61", name: "Australia" },
  { code: "NZ", dial: "+64", name: "New Zealand" },
];

export const DEFAULT_COUNTRY =
  COUNTRIES.find((c) => c.code === "MX") || COUNTRIES[0];

/**
 * Split a stored E.164-ish string ("+52551234567") into { country, number }.
 * Falls back to the default country when no dial code is recognised.
 */
export const parsePhone = (value) => {
  const raw = (value || "").trim();
  if (raw.startsWith("+")) {
    // Longest dial code first so "+1" doesn't shadow "+52", etc.
    const byLen = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    const match = byLen.find((c) => raw.startsWith(c.dial));
    if (match) {
      return { country: match, number: raw.slice(match.dial.length) };
    }
  }
  return { country: DEFAULT_COUNTRY, number: raw.replace(/^\+/, "") };
};
