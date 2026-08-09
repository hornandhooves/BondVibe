import React, { useState, useCallback, useEffect } from "react";
import Icon from "../components/Icon";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { TYPE, SPACING, FONTS, RADII } from "../constants/theme-tokens";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  collection,
  query,
  where,
  limit,
  onSnapshot,
  getCountFromServer,
} from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { resolveAvatarForSave } from "../services/storageService";
import { useTheme } from "../contexts/ThemeContext";
import { useMode } from "../contexts/ModeContext";
import { useBusiness } from "../contexts/BusinessContext";
import { useFocusEffect } from "@react-navigation/native";
import AvatarPicker, { AvatarDisplay } from "../components/AvatarPicker";
import GradientBackground from "../components/GradientBackground";
import { AvatarFrame } from "../components/CategoryIcon";
import { usePremium } from "../hooks/usePremium";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { getFollowers, getFollowing } from "../services/followService";
import { getMyFleet } from "../services/rentalService";

// Parse a positive int in [1, max] or null (birthday day/month inputs).
const clampInt = (v, max) => {
  const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, max);
};

export default function ProfileScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { mode, setMode } = useMode();
  const { businesses } = useBusiness();
  const { isPremium } = usePremium();
  const [profile, setProfile] = useState(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [eventsCount, setEventsCount] = useState(0);
  // T5 stats grid: rental listings published + communities the user belongs to.
  const [publishedCount, setPublishedCount] = useState(0);
  const [communitiesCount, setCommunitiesCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // KIN-98: is there already a host application in flight? Mirrors
  // BecomeHostGate's pending-check so "Switch to hosting" resumes an
  // in-progress request instead of sending them back to the intake form.
  const [pendingHostRequest, setPendingHostRequest] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const q = query(
      collection(db, "hostRequests"),
      where("userId", "==", uid),
      where("status", "==", "pending"),
      limit(1)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setPendingHostRequest(!snap.empty),
      (e) => console.warn("host request lookup failed:", e?.message)
    );
    return unsub;
  }, []);

  const [editForm, setEditForm] = useState({
    fullName: "",
    avatar: null,
    location: "",
    birthDay: null,
    birthMonth: null,
    birthdayShareConsent: false,
    favoriteArtists: [],
  });

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  const loadProfile = async () => {
    try {
      const uid = auth.currentUser.uid;
      const zeroCount = { data: () => ({ count: 0 }) };
      const [userDoc, followerIds, followingIds, evSnap, fleet, commSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getFollowers(uid),
        getFollowing(uid),
        getCountFromServer(
          query(collection(db, "events"), where("creatorId", "==", uid))
        ).catch(() => zeroCount),
        getMyFleet().catch(() => []),
        // T5 "member-of": communities this user belongs to (rule-provable filter).
        getCountFromServer(
          query(collection(db, "hostGroups"), where("memberIds", "array-contains", uid))
        ).catch(() => zeroCount),
      ]);
      setFollowersCount(followerIds.length);
      setFollowingCount(followingIds.length);
      setEventsCount(evSnap.data().count || 0);
      setPublishedCount(Array.isArray(fleet) ? fleet.length : 0);
      setCommunitiesCount(commSnap.data().count || 0);
      if (userDoc.exists()) {
        const data = userDoc.data();
        setProfile(data);
        // Legacy avatars (emoji strings / abstract ids) display as the
        // branded-initial fallback; only real photos round-trip.
        let avatarData = data.avatar;
        if (typeof data.avatar === "string") {
          try { avatarData = JSON.parse(data.avatar); }
          catch { avatarData = null; }
        }
        if (avatarData && avatarData.type !== "photo") avatarData = null;
        // Birthday lives in the gated subdoc (review D); fall back to any legacy
        // day/month still on the main doc so old profiles still populate the form.
        let bDay = typeof data.birthDay === "number" ? data.birthDay : null;
        let bMonth = typeof data.birthMonth === "number" ? data.birthMonth : null;
        try {
          const bSnap = await getDoc(doc(db, "users", uid, "social", "birthday"));
          if (bSnap.exists()) {
            const bd = bSnap.data();
            if (typeof bd.birthDay === "number") bDay = bd.birthDay;
            if (typeof bd.birthMonth === "number") bMonth = bd.birthMonth;
          }
        } catch (e) { /* no subdoc yet */ }
        setEditForm({
          fullName: data.fullName || "",
          avatar: avatarData,
          location: data.location || "",
          birthDay: bDay,
          birthMonth: bMonth,
          birthdayShareConsent: data.birthdayShareConsent === true,
          favoriteArtists: Array.isArray(data.favoriteArtists) ? data.favoriteArtists : [],
        });
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    }
  };

  // ── Favorite artists (KIN-200) ────────────────────────────────────────────
  // Self-selected, not imported: no Spotify connection, no scopes, no tokens.
  // Lookup goes to the public iTunes Search API, which allows ~20 req/min —
  // hence the debounce and the 2-character floor. Neither is cosmetic: raw
  // onChangeText would exceed the limit inside one typed word.
  const MAX_FAVORITE_ARTISTS = 5;
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState([]);
  const [artistSearching, setArtistSearching] = useState(false);
  const debouncedArtistQuery = useDebouncedValue(artistQuery, 400);

  useEffect(() => {
    const q = debouncedArtistQuery.trim();
    if (q.length < 2) {
      setArtistResults([]);
      return;
    }
    let alive = true;
    (async () => {
      // The flag is set INSIDE the async body so it sits under the same
      // try/finally that resets it — outside, a throw would strand the spinner
      // (CLAUDE.md §7, and the lint rule that enforces it).
      setArtistSearching(true);
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=8`
        );
        const json = await res.json();
        if (!alive) return;
        // entity=musicArtist returns no artwork (verified against the live API),
        // so a row is name + genre and nothing else.
        setArtistResults(
          (json.results || []).map((a) => ({
            artistId: a.artistId,
            artistName: a.artistName,
            primaryGenreName: a.primaryGenreName || "",
          }))
        );
      } catch (_e) {
        // A failed lookup just means no suggestions — never block editing.
        if (alive) setArtistResults([]);
      } finally {
        if (alive) setArtistSearching(false);
      }
    })();
    return () => { alive = false; };
  }, [debouncedArtistQuery]);

  const addArtist = (a) => {
    setEditForm((f) => {
      const cur = f.favoriteArtists || [];
      if (cur.length >= MAX_FAVORITE_ARTISTS) return f;
      if (cur.some((x) => x.artistId === a.artistId)) return f; // no duplicates
      return { ...f, favoriteArtists: [...cur, a] };
    });
    setArtistQuery("");
    setArtistResults([]);
  };

  const removeArtist = (artistId) =>
    setEditForm((f) => ({
      ...f,
      favoriteArtists: (f.favoriteArtists || []).filter((x) => x.artistId !== artistId),
    }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const avatar = await resolveAvatarForSave(editForm.avatar, auth.currentUser.uid);
      const uid = auth.currentUser.uid;
      // Social birthday (day+month only, opt-in). PRIVACY (review D): the date
      // lives in the consent-gated users/{uid}/social/birthday subdoc; only the
      // birthdayShareConsent FLAG stays on the main user doc (the subdoc read rule
      // gates on it). Consent off keeps the date private ("save without sharing").
      const hasBday =
        typeof editForm.birthDay === "number" && editForm.birthDay >= 1 && editForm.birthDay <= 31 &&
        typeof editForm.birthMonth === "number" && editForm.birthMonth >= 1 && editForm.birthMonth <= 12;
      const bdayRef = doc(db, "users", uid, "social", "birthday");
      if (hasBday) {
        await setDoc(bdayRef, { birthDay: editForm.birthDay, birthMonth: editForm.birthMonth });
      } else {
        await deleteDoc(bdayRef).catch(() => {});
      }
      await updateDoc(doc(db, "users", uid), {
        fullName: editForm.fullName.trim(),
        avatar,
        location: editForm.location.trim(),
        favoriteArtists: editForm.favoriteArtists,
        birthdayShareConsent: hasBday ? !!editForm.birthdayShareConsent : deleteField(),
        // Clean up any legacy day/month left on the main doc from the pre-subdoc
        // version so it isn't world-readable.
        birthDay: deleteField(),
        birthMonth: deleteField(),
        updatedAt: new Date().toISOString(),
      });
      await loadProfile();
      setEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert(t("profile.errors.saveFailedTitle"), t("profile.errors.saveFailedMsg"));
    } finally {
      setSaving(false);
    }
  };

  const s = createStyles(colors, isDark);

  if (!profile) {
    return (
      <GradientBackground>
        <View style={s.loader}>
          <Text style={{ color: colors.textSecondary }}>{t("profile.loading")}</Text>
        </View>
      </GradientBackground>
    );
  }

  const canManageStripe = profile.role === "host" || profile.role === "admin";
  // T3: the mode toggle only makes sense for host-capable users (a pure attendee
  // has no hosting view). Same signal as the header tag / EventsTabRoot.
  const canHostView = canManageStripe || businesses.length > 0;

  const ratingValue = profile.hostStats?.averageRating
    ? profile.hostStats.averageRating.toFixed(1)
    : "–";

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* ── Avatar Picker ─────────────────────────────────── */}
      <AvatarPicker
        visible={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        currentAvatar={editForm.avatar}
        onAvatarChange={(a) => setEditForm({ ...editForm, avatar: a })}
        name={editForm.fullName}
      />

      {/* ── Header — pushed screen (T1): own back + title; Edit is local ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} testID="profile-back">
            <Icon name="back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {t("navigation.tabs.profile")}
          </Text>
        </View>
        {!editing ? (
          <TouchableOpacity
            onPress={() => setEditing(true)}
            style={[s.editPill, { backgroundColor: colors.brandSoft }]}
          >
            <Icon name="edit" size={13} color={colors.primary} />
            <Text style={[s.editPillText, { color: colors.primary }]}>{t("profile.edit")}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[s.editPill, { backgroundColor: colors.primary }]}
          >
            <Text style={[s.editPillText, { color: "#fff" }]}>
              {saving ? "…" : t("profile.save")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {editing ? (
          /* ── EDIT MODE ───────────────────────────────── */
          <>
            <TouchableOpacity style={s.avatarEditWrap} onPress={() => setShowAvatarPicker(true)}>
              <AvatarFrame size={96}>
                <AvatarDisplay avatar={editForm.avatar} size={80} name={editForm.fullName} />
              </AvatarFrame>
              <Text style={[s.avatarEditHint, { color: colors.primary }]}>{t("profile.tapToChange")}</Text>
            </TouchableOpacity>

            <View style={s.formGroup}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>{t("profile.fullNameLabel")}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editForm.fullName}
                onChangeText={(v) => setEditForm({ ...editForm, fullName: v })}
                placeholder={t("profile.fullNamePlaceholder")}
                placeholderTextColor={colors.textTertiary}
                maxLength={50}
              />
            </View>
            <View style={s.formGroup}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>{t("profile.cityLabel")}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editForm.location}
                onChangeText={(v) => setEditForm({ ...editForm, location: v })}
                placeholder={t("profile.cityPlaceholder")}
                placeholderTextColor={colors.textTertiary}
                maxLength={50}
              />
            </View>
            {/* Favorite artists (KIN-200) — self-selected, max 5 */}
            <View style={s.formGroup}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>
                {t("profile.favoriteArtists.label")}
              </Text>
              {(editForm.favoriteArtists || []).length > 0 && (
                <View style={s.artistChips}>
                  {editForm.favoriteArtists.map((a) => (
                    <TouchableOpacity
                      key={a.artistId}
                      style={[s.artistChip, { backgroundColor: `${colors.primary}14`, borderColor: colors.primary }]}
                      onPress={() => removeArtist(a.artistId)}
                      testID={`artist-chip-${a.artistId}`}
                    >
                      <Text style={[s.artistChipText, { color: colors.primary }]}>{a.artistName}</Text>
                      <Icon name="close" size={13} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {(editForm.favoriteArtists || []).length < MAX_FAVORITE_ARTISTS && (
                <TextInput
                  style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={artistQuery}
                  onChangeText={setArtistQuery}
                  placeholder={t("profile.favoriteArtists.placeholder")}
                  placeholderTextColor={colors.textTertiary}
                  autoCorrect={false}
                  testID="artist-search-input"
                />
              )}
              {artistSearching && (
                <Text style={[s.artistHint, { color: colors.textTertiary }]}>
                  {t("profile.favoriteArtists.searching")}
                </Text>
              )}
              {artistResults.map((a) => (
                <TouchableOpacity
                  key={a.artistId}
                  style={[s.artistResult, { borderColor: colors.border }]}
                  onPress={() => addArtist(a)}
                  testID={`artist-result-${a.artistId}`}
                >
                  <Text style={[s.artistResultName, { color: colors.text }]} numberOfLines={1}>
                    {a.artistName}
                  </Text>
                  {!!a.primaryGenreName && (
                    <Text style={[s.artistHint, { color: colors.textTertiary }]}>{a.primaryGenreName}</Text>
                  )}
                </TouchableOpacity>
              ))}
              <Text style={[s.artistHint, { color: colors.textTertiary }]}>
                {t("profile.favoriteArtists.hint", { max: MAX_FAVORITE_ARTISTS })}
              </Text>
            </View>

            {/* Social birthday (day+month only, opt-in) — gifting Board 1 */}
            <View style={s.formGroup}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>
                {t("gifting.birthday.sectionTitle")} · {t("gifting.birthday.optional")}
              </Text>
              <Text style={[TYPE.caption, { color: colors.textTertiary, marginBottom: SPACING.sm }]}>
                {t("gifting.birthday.emptyBlurb")}
              </Text>
              <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                <TextInput
                  style={[s.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={editForm.birthDay ? String(editForm.birthDay) : ""}
                  onChangeText={(v) => setEditForm({ ...editForm, birthDay: clampInt(v, 31) })}
                  placeholder={t("gifting.birthday.day")}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <TextInput
                  style={[s.input, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={editForm.birthMonth ? String(editForm.birthMonth) : ""}
                  onChangeText={(v) => setEditForm({ ...editForm, birthMonth: clampInt(v, 12) })}
                  placeholder={t("gifting.birthday.month")}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              {editForm.birthDay && editForm.birthMonth ? (
                <>
                  <Text style={[TYPE.caption, { color: colors.textTertiary, marginTop: SPACING.sm }]}>
                    {t("gifting.birthday.preview", { date: `${editForm.birthDay} ${t(`gifting.months.m${editForm.birthMonth}`)}` })}
                  </Text>
                  <TouchableOpacity
                    style={[s.consentRow, { borderColor: colors.border }]}
                    onPress={() => setEditForm({ ...editForm, birthdayShareConsent: !editForm.birthdayShareConsent })}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: editForm.birthdayShareConsent }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[TYPE.bodySemibold, { color: colors.text }]}>{t("gifting.birthday.shareToggle")}</Text>
                      <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{t("gifting.birthday.shareToggleSub")}</Text>
                    </View>
                    <View style={[s.toggle, { backgroundColor: editForm.birthdayShareConsent ? colors.primary : colors.border }]}>
                      <View style={[s.knob, { alignSelf: editForm.birthdayShareConsent ? "flex-end" : "flex-start" }]} />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditForm({ ...editForm, birthDay: null, birthMonth: null, birthdayShareConsent: false })}>
                    <Text style={[TYPE.caption, { color: colors.error, marginTop: SPACING.sm }]}>{t("gifting.birthday.remove")}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>

            <TouchableOpacity
              style={[s.cancelRow]}
              onPress={() => { setEditing(false); loadProfile(); }}
            >
              <Text style={[s.cancelText, { color: colors.textSecondary }]}>{t("profile.cancel")}</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* ── VIEW MODE ───────────────────────────────── */
          <>
            {/* ── User info ── */}
            <View style={s.userSection}>
              <AvatarFrame size={80}>
                <AvatarDisplay avatar={profile.avatar} size={66} name={profile.fullName} />
              </AvatarFrame>
              <Text style={[s.name, { color: colors.text }]}>{profile.fullName}</Text>
              {!!(profile.handle || profile.handleLower) && (
                <Text style={[s.handle, { color: colors.accent }]}>@{profile.handle || profile.handleLower}</Text>
              )}
              <Text style={[s.email, { color: colors.textSecondary }]}>{auth.currentUser?.email}</Text>

              <View style={s.badgeRow}>
                {profile.role === "host" && (
                  <View style={[s.badge, { backgroundColor: colors.successBg }]}>
                    <Icon name="verified" size={13} color={colors.success} />
                    <Text style={[s.badgeText, { color: colors.success }]}>{t("profile.verifiedHost")}</Text>
                  </View>
                )}
                {profile.role === "admin" && (
                  <View style={[s.badge, { backgroundColor: colors.brandSoft }]}>
                    <Icon name="pro" size={13} color={colors.primary} />
                    <Text style={[s.badgeText, { color: colors.primary }]}>{t("profile.admin")}</Text>
                  </View>
                )}
                {!!profile.location && (
                  <View style={[s.badge, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                    <Icon name="location" size={13} color={colors.text} />
                    <Text style={[s.badgeText, { color: colors.text }]}>{profile.location}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── Identity card (hosts) ── */}
            {canManageStripe && (
              <View style={[s.identityCard, { backgroundColor: colors.brandSoft }]}>
                <Icon name="lock" size={18} color={colors.primary} />
                <Text style={[s.identityText, { color: colors.textSecondary }]}>
                  <Text style={[s.identityTextBold, { color: colors.text }]}>{t("profile.identityVerified")}</Text>
                </Text>
              </View>
            )}

            {/* ── T5: Followers · Follows · Rating ── */}
            <View style={[s.metaRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity
                style={s.metaCell}
                onPress={() => navigation.navigate("FollowList", { userId: auth.currentUser.uid, type: "followers" })}
              >
                <Text style={[s.metaNum, { color: colors.text }]}>{followersCount}</Text>
                <Text style={[s.metaLabel, { color: colors.textSecondary }]}>{t("profile.followers")}</Text>
              </TouchableOpacity>
              <View style={[s.metaDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={s.metaCell}
                onPress={() => navigation.navigate("FollowList", { userId: auth.currentUser.uid, type: "following" })}
              >
                <Text style={[s.metaNum, { color: colors.text }]}>{followingCount}</Text>
                <Text style={[s.metaLabel, { color: colors.textSecondary }]}>{t("profile.follows")}</Text>
              </TouchableOpacity>
              <View style={[s.metaDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity style={s.metaCell} onPress={() => navigation.navigate("RatingsOverview")}>
                <View style={s.metaNumRow}>
                  <Text style={[s.metaNum, { color: colors.text }]}>{ratingValue}</Text>
                  <Icon name="star" size={13} color={colors.primary} fill={colors.primary} />
                </View>
                <Text style={[s.metaLabel, { color: colors.textSecondary }]}>{t("profile.rating")}</Text>
              </TouchableOpacity>
            </View>

            {/* ── T5: stats grid — Hosted · Published · Carpool · Communities.
                Each cell hides itself when its data is absent (0). ── */}
            {(() => {
              const carpoolTrips = profile.carpoolStats?.seatsShared || 0;
              const cells = [
                { key: "hosted", value: eventsCount, icon: "calendar", label: t("profile.hosted"),
                  onPress: () => { setMode("hosting"); navigation.navigate("MainTabs", { screen: "EventsTab" }); } },
                { key: "published", value: publishedCount, icon: "bike", label: t("profile.published"),
                  onPress: () => navigation.navigate("MyFleet") },
                { key: "carpool", value: carpoolTrips, icon: "car", label: t("profile.carpool") },
                { key: "communities", value: communitiesCount, icon: "community", label: t("profile.communities"),
                  onPress: () => navigation.navigate("CommunityChats") },
              ].filter((c) => c.value > 0);
              if (cells.length === 0) return null;
              return (
                <View style={s.statsGrid}>
                  {cells.map((c) => (
                    <TouchableOpacity
                      key={c.key}
                      style={[s.gridCell, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      activeOpacity={c.onPress ? 0.7 : 1}
                      disabled={!c.onPress}
                      onPress={c.onPress}
                    >
                      <Icon name={c.icon} size={17} color={colors.primary} />
                      <Text style={[s.gridNum, { color: colors.text }]}>{c.value}</Text>
                      <Text style={[s.gridLabel, { color: colors.textSecondary }]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}

            {/* ── Kinlo Pro banner ──
                 Sells Pro to a host who isn't Pro; to one who is, it's the door
                 into what they bought. Pitching "Community Matching included" at
                 someone already paying for it — same row, same paywall — was the
                 bug: it reads as being asked to buy it twice. */}
            {canManageStripe && (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate(isPremium ? "BusinessHub" : "BondVibePro")
                }
                activeOpacity={0.85}
                testID="profile-pro-banner"
              >
                <View style={[s.proBanner, { backgroundColor: colors.dark }]}>
                  <View style={[s.proIconCircle, { backgroundColor: `${colors.clay}33` }]}>
                    <Icon name="pro" size={22} color={colors.clay} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={s.proTitle}>{t("profile.kinloProTitle")}</Text>
                      {isPremium && (
                        <View style={[s.proActiveBadge, { backgroundColor: `${colors.success}33` }]}>
                          <Text style={[s.proActiveBadgeText, { color: colors.success }]}>{t("profile.kinloProActive")}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.proSub}>
                    {isPremium
                      ? t("profile.kinloProOpenHub")
                      : t("profile.kinloProSub")}
                  </Text>
                  </View>
                  <Icon name="forward" size={18} color="rgba(255,255,255,0.4)" />
                </View>
              </TouchableOpacity>
            )}

            {/* ── Matchmaking ── One unified editor: interests, vibe AND Big Five
                 live inside MatchProfile (canonical mode = no eventId). The quiz
                 is no longer a separate entry point. */}
            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t("profile.matchmaking")}</Text>
            <TouchableOpacity
              style={[s.personalityPrompt, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate("MatchProfileView")}
              testID="profile-match-profile"
            >
              <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                <Icon name="brain" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.toolTitle, { color: colors.text }]}>{t("profile.matchProfile")}</Text>
                <Text style={[s.toolSub, { color: colors.textTertiary }]}>{t("profile.matchProfileSub")}</Text>
              </View>
              <Icon name="forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* ── Account ── */}
            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t("profile.account")}</Text>
            <View style={[s.ajustesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Memberships moved to Events → Attending (they live with the
                  events those credits are used for). */}
              {!canManageStripe && (
                <>
                  <TouchableOpacity
                    style={s.ajustesRow}
                    onPress={() =>
                      navigation.navigate(pendingHostRequest ? "HostStatus" : "RequestHost")
                    }
                  >
                    <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                      <Icon name="calendar" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.ajustesLabel, { color: colors.text }]}>{t("profile.switchToHosting")}</Text>
                      <Text style={[s.ajustesSub, { color: colors.textTertiary }]}>{t("profile.switchToHostingSub")}</Text>
                    </View>
                    <Icon name="forward" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                  <View style={[s.separator, { backgroundColor: colors.border }]} />
                </>
              )}

              <TouchableOpacity style={s.ajustesRow} testID="profile-settings" onPress={() => navigation.navigate("Settings")}>
                <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="settings" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.ajustesLabel, { color: colors.text }]}>{t("profile.settings")}</Text>
                  <Text style={[s.ajustesSub, { color: colors.textTertiary }]}>{t("profile.settingsSub")}</Text>
                </View>
                <Icon name="forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              {/* Admin Dashboard — moved out of Home; admins only (same guard). */}
              {profile.role === "admin" && (
                <>
                  <View style={[s.separator, { backgroundColor: colors.border }]} />
                  <TouchableOpacity style={s.ajustesRow} testID="profile-admin-dashboard" onPress={() => navigation.navigate("AdminDashboard")}>
                    <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                      <Icon name="pro" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.ajustesLabel, { color: colors.text }]}>{t("home.adminDashboard")}</Text>
                    </View>
                    <Icon name="forward" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ── Mode (T3) — the single mode control, host-capable only ── */}
            {canHostView && (
              <>
                <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t("profile.modeSection")}</Text>
                <View style={[s.modeTrack, { backgroundColor: colors.sunken, borderColor: colors.border }]}>
                  {["attending", "hosting"].map((m) => {
                    const active = mode === m;
                    const tint = m === "hosting" ? colors.primary : colors.success;
                    return (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setMode(m)}
                        style={[s.modeSeg, active && { backgroundColor: colors.surface }]}
                        testID={`profile-mode-${m}`}
                      >
                        <View style={[s.modeDot, { backgroundColor: tint }]} />
                        <Text style={[s.modeText, { color: active ? tint : colors.textTertiary }]}>
                          {m === "attending" ? t("navigation.attending") : t("navigation.hosting")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    loader: { flex: 1, justifyContent: "center", alignItems: "center" },

    // Social birthday consent toggle (gifting Board 1c)
    consentRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
    toggle: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: "center" },
    knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      // Pushed screen (no AppHeader): clear the status bar / notch — matches the
      // other pushed business screens' header convention.
      paddingTop: 60,
      paddingBottom: 16,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
    headerTitle: { fontFamily: FONTS.display, fontSize: 20, letterSpacing: -0.4 },
    editPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
    },
    editPillText: { fontFamily: FONTS.bodyBold, fontSize: 14 },

    // Scroll
    scroll: { paddingHorizontal: 20, paddingBottom: 48 },

    // User section
    userSection: { alignItems: "center", marginBottom: 16, gap: 6 },
    name: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.5, marginTop: 8 },
    handle: { fontFamily: FONTS.bodyBold, fontSize: 14, letterSpacing: -0.2, marginTop: -2 },
    email: { fontFamily: FONTS.body, fontSize: 13 },
    badgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 4 },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 20,
    },
    badgeText: { fontFamily: FONTS.bodyBold, fontSize: 12 },

    // Identity card
    identityCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderRadius: RADII.card,
      padding: 14,
      marginBottom: 14,
    },
    identityText: { flex: 1, fontFamily: FONTS.body, fontSize: 13, lineHeight: 19 },
    identityTextBold: { fontFamily: FONTS.bodyBold },

    // T5: Followers · Follows · Rating meta row
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 20,
      marginBottom: 14,
      overflow: "hidden",
    },
    metaCell: { flex: 1, alignItems: "center", paddingVertical: 16 },
    metaNumRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    metaNum: { fontFamily: FONTS.display, fontSize: 21, letterSpacing: -0.5 },
    metaLabel: { fontFamily: FONTS.bodyMedium, fontSize: 12, marginTop: 3 },
    metaDivider: { width: 1, height: 30, alignSelf: "center" },
    // T5: stats grid (Hosted · Published · Carpool · Communities)
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    gridCell: {
      width: "48.5%",
      borderWidth: 1,
      borderRadius: RADII.card - 4,
      paddingVertical: 16,
      paddingHorizontal: 14,
      marginBottom: 10,
      alignItems: "flex-start",
      gap: 6,
    },
    gridNum: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.5 },
    gridLabel: { fontFamily: FONTS.bodySemibold, fontSize: 12.5 },

    // Kinlo Pro banner — always a fixed dark surface (colors.dark) regardless
    // of light/dark theme, same as the paywall/QR "punctual dark surfaces".
    proBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderRadius: RADII.card,
      padding: 16,
      marginBottom: 20,
    },
    proIconCircle: {
      width: 44, height: 44, borderRadius: 22,
      justifyContent: "center", alignItems: "center",
    },
    proTitle: { fontFamily: FONTS.display, fontSize: 16, color: "#FFFFFF", letterSpacing: -0.3 },
    proSub: { fontFamily: FONTS.body, fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 },
    proActiveBadge: {
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    proActiveBadgeText: { fontFamily: FONTS.bodyExtra, fontSize: 10, letterSpacing: 0.4 },

    // Section labels
    sectionLabel: {
      fontFamily: FONTS.bodyBold,
      fontSize: 11,
      letterSpacing: 0.8,
      marginBottom: 10,
      marginTop: 4,
    },
    // Mode toggle (T3)
    modeTrack: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 4, gap: 4 },
    modeSeg: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      borderRadius: 11,
      paddingVertical: 11,
    },
    modeDot: { width: 8, height: 8, borderRadius: 4 },
    modeText: { fontFamily: FONTS.bodyExtra, fontSize: 14 },
    // Tool grid
    toolGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 20,
    },
    toolCard: {
      width: "47.5%",
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      gap: 6,
    },
    toolIcon: {
      width: 36, height: 36, borderRadius: 10,
      justifyContent: "center", alignItems: "center",
      marginBottom: 2,
    },
    toolTitle: { fontFamily: FONTS.bodyBold, fontSize: 14 },
    toolSub: { fontFamily: FONTS.body, fontSize: 12, lineHeight: 16 },
    activeDot: { marginTop: 4 },
    activeDotText: { fontFamily: FONTS.bodyBold, fontSize: 11, color: colors.success },

    // Matchmaking entry (row card)
    personalityPrompt: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      marginBottom: 20,
    },

    // Ajustes
    ajustesCard: {
      borderWidth: 1,
      borderRadius: 18,
      overflow: "hidden",
      marginBottom: 20,
    },
    ajustesRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
    },
    ajustesLabel: { flex: 1, fontFamily: FONTS.bodySemibold, fontSize: 15 },
    ajustesSub: { fontFamily: FONTS.body, fontSize: 12 },
    separator: { height: 1, marginLeft: 58 },

    // Logout / delete
    logoutRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
    },
    logoutText: { fontFamily: FONTS.bodyBold, fontSize: 15 },
    deleteRow: { alignItems: "center", paddingVertical: 12, marginBottom: 8 },
    deleteText: { fontFamily: FONTS.body, fontSize: 13 },

    // Edit mode
    avatarEditWrap: { alignItems: "center", marginBottom: 28, gap: 8 },
    avatarEditHint: { fontFamily: FONTS.bodySemibold, fontSize: 13 },
    formGroup: { marginBottom: 16 },
    inputLabel: { fontFamily: FONTS.bodySemibold, fontSize: 13, marginBottom: 6 },
    input: {
      borderWidth: 1, borderRadius: RADII.input,
      paddingHorizontal: 16, paddingVertical: 14,
      fontFamily: FONTS.body,
      fontSize: 15,
    },
    artistChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    artistChip: {
      flexDirection: "row", alignItems: "center", gap: 6,
      borderWidth: 1, borderRadius: RADII.pill,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    artistChipText: { fontFamily: FONTS.bodySemibold, fontSize: 13 },
    artistResult: { borderBottomWidth: 1, paddingVertical: 10 },
    artistResultName: { fontFamily: FONTS.bodySemibold, fontSize: 14 },
    artistHint: { fontFamily: FONTS.body, fontSize: 12, marginTop: 6 },

    cancelRow: { alignItems: "center", paddingVertical: 16 },
    cancelText: { fontFamily: FONTS.bodySemibold, fontSize: 15 },

    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      borderRadius: 24,
      borderWidth: 1,
      padding: 28,
      alignItems: "center",
    },
    modalIconCircle: {
      width: 60, height: 60, borderRadius: 30,
      backgroundColor: `${colors.error}1F`,
      justifyContent: "center", alignItems: "center",
      marginBottom: 16,
    },
    modalTitle: { fontFamily: FONTS.display, fontSize: 20, marginBottom: 8, letterSpacing: -0.3 },
    modalBody: { fontFamily: FONTS.body, fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 20 },
    modalBtns: { flexDirection: "row", gap: 12, width: "100%" },
    modalBtn: {
      flex: 1, borderWidth: 1, borderRadius: 14,
      paddingVertical: 13, alignItems: "center",
    },
    modalBtnText: { fontFamily: FONTS.bodyBold, fontSize: 15 },
  });
}
