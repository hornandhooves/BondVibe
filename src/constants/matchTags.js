/**
 * Matchmaking v2 — structured tag catalogs (P0).
 *
 * Everything a match profile carries beyond free text is a FIXED catalog id
 * (never free text, never an emoji): the UI renders each id via i18n + a Kinlo
 * icon (src/components/Icon.js — lucide-backed, monochrome, in-house style — NOT
 * a system icon or emoji). Each funny tag maps to its own illustrated glyph +
 * a match-type accent colour.
 */

// Funny tags — fixed catalog. `icon` is a registered Icon.js name; `type` picks
// the accent from MATCH_TYPE_COLORS (friend/professional/romantic/brand).
export const FUNNY_TAGS = [
  { id: "trouble_junky", icon: "flame", type: "romantic" },
  { id: "wild_runner", icon: "footprints", type: "friend" },
  { id: "infinite_meditator", icon: "flower", type: "brand" },
  { id: "coffee_addict", icon: "coffee", type: "friend" },
  { id: "night_owl", icon: "moon", type: "professional" },
  { id: "book_worm", icon: "books", type: "professional" },
  { id: "taco_hunter", icon: "food", type: "romantic" },
  { id: "dance_floor_regular", icon: "dance", type: "romantic" },
  { id: "cliff_chaser", icon: "hiking", type: "friend" },
  { id: "dog_person", icon: "dog", type: "friend" },
];
export const FUNNY_TAG_IDS = FUNNY_TAGS.map((t) => t.id);
export const funnyTag = (id) => FUNNY_TAGS.find((t) => t.id === id) || null;

// Structured interests (controlled vocabulary → interest-overlap scoring in P1).
export const INTERESTS = [
  "music", "travel", "fitness", "food", "art", "gaming", "reading", "movies",
  "photography", "hiking", "yoga", "tech", "fashion", "cooking", "sports",
  "dancing", "coffee", "nature", "volunteering", "startups",
];

// Languages (ISO-ish ids → i18n label).
export const LANGUAGES = ["es", "en", "pt", "fr", "de", "it", "zh", "ja", "ko"];

// Things they're currently learning.
export const LEARNING = [
  "language", "instrument", "coding", "cooking", "art", "sport", "business", "mindfulness",
];

// Professional-mode industries (for pro.industry).
export const INDUSTRIES = [
  "tech", "design", "finance", "health", "education", "marketing",
  "hospitality", "arts", "legal", "realestate", "nonprofit", "other",
];

// Energy — two axes, each 0–100 (default 50 = neutral).
//   adventure: chill(0) ↔ adventurous(100)
//   social:    introvert(0) ↔ extrovert(100)
export const ENERGY_AXES = ["adventure", "social"];
export const DEFAULT_ENERGY = { adventure: 50, social: 50 };

// Group preference.
export const GROUP_PREFS = ["one_on_one", "small_group", "group"];

/**
 * Is a match profile "complete" enough to participate in v2 (the gate)? Requires
 * the core structured signals — not just the legacy bio/lookingFor. Pure +
 * testable; the SAME rule is mirrored server-side (rules) via the matchmaking
 * state the client writes.
 * @param {object} [p] a match profile
 * @returns {boolean}
 */
export function isProfileComplete(p) {
  if (!p) return false;
  const arr = (v) => (Array.isArray(v) ? v : []);
  const energyOk = !!(
    p.energy &&
    typeof p.energy.adventure === "number" &&
    typeof p.energy.social === "number"
  );
  return Boolean(
    arr(p.lookingFor).length >= 1 &&
      arr(p.interests).length >= 3 &&
      arr(p.funnyTags).length >= 1 &&
      energyOk &&
      GROUP_PREFS.includes(p.groupPref)
  );
}

/** Keep only valid ids from a catalog (drops free text / unknowns). */
export const sanitizeIds = (ids, catalogIds) => {
  const set = new Set(catalogIds);
  return arrayUnique(arr(ids).filter((x) => set.has(x)));
};
const arr = (v) => (Array.isArray(v) ? v : []);
const arrayUnique = (a) => [...new Set(a)];
