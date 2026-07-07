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

/**
 * UI languages actually translated today. The app's own language selector
 * (Welcome/auth/Settings) offers only these — showing a code that falls back
 * to English would be confusing. The event-creation "language" field (what
 * language the HOST will run the event in) still offers the full 14-row
 * LANGUAGES list above, since that's independent of the app's UI language.
 * Add a code here once its locale JSON is translated end to end.
 */
export const APP_LANGUAGE_CODES = ["en", "es"];
export const APP_LANGUAGES = LANGUAGES.filter((l) =>
  APP_LANGUAGE_CODES.includes(l.code)
);

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
