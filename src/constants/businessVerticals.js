/**
 * businessVerticals — Kinlo for Business is ALL-VERTICAL (kinlo_business/01 §8).
 * A vertical preset swaps LABELS + DEFAULTS only, never the data model. All the
 * user-facing nouns/labels live in i18n (`business.verticals.<id>.*`) so they
 * localize to EN/ES; this file is just the ordered id list + helpers.
 *
 * Copy stays generic everywhere else ("members / sessions / packages"); the
 * preset only changes what a "session" is called (class / session / tour …) and
 * seeds a few suggested tags. Never hardcode "dance/alumno/clase".
 */
export const VERTICAL_IDS = [
  "dance",
  "gym",
  "yoga",
  "retreat",
  "school",
  "coaching",
  "tours",
  "nightlife",
  "community",
  "events",
  "other",
];

export const DEFAULT_VERTICAL = "other";

const safe = (id) => (VERTICAL_IDS.includes(id) ? id : DEFAULT_VERTICAL);

/** i18n key for a vertical's display label (setup picker + business header). */
export const verticalLabelKey = (id) => `business.verticals.${safe(id)}.label`;

/** i18n key returning the vertical's suggested tags array (returnObjects). */
export const verticalTagsKey = (id) => `business.verticals.${safe(id)}.tags`;

/** i18n key for the vertical's word for a unit of activity (class/session/…). */
export const sessionNounKey = (id) => `business.verticals.${safe(id)}.sessionNoun`;
