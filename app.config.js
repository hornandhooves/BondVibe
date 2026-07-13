// Dynamic Expo config. Everything lives in app.json; this file only injects the
// billable Google Maps keys from the environment (.env, gitignored, or EAS env
// vars) so they never sit in the committed public repo.
//
//   EXPO_PUBLIC_GOOGLE_PLACES_API_KEY → Places + Geocoding (client web calls)
//   GOOGLE_MAPS_ANDROID_API_KEY       → native Google Maps SDK on Android
//
// iOS uses Apple Maps (no key needed), so there is no iOS maps key here. See
// .env.example for the required variables and the Cloud Console restrictions.
const appJson = require("./app.json");
const expo = appJson.expo;

const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || "";

module.exports = () => ({
  ...expo,
  extra: {
    ...expo.extra,
    // Read at runtime via Constants.expoConfig.extra (PlaceAutocomplete, geocode).
    EXPO_PUBLIC_GOOGLE_PLACES_API_KEY:
      process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || null,
  },
  android: {
    ...expo.android,
    config: {
      ...expo.android?.config,
      // Only attach the maps config when a key is present, so a missing key
      // degrades to our in-app "Map unavailable" guard instead of a prebuild
      // error or a silently-broken (gray) map.
      ...(androidMapsKey ? { googleMaps: { apiKey: androidMapsKey } } : {}),
    },
  },
});
