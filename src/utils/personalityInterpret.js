/**
 * Big Five interpretation — DETERMINISTIC. Each dimension's 0-100 score maps to a
 * band (low / mid / high) and each (dimension × band) has one fixed, human-written
 * phrase in i18n. No AI is involved here: the bands and the copy are static, so a
 * user always gets the same reading for the same score.
 *
 * The optional AI summary (personality_summary) only *synthesizes* what these
 * bands already say — and when it's unavailable, the UI shows these descriptors
 * alone rather than inventing anything.
 *
 * Bands: low < 40 · mid 40-60 (inclusive) · high > 60.
 */
import { PERSONALITY_DIMENSIONS } from "./personalityQuiz";

/** The five dimension keys, in display order. */
export const BIG_FIVE_KEYS = Object.keys(PERSONALITY_DIMENSIONS);

export const BAND_LOW_MAX = 40; // score < 40  → low
export const BAND_MID_MAX = 60; // 40..60      → mid  · > 60 → high

/**
 * @param {number} score 0-100
 * @returns {"low"|"mid"|"high"|null} null when the score isn't a usable number
 */
export function bandFor(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score < BAND_LOW_MAX) return "low";
  if (score <= BAND_MID_MAX) return "mid";
  return "high";
}

/** Clamp a raw score into the 0-100 the bars render. */
export const clampScore = (n) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;

/**
 * Full reading for a Big Five profile — ALWAYS the five dimensions, in order, so
 * the card can't silently show a partial personality.
 * @param {object} [personality] { OPENNESS, CONSCIENTIOUSNESS, ... } 0-100
 * @returns {Array<{key,score,band,labelKey,textKey}>} one entry per dimension
 *   (band/textKey are null when that dimension has no usable score)
 */
export function interpretBigFive(personality) {
  const p = personality || {};
  return BIG_FIVE_KEYS.map((key) => {
    const raw = p[key];
    const band = bandFor(raw);
    return {
      key,
      score: clampScore(raw),
      band,
      labelKey: `personalityQuiz.dimensions.${key}.title`,
      textKey: band ? `personalityQuiz.interpret.${key}.${band}` : null,
      bandLabelKey: band ? `personalityQuiz.band.${band}` : null,
    };
  });
}

/**
 * Is this profile complete enough to interpret? Requires every dimension to be a
 * usable number — a partial quiz gets the honest empty state, not a half reading.
 * @param {object} [personality]
 * @returns {boolean}
 */
export function isInterpretable(personality) {
  const p = personality || {};
  return BIG_FIVE_KEYS.every((k) => typeof p[k] === "number" && Number.isFinite(p[k]));
}
