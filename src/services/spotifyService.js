/**
 * spotifyService — import a user's musical tastes from their Spotify account.
 *
 * Flow: Authorization Code + PKCE (secure for mobile; no client secret shipped
 * in the app). The UI hook lives in components/ConnectSpotifyButton.js; this
 * module holds the pure helpers: token exchange config, fetching top artists,
 * deriving a compact "music profile" (top artists + top genres), and persisting
 * it on the user's Firestore doc.
 *
 * Privacy note: we intentionally do NOT store Spotify access/refresh tokens.
 * We take a one-time snapshot of tastes; "Refresh" simply re-runs the OAuth
 * consent (Spotify keeps the session, so it's a quick redirect).
 *
 * Setup (user provides):
 *   1. https://developer.spotify.com/dashboard → Create App
 *   2. Copy the Client ID → app.json extra.EXPO_PUBLIC_SPOTIFY_CLIENT_ID
 *   3. Add the redirect URI (SPOTIFY_REDIRECT_URI below) to the app settings
 */
import Constants from "expo-constants";
import { makeRedirectUri } from "expo-auth-session";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const extra = Constants.expoConfig?.extra || {};
export const SPOTIFY_CLIENT_ID =
  extra.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ||
  process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ||
  "";

// Spotify OAuth endpoints.
export const SPOTIFY_DISCOVERY = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

// Only need to read the user's top artists/tracks.
export const SPOTIFY_SCOPES = ["user-top-read", "user-read-email"];

// Custom-scheme redirect for the native build. Must be registered verbatim in
// the Spotify app dashboard (Redirect URIs).
export const SPOTIFY_REDIRECT_URI = makeRedirectUri({
  scheme: "bondvibe",
  path: "spotify-auth",
});

export function isSpotifyConfigured() {
  return !!SPOTIFY_CLIENT_ID;
}

/**
 * Fetch the user's top artists and reduce them to a compact taste profile.
 * @param {string} accessToken Spotify bearer token
 * @return {Promise<{topArtists: Array, topGenres: Array}>}
 */
export async function fetchMusicProfile(accessToken) {
  const res = await fetch(
    "https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`Spotify top artists failed: ${res.status}`);
  }
  const json = await res.json();
  const items = Array.isArray(json.items) ? json.items : [];

  // Top artists (name + image) — keep the first 12.
  const topArtists = items.slice(0, 12).map((a) => ({
    id: a.id,
    name: a.name,
    image: a.images?.[a.images.length - 1]?.url || a.images?.[0]?.url || null,
  }));

  // Aggregate genres across all artists, ranked by frequency, keep top 10.
  const counts = {};
  items.forEach((a) => {
    (a.genres || []).forEach((g) => {
      counts[g] = (counts[g] || 0) + 1;
    });
  });
  const topGenres = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([g]) => g);

  return { topArtists, topGenres };
}

/**
 * Persist the derived music profile on the user's Firestore doc.
 * @param {string} uid user id
 * @param {{topArtists: Array, topGenres: Array}} profile derived tastes
 */
export async function saveMusicProfile(uid, profile) {
  await updateDoc(doc(db, "users", uid), {
    music: {
      spotifyConnected: true,
      topArtists: profile.topArtists || [],
      topGenres: profile.topGenres || [],
      updatedAt: new Date().toISOString(),
    },
    // Mirror genres to a top-level, queryable field for future matching.
    musicGenres: profile.topGenres || [],
    updatedAt: serverTimestamp(),
  });
}

/**
 * Remove the Spotify-derived music profile from the user's doc.
 * @param {string} uid user id
 */
export async function disconnectSpotify(uid) {
  await updateDoc(doc(db, "users", uid), {
    music: { spotifyConnected: false, topArtists: [], topGenres: [] },
    musicGenres: [],
    updatedAt: serverTimestamp(),
  });
}
