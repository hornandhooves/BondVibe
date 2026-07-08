/**
 * Event search keywords (kinlo_business/07 FIX 9). Discovery/Search filters
 * `events` with `where("searchKeywords", "array-contains", token)`. That field is
 * also maintained by the onEventWritten Cloud Function, but writing it at
 * creation makes a public event searchable IMMEDIATELY (and robust if the
 * trigger lags). This mirrors the server's algorithm EXACTLY so the trigger sees
 * no change and never does a redundant write.
 *
 * @param {{title?:string, location?:string, city?:string, category?:string}} data
 * @returns {string[]} prefix tokens (2..14 chars), capped at 80
 */
export function buildEventSearchKeywords(data = {}) {
  const text = [data.title, data.location, data.city, data.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const words = text.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  const set = new Set();
  for (const w of words) {
    const max = Math.min(w.length, 14);
    for (let n = 2; n <= max; n++) set.add(w.slice(0, n));
  }
  return Array.from(set).slice(0, 80);
}
