/**
 * ConnectSpotifyButton — runs the Spotify OAuth (PKCE) flow and imports the
 * user's musical tastes (top artists + genres) onto their profile.
 *
 * Renders the "Connect Spotify" CTA plus, once connected, the imported genre
 * chips and a small "Refresh / Disconnect" row. Requires
 * EXPO_PUBLIC_SPOTIFY_CLIENT_ID (see services/spotifyService.js for setup).
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  useAuthRequest,
  exchangeCodeAsync,
} from "expo-auth-session";
import { Music2 } from "lucide-react-native";
import { useTheme } from "../contexts/ThemeContext";
import { auth } from "../services/firebase";
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_DISCOVERY,
  SPOTIFY_SCOPES,
  SPOTIFY_REDIRECT_URI,
  isSpotifyConfigured,
  fetchMusicProfile,
  saveMusicProfile,
  disconnectSpotify,
} from "../services/spotifyService";

export default function ConnectSpotifyButton({ music, onChange }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SPOTIFY_SCOPES,
      usePKCE: true,
      redirectUri: SPOTIFY_REDIRECT_URI,
    },
    SPOTIFY_DISCOVERY
  );

  // When the OAuth redirect returns with a code, exchange it (PKCE) and import.
  useEffect(() => {
    if (response?.type !== "success" || !request?.codeVerifier) return;
    const code = response.params?.code;
    if (!code) return;

    (async () => {
      setBusy(true);
      try {
        const tokenResult = await exchangeCodeAsync(
          {
            clientId: SPOTIFY_CLIENT_ID,
            code,
            redirectUri: SPOTIFY_REDIRECT_URI,
            extraParams: { code_verifier: request.codeVerifier },
          },
          SPOTIFY_DISCOVERY
        );
        const profile = await fetchMusicProfile(tokenResult.accessToken);
        await saveMusicProfile(auth.currentUser.uid, profile);
        onChange?.({ spotifyConnected: true, ...profile });
      } catch (e) {
        console.warn("Spotify connect error:", e?.message);
        Alert.alert(
          "Spotify",
          "We couldn't import your music right now. Please try again."
        );
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const handleConnect = async () => {
    if (!isSpotifyConfigured()) {
      Alert.alert(
        "Coming soon",
        "Spotify import isn't enabled yet. Check back shortly."
      );
      return;
    }
    await promptAsync();
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectSpotify(auth.currentUser.uid);
      onChange?.({ spotifyConnected: false, topArtists: [], topGenres: [] });
    } catch (e) {
      console.warn("Spotify disconnect error:", e?.message);
    } finally {
      setBusy(false);
    }
  };

  const styles = createStyles(colors);
  const connected = !!music?.spotifyConnected;
  const genres = music?.topGenres || [];

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Music2 size={18} color="#1DB954" />
        <Text style={styles.title}>Music taste</Text>
      </View>

      {connected && genres.length > 0 && (
        <View style={styles.chips}>
          {genres.map((g) => (
            <View key={g} style={styles.chip}>
              <Text style={styles.chipText}>{g}</Text>
            </View>
          ))}
        </View>
      )}

      {connected ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handleConnect}
            disabled={busy || !request}
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>Refresh</Text>
          </TouchableOpacity>
          <Text style={styles.dot}>·</Text>
          <TouchableOpacity onPress={handleDisconnect} disabled={busy}>
            <Text style={[styles.linkText, { color: colors.textSecondary }]}>
              Disconnect
            </Text>
          </TouchableOpacity>
          {busy && (
            <ActivityIndicator
              size="small"
              color="#1DB954"
              style={{ marginLeft: 8 }}
            />
          )}
        </View>
      ) : (
        <TouchableOpacity
          style={styles.connectBtn}
          onPress={handleConnect}
          disabled={busy || !request}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Music2 size={18} color="#fff" />
              <Text style={styles.connectText}>Connect Spotify</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrapper: { marginTop: 4 },
    headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    title: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginLeft: 8,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
    chip: {
      backgroundColor: "#1DB95420",
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
      marginBottom: 8,
    },
    chipText: { color: "#1DB954", fontSize: 13, fontWeight: "600" },
    connectBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#1DB954",
      borderRadius: 14,
      paddingVertical: 12,
      gap: 8,
    },
    connectText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    actionsRow: { flexDirection: "row", alignItems: "center" },
    linkBtn: {},
    linkText: { color: "#1DB954", fontSize: 14, fontWeight: "600" },
    dot: { marginHorizontal: 8, color: colors.textSecondary },
  });
}
