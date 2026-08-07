/**
 * KIN-151 — a shared guard against the NaN-passes-validation bug: comparing
 * NaN with `<=`/`>` is ALWAYS false, so a bare `parseFloat(v) <= 0` (or
 * `parseInt`) on invalid input — a lone ".", "..", "abc" — silently PASSES
 * validation instead of failing it, and the NaN itself can end up persisted
 * to Firestore (which accepts it as a valid double, no write error). Use
 * `parsePositiveNumber` anywhere user text needs to become a positive
 * number instead of a bare parse + comparison.
 */

/**
 * Parse user-entered text into a finite, strictly positive number.
 * @param {*} v raw input (typically a TextInput's string value)
 * @return {number|null} the validated number, or null if invalid/non-positive
 */
export function parsePositiveNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Reject keystrokes that can never become a valid positive number — a lone
 * decimal separator, a second one, or a non-digit character — at the
 * onChangeText level, before the invalid text ever reaches state. Letting a
 * field go through a submit-time alert for "." is worse UX than never
 * accepting the keystroke that produced it. Allows an in-progress empty or
 * partial value ("", "12.", "12.5") so the user can keep typing/backspacing.
 * @param {string} text candidate TextInput value after the keystroke
 * @return {boolean} true if `text` is still a valid in-progress number
 */
export function isValidNumberInProgress(text) {
  // Empty, OR digits with an optional trailing decimal ("12", "12.", "12.5"),
  // OR a decimal point with digits after it (".5") — but NOT a bare "."
  // (zero digits on both sides), which is the exact bug this guards against.
  return /^(\d+\.?\d*|\.\d+)?$/.test(text);
}
