/**
 * Small geo helpers for the F1 map — pure, unit-testable.
 */

const toRad = (d) => (d * Math.PI) / 180;

/**
 * Great-circle (haversine) distance in km between two {latitude, longitude}.
 * @returns {number|null} km, or null if either point is missing/invalid.
 */
export const haversineKm = (a, b) => {
  if (
    !a || !b ||
    !Number.isFinite(a.latitude) || !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)
  ) {
    return null;
  }
  const R = 6371; // Earth radius km
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Human label for a distance: "2.4 km" / "800 m". null → "". */
export const formatDistanceKm = (km) => {
  if (km == null || !Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
};
