/**
 * ConnectSpotifyPlaylistButton — KIN-199. The host connects Spotify once and
 * picks one of their own playlists for the group, instead of pasting a link.
 *
 * Deliberately knows NOTHING about Firestore or hostGroups: it hands the chosen
 * playlist's public URL to `onSelect` and that's the end of its job. That's what
 * keeps it usable anywhere a Spotify playlist URL is wanted, and what keeps the
 * screen in charge of persistence.
 *
 * It reuses the OAuth PATTERN of ConnectSpotifyButton (taste-import) but not its
 * code or its scopes — see SPOTIFY_GROUP_SCOPES. The two flows share the
 * registered redirect URI; each useAuthRequest keeps its own codeVerifier and
 * response, so they never cross.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  FlatList,
  Image,
} from "react-native";
import { useAuthRequest, exchangeCodeAsync } from "expo-auth-session";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import { useTheme } from "../contexts/ThemeContext";
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_DISCOVERY,
  SPOTIFY_GROUP_SCOPES,
  SPOTIFY_REDIRECT_URI,
  isSpotifyConfigured,
  fetchUserPlaylists,
} from "../services/spotifyService";

const SPOTIFY_GREEN = "#1DB954";

export default function ConnectSpotifyPlaylistButton({ onSelect, disabled }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [error, setError] = useState("");

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SPOTIFY_GROUP_SCOPES,
      usePKCE: true,
      redirectUri: SPOTIFY_REDIRECT_URI,
    },
    SPOTIFY_DISCOVERY
  );

  // The redirect came back with a code: exchange it (PKCE) and load playlists.
  useEffect(() => {
    if (response?.type !== "success" || !request?.codeVerifier) return;
    const code = response.params?.code;
    if (!code) return;

    (async () => {
      setBusy(true);
      setError("");
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
        const rows = await fetchUserPlaylists(tokenResult.accessToken);
        setPlaylists(rows);
        setOpen(true);
      } catch (e) {
        // Surfaced in the sheet rather than an Alert so the exact reason stays
        // on screen — an OAuth/API failure here is usually a config problem.
        setError(e?.message || t("groupManage.spotifyPicker.genericError"));
        setOpen(true);
      } finally {
        // Never leave the spinner stuck, whatever happened (CLAUDE.md §7).
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const handleConnect = useCallback(async () => {
    if (!isSpotifyConfigured()) {
      setError(t("groupManage.spotifyPicker.notConfigured"));
      setOpen(true);
      return;
    }
    setError("");
    await promptAsync();
  }, [promptAsync, t]);

  const choose = (p) => {
    setOpen(false);
    onSelect?.(p.externalUrl);
  };

  const s = createStyles(colors);

  return (
    <>
      <TouchableOpacity
        style={[s.connectBtn, (busy || disabled || !request) && { opacity: 0.6 }]}
        onPress={handleConnect}
        disabled={busy || disabled || !request}
        activeOpacity={0.85}
        testID="spotify-pick-playlist"
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Icon name="music2" size={18} color="#fff" />
            <Text style={s.connectText}>
              {t("groupManage.spotifyPicker.cta")}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={s.backdrop}>
          <View style={[s.sheet, { backgroundColor: colors.background }]}>
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>
                {t("groupManage.spotifyPicker.title")}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} testID="spotify-picker-close">
                <Icon name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {error ? (
              <Text style={[s.stateText, { color: colors.textSecondary }]}>
                {error}
              </Text>
            ) : playlists.length === 0 ? (
              <Text style={[s.stateText, { color: colors.textSecondary }]}>
                {t("groupManage.spotifyPicker.empty")}
              </Text>
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(p) => p.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[s.row, { borderColor: colors.border }]}
                    onPress={() => choose(item)}
                    activeOpacity={0.8}
                    testID={`spotify-playlist-${item.id}`}
                  >
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={s.cover} />
                    ) : (
                      <View style={[s.cover, { backgroundColor: colors.surfaceGlass }]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowName, { color: colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[s.rowMeta, { color: colors.textTertiary }]}>
                        {t("groupManage.spotifyPicker.trackCount", { count: item.tracksTotal })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    connectBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: SPOTIFY_GREEN,
      borderRadius: 14,
      paddingVertical: 12,
      gap: 8,
    },
    connectText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: {
      maxHeight: "75%",
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: 20,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    sheetTitle: { fontSize: 18, fontWeight: "700" },
    stateText: { fontSize: 14, lineHeight: 20, paddingVertical: 18 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
    cover: { width: 48, height: 48, borderRadius: 8 },
    rowName: { fontSize: 15, fontWeight: "600" },
    rowMeta: { fontSize: 12, marginTop: 2 },
  });
}
