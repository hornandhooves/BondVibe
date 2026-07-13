/**
 * Client-side geocoding (Google Geocoding API). Used when a host types a venue
 * free-text instead of picking a Places suggestion — Google falls back to the
 * city/area centroid for unlisted venues, so a "Venue, City" string still yields
 * usable coordinates so the event can be pinned on the map. Returns null on any
 * failure (the event just stays "not on map").
 */
import Constants from "expo-constants";

const KEY =
  Constants?.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

/**
 * @param {string} address e.g. "Casa Azul, Tulum"
 * @returns {Promise<{latitude:number, longitude:number}|null>}
 */
export const geocodeAddress = async (address) => {
  if (!address || !address.trim() || !KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address.trim(),
    )}&key=${KEY}`;
    const res = await fetch(url);
    const body = await res.json();
    const loc = body?.results?.[0]?.geometry?.location;
    if (body?.status === "OK" && loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      return { latitude: loc.lat, longitude: loc.lng };
    }
  } catch (_e) {
    /* network / API error → null */
  }
  return null;
};
