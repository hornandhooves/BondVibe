/**
 * Date/time formatting that follows the app's language, from one place (KQA-002).
 *
 * The bug was scattered, inconsistent locales: DateField hardcoded "es-MX" while
 * dateUtils hardcoded "en-US", so the same app showed dates two ways depending
 * on the screen, and neither followed the UI language. This is the single source
 * of truth — the ONLY place a locale literal should live.
 */
import i18n from "../i18n";

/** Map an i18n language ('en', 'es', 'es-MX'…) to a full locale for toLocale*. */
const localeFor = (lng = i18n.language) =>
  String(lng).startsWith("es") ? "es-MX" : "en-US";

/**
 * @param {Date|string|number} d
 * @param {Intl.DateTimeFormatOptions} [opts]
 * @param {string} [lng] override the app language (mainly for tests)
 * @returns {string}
 */
export const formatDate = (d, opts = { day: "numeric", month: "short", year: "numeric" }, lng) =>
  new Date(d).toLocaleDateString(localeFor(lng), opts);

/**
 * @param {Date|string|number} d
 * @param {Intl.DateTimeFormatOptions} [opts]
 * @param {string} [lng]
 * @returns {string}
 */
export const formatTime = (d, opts = { hour: "numeric", minute: "2-digit" }, lng) =>
  new Date(d).toLocaleTimeString(localeFor(lng), opts);
