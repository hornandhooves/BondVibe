/**
 * The i18n key for the Home greeting, by hour of day (KQA-001).
 *
 * Pulled out of HomeScreen so the band logic is unit-testable — the bug was that
 * 00:00–04:59 fell into "morning" (`hour < 12`), greeting someone "Good morning"
 * at 2 a.m. Night now owns both the late evening and the small hours.
 *
 * Bands: 05–11 morning · 12–17 afternoon · 18–04 night.
 *
 * @param {number} hour 0–23 (from `new Date().getHours()`)
 * @returns {string} an i18n key under `home.*`
 */
export function getGreetingKey(hour) {
  if (hour >= 5 && hour < 12) return "home.greetingMorning";
  if (hour >= 12 && hour < 18) return "home.greetingAfternoon";
  return "home.greetingNight";
}
