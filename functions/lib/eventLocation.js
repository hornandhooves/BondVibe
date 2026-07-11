/**
 * F2 gated-location derivation helpers (server). Pure — no Firebase — so they
 * can be unit-tested without the emulator. Mirrors src/utils/eventLocation.js.
 */

// ~0.01° ≈ 1.1 km. Snap (never per-read jitter) so averaging can't recover the point.
const APPROX_GRID_DEG = 0.01;

function snapApproxGrid(coords) {
  if (!coords ||
      !Number.isFinite(coords.latitude) ||
      !Number.isFinite(coords.longitude)) {
    return null;
  }
  const snap = (v) =>
    Number((Math.round(v / APPROX_GRID_DEG) * APPROX_GRID_DEG).toFixed(4));
  return {latitude: snap(coords.latitude), longitude: snap(coords.longitude)};
}

// `location` is "Venue, City" — the tail is a coarse (city-level) area label,
// the head is the venue name. Never expose the street through `area`.
function deriveArea(location, city) {
  if (typeof location === "string" && location.includes(",")) {
    const tail = location.split(",").pop().trim();
    if (tail) return tail;
  }
  return city || null;
}

function deriveVenue(location) {
  if (typeof location === "string" && location.includes(",")) {
    return location.split(",")[0].trim();
  }
  return (typeof location === "string" && location.trim()) || null;
}

function coordFromData(c) {
  return c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) ?
    {latitude: c.latitude, longitude: c.longitude} : null;
}

function coordsEqual(a, b) {
  return !!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude;
}

module.exports = {
  APPROX_GRID_DEG,
  snapApproxGrid,
  deriveArea,
  deriveVenue,
  coordFromData,
  coordsEqual,
};
