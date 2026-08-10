/**
 * CreatePostScreen — compose a post (text + optional photos). Photos upload to
 * Storage under the author's uid; then the post doc is written.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import GradientBackground from "../components/GradientBackground";
import { useTheme } from "../contexts/ThemeContext";
import { auth } from "../services/firebase";
import { createPost } from "../services/postService";
import { addMoment } from "../services/momentService";
import { uploadPostImage } from "../services/storageService";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const MAX_PHOTOS = 4;
/** Below this many characters we don't call iTunes at all — the API allows
 *  roughly 20 requests/minute and one- or two-letter queries are worthless
 *  anyway. Paired with the 400ms debounce, a typed word costs one request. */
const SONG_QUERY_MIN = 2;

export default function CreatePostScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  // Wall v2 (P2): posting to a community (only members reach here; the host can
  // opt to post AS the community).
  const { communityId = null, communityName, canHostPost = false, presetMoment = false } = route?.params || {};
  const [text, setText] = useState("");
  const [images, setImages] = useState([]); // local uris (carousel-capable)
  const [video, setVideo] = useState(null); // { uri } — mediaType "video"
  const [asHost, setAsHost] = useState(false);
  const [asMoment, setAsMoment] = useState(!!presetMoment);
  const [posting, setPosting] = useState(false);
  // Attached song (KIN-201) — metadata from iTunes Search, never audio.
  const [song, setSong] = useState(null);
  const [songPicker, setSongPicker] = useState(false);
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState([]);
  const [songSearching, setSongSearching] = useState(false);
  const debouncedSongQuery = useDebouncedValue(songQuery, 400);

  useEffect(() => {
    const q = debouncedSongQuery.trim();
    if (q.length < SONG_QUERY_MIN) {
      setSongResults([]);
      return;
    }
    let alive = true;
    (async () => {
      // The flag is set inside the async body so it sits under the same
      // try/finally that clears it — outside, a throw would strand the
      // spinner forever (CLAUDE.md §7).
      setSongSearching(true);
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8`
        );
        const json = await res.json();
        if (!alive) return;
        setSongResults(
          (json.results || []).map((s) => ({
            trackId: s.trackId,
            trackName: s.trackName,
            artistName: s.artistName,
            previewUrl: s.previewUrl ?? null,
            artworkUrl100: s.artworkUrl100 ?? null,
            trackViewUrl: s.trackViewUrl ?? null,
          }))
        );
      } catch (_e) {
        // A failed lookup just means no suggestions — never block composing.
        if (alive) setSongResults([]);
      } finally {
        if (alive) setSongSearching(false);
      }
    })();
    return () => { alive = false; };
  }, [debouncedSongQuery]);

  // A Moment is a single piece of ephemeral media and never reaches createPost,
  // so an attached song would be silently dropped. Drop it explicitly instead,
  // and hide the picker while the toggle is on.
  const toggleMoment = () => {
    setAsMoment((v) => !v);
    setSong(null);
  };

  const chooseSong = (s) => {
    setSong(s);
    setSongPicker(false);
    setSongQuery("");
    setSongResults([]);
  };

  const pick = async () => {
    if (images.length >= MAX_PHOTOS) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("createPost.permissionNeededTitle"), t("createPost.permissionNeededMessage"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]) {
      setImages((cur) => [...cur, res.assets[0].uri].slice(0, MAX_PHOTOS));
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("createPost.permissionNeededTitle"), t("createPost.permissionNeededMessage"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]) {
      setVideo({ uri: res.assets[0].uri });
      setImages([]); // a post is either a video or images
    }
  };

  const submit = async () => {
    if (!text.trim() && images.length === 0 && !video) return;
    setPosting(true);
    try {
      const uid = auth.currentUser.uid;
      const mediaType = video ? "video" : images.length > 1 ? "carousel" : "photo";

      // Moment (ephemeral 24h) — a single piece of media, uploaded via the same
      // pipeline. addMoment handles the upload + expiresAt.
      if (asMoment) {
        const localUri = video ? video.uri : images[0];
        if (!localUri) throw new Error(t("createPost.failed"));
        const r = await addMoment(localUri, video ? "video" : "photo");
        if (!r.success) throw new Error(r.error || t("createPost.failed"));
        navigation.goBack();
        return;
      }

      const urls = [];
      if (video) urls.push(await uploadPostImage(uid, video.uri));
      else for (const uri of images) urls.push(await uploadPostImage(uid, uri));
      const r = await createPost({
        text,
        mediaUrls: urls,
        mediaType,
        communityId,
        isHostPost: canHostPost && asHost,
        music: song
          ? {
            trackId: song.trackId,
            trackName: song.trackName,
            artistName: song.artistName,
            previewUrl: song.previewUrl,
            artworkUrl100: song.artworkUrl100,
            trackViewUrl: song.trackViewUrl,
          }
          : null,
      });
      if (!r.success) throw new Error(r.error || t("createPost.failed"));
      navigation.goBack();
    } catch (e) {
      Alert.alert(t("createPost.couldntPostTitle"), e.message || t("createPost.tryAgain"));
    } finally {
      setPosting(false);
    }
  };

  const styles = createStyles(colors);
  const canPost = (text.trim() || images.length > 0 || !!video) && !posting;

  return (
    <GradientBackground>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t("createPost.title")}</Text>
        <TouchableOpacity
          testID="create-post-submit"
          onPress={submit}
          disabled={!canPost}
          style={[styles.postBtn, { backgroundColor: colors.primary, opacity: canPost ? 1 : 0.5 }]}
        >
          {posting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.postTxt}>{t("createPost.postButton")}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!!communityId && (
          <View style={[styles.ctxBanner, { backgroundColor: colors.brandSoft }]}>
            <Icon name="community" size={15} color={colors.primary} />
            <Text style={[styles.ctxText, { color: colors.primary }]} numberOfLines={1}>
              {t("wall.compose.postTo", { name: communityName || "" })}
            </Text>
          </View>
        )}
        {canHostPost && !asMoment && (
          <TouchableOpacity
            style={[styles.hostToggle, { borderColor: asHost ? "#7C3AED" : colors.border }]}
            onPress={() => setAsHost((v) => !v)}
            activeOpacity={0.8}
          >
            <Icon name={asHost ? "check" : "add"} size={16} color={asHost ? "#7C3AED" : colors.textTertiary} />
            <Text style={[styles.hostToggleText, { color: asHost ? "#7C3AED" : colors.textSecondary }]}>
              {t("wall.compose.asHost")}
            </Text>
          </TouchableOpacity>
        )}
        {/* Share as a 24h Moment + explicit consent copy (P3). */}
        <TouchableOpacity
          style={[styles.hostToggle, { borderColor: asMoment ? "#7C3AED" : colors.border }]}
          onPress={toggleMoment}
          activeOpacity={0.8}
        >
          <Icon name={asMoment ? "check" : "clock"} size={16} color={asMoment ? "#7C3AED" : colors.textTertiary} />
          <Text style={[styles.hostToggleText, { color: asMoment ? "#7C3AED" : colors.textSecondary }]}>
            {t("wall.compose.asMoment")}
          </Text>
        </TouchableOpacity>
        {asMoment && (
          <Text style={[styles.momentConsent, { color: colors.textTertiary }]}>
            {t("wall.moments.consent")}
          </Text>
        )}
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={t("createPost.textPlaceholder")}
          placeholderTextColor={colors.textTertiary}
          testID="create-post-input"
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
        />

        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbs}>
            {images.map((uri, i) => (
              <View key={i} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} />
                <TouchableOpacity
                  style={styles.removeThumb}
                  onPress={() => setImages((cur) => cur.filter((_, idx) => idx !== i))}
                >
                  <Icon name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {video && (
          <View style={styles.videoPreview}>
            <Image source={{ uri: video.uri }} style={styles.videoThumb} />
            <View style={styles.videoBadge}>
              <Icon name="play" size={18} color="#fff" />
            </View>
            <TouchableOpacity style={styles.removeThumb} onPress={() => setVideo(null)}>
              <Icon name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Attached song — preview + remove, mirroring the video preview. */}
        {!!song && (
          <View style={styles.songPreview} testID="song-preview">
            {!!song.artworkUrl100 && (
              <Image source={{ uri: song.artworkUrl100 }} style={styles.songArt} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.songTitle, { color: colors.text }]} numberOfLines={1}>
                {song.trackName}
              </Text>
              <Text style={[styles.songArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                {song.artistName}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSong(null)} hitSlop={hit} testID="song-remove">
              <Icon name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Song search — opens on demand so the composer stays uncluttered. */}
        {songPicker && !song && (
          <View style={styles.songPicker}>
            <TextInput
              style={[styles.songInput, { color: colors.text, borderColor: colors.border }]}
              placeholder={t("wall.compose.songPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              testID="song-search-input"
              value={songQuery}
              onChangeText={setSongQuery}
              autoFocus
            />
            {songSearching && (
              <Text style={[styles.songHint, { color: colors.textTertiary }]}>
                {t("wall.compose.songSearching")}
              </Text>
            )}
            {songResults.map((s) => (
              <TouchableOpacity
                key={s.trackId}
                style={styles.songResult}
                testID={`song-result-${s.trackId}`}
                onPress={() => chooseSong(s)}
                activeOpacity={0.8}
              >
                {!!s.artworkUrl100 && <Image source={{ uri: s.artworkUrl100 }} style={styles.songResultArt} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.songTitle, { color: colors.text }]} numberOfLines={1}>
                    {s.trackName}
                  </Text>
                  <Text style={[styles.songArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                    {s.artistName}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.mediaBtns}>
          <TouchableOpacity
            style={styles.addPhoto}
            onPress={pick}
            disabled={images.length >= MAX_PHOTOS || !!video}
          >
            <Icon name="image" size={20} color={colors.primary} />
            <Text style={[styles.addPhotoText, { color: colors.primary }]}>
              {images.length > 0
                ? t("createPost.addPhotoWithCount", { count: images.length, max: MAX_PHOTOS })
                : t("wall.compose.carousel")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addPhoto} onPress={pickVideo} disabled={images.length > 0 || !!video}>
            <Icon name="play" size={20} color={colors.primary} />
            <Text style={[styles.addPhotoText, { color: colors.primary }]}>{t("wall.compose.video")}</Text>
          </TouchableOpacity>
          {!asMoment && (
            <TouchableOpacity
              style={styles.addPhoto}
              onPress={() => setSongPicker((v) => !v)}
              disabled={!!song}
              testID="add-song-btn"
            >
              <Icon name="music" size={20} color={colors.primary} />
              <Text style={[styles.addPhotoText, { color: colors.primary }]}>{t("wall.compose.song")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    title: { fontSize: 17, fontWeight: "700", color: colors.text },
    postBtn: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, minWidth: 64, alignItems: "center" },
    postTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    ctxBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
    ctxText: { fontSize: 13.5, fontWeight: "700", flexShrink: 1 },
    hostToggle: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 14 },
    hostToggleText: { fontSize: 13, fontWeight: "700" },
    momentConsent: { fontSize: 12, lineHeight: 17, marginTop: -6, marginBottom: 14 },
    mediaBtns: { flexDirection: "row", gap: 18, flexWrap: "wrap" },
    videoPreview: { width: 120, height: 120, borderRadius: 12, overflow: "hidden", marginTop: 12, marginBottom: 4 },
    songPreview: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, marginTop: 12, marginBottom: 4 },
    songArt: { width: 44, height: 44, borderRadius: 6 },
    songTitle: { fontSize: 14, fontWeight: "700" },
    songArtist: { fontSize: 12.5, marginTop: 1 },
    songPicker: { marginTop: 12 },
    songInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    songHint: { fontSize: 12, marginTop: 8 },
    songResult: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    songResultArt: { width: 36, height: 36, borderRadius: 6 },
    videoThumb: { width: "100%", height: "100%" },
    videoBadge: { position: "absolute", top: "50%", left: "50%", marginLeft: -18, marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
    input: { fontSize: 18, lineHeight: 25, minHeight: 120, textAlignVertical: "top" },
    thumbs: { marginTop: 12 },
    thumbWrap: { marginRight: 10 },
    thumb: { width: 100, height: 100, borderRadius: 12 },
    removeThumb: {
      position: "absolute",
      top: 4,
      right: 4,
      backgroundColor: "rgba(0,0,0,0.5)",
      borderRadius: 12,
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    addPhoto: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20 },
    addPhotoText: { fontSize: 15, fontWeight: "600" },
  });
}
