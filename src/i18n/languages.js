/**
 * Canonical language list (kinlo_build/04_I18N_SPEC.md) — the SINGLE source for
 * every place a language is shown or selected: the app language selector AND
 * the event-creation "language" field. Never hardcode a second list.
 *
 * `code` = i18n key + stored value (ISO). `native` = shown to users.
 * `nl` and `nl-BE` share the `nl` translation base; `nl-BE` only overrides
 * strings that differ (Belgian Flemish label + locale for dates/formatting).
 */
export const LANGUAGES = [
  { code: "en", native: "English", english: "English" },
  { code: "es", native: "Español", english: "Spanish" },
  { code: "fr", native: "Français", english: "French" },
  { code: "de", native: "Deutsch", english: "German" },
  { code: "it", native: "Italiano", english: "Italian" },
  { code: "pt", native: "Português", english: "Portuguese" },
  { code: "pl", native: "Polski", english: "Polish" },
  { code: "nl", native: "Nederlands", english: "Dutch (Netherlands)" },
  { code: "nl-BE", native: "Vlaams (België)", english: "Flemish — Belgian variant" },
  { code: "ru", native: "Русский", english: "Russian" },
  { code: "uk", native: "Українська", english: "Ukrainian" },
  { code: "ja", native: "日本語", english: "Japanese" },
  { code: "zh", native: "中文", english: "Chinese" },
  { code: "ko", native: "한국어", english: "Korean" },
];

/** All supported ISO codes (i18next resources + fallback resolution). */
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

/** Map of code → language row, for quick lookup by stored value. */
export const LANGUAGE_BY_CODE = LANGUAGES.reduce((acc, l) => {
  acc[l.code] = l;
  return acc;
}, {});

/** Native display name for a stored code (falls back to the code itself). */
export const nativeName = (code) => LANGUAGE_BY_CODE[code]?.native || code;

/**
 * Same list shaped for the existing dropdown/selector components that expect
 * `{ id, label }` — used by the event-creation "language" field so it offers
 * exactly these 14 without a second hardcoded list.
 */
export const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  id: l.code,
  label: l.native,
}));
