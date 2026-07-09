/**
 * @handle validation — shared by the claim/check Cloud Functions. Charset is
 * letters a–z + underscore ONLY (no digits, no dots — product decision), 3–30
 * chars, must contain a letter, no leading/trailing or doubled underscore.
 * Uniqueness itself is enforced by the reservation-doc transaction, not here.
 */
const {detectProhibitedContent} = require("../contentGuard");

// Impersonation / brand / system terms — one config array (spec §2).
const RESERVED_HANDLES = new Set([
  "admin", "kinlo", "support", "help", "official", "root", "moderator",
  "staff", "team", "security", "about", "settings", "me", "you", "null",
  "undefined", "bondvibe", "system", "mod", "contact", "billing", "payments",
]);

// A small profanity/slur substring screen (contentGuard is payment-only and
// can't flag a handle). Extend as needed; kept deliberately short.
const BLOCKED_SUBSTRINGS = [
  "fuck", "shit", "bitch", "cunt", "nigger", "faggot", "rape", "puta",
  "pendejo", "verga", "chinga", "mierda", "coño", "pinche",
];

const HANDLE_RE = /^[a-z_]{3,30}$/;

/**
 * Lowercase + trim to the canonical comparison form.
 * @param {string} raw
 * @return {string}
 */
function normalizeHandle(raw) {
  return String(raw || "").trim().toLowerCase();
}

/**
 * Validate a handle.
 * @param {string} raw user-entered handle
 * @return {object} { ok, handleLower, error } — error is "format" | "reserved"
 *   | "profane".
 */
function validateHandle(raw) {
  const h = normalizeHandle(raw);
  if (!HANDLE_RE.test(h)) return {ok: false, error: "format"};
  if (!/[a-z]/.test(h)) return {ok: false, error: "format"};
  if (h.startsWith("_") || h.endsWith("_")) return {ok: false, error: "format"};
  if (h.includes("__")) return {ok: false, error: "format"};
  if (RESERVED_HANDLES.has(h)) return {ok: false, error: "reserved"};
  if (BLOCKED_SUBSTRINGS.some((w) => h.includes(w))) {
    return {ok: false, error: "profane"};
  }
  if (detectProhibitedContent(h).flagged) return {ok: false, error: "profane"};
  return {ok: true, handleLower: h};
}

module.exports = {
  RESERVED_HANDLES,
  BLOCKED_SUBSTRINGS,
  HANDLE_RE,
  normalizeHandle,
  validateHandle,
};
