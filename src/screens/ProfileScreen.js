import React, { useState, useCallback } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
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
import { getFollowers, getFollowing } from "../services/followService";
import { getMyFleet } from "../services/rentalService";
import { BRAND } from "../constants/theme-tokens";

const TRAIT_LABEL_KEYS = {
  CONSCIENTIOUSNESS: "conscientiousness",
  AGREEABLENESS: "agreeableness",
  EXTRAVERSION: "extraversion",
  NEUROTICISM: "neuroticism",
  OPENNESS: "openness",
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

  const [editForm, setEditForm] = useState({
    fullName: "",
    avatar: null,
    location: "",
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
        setEditForm({
          fullName: data.fullName || "",
          avatar: avatarData,
          location: data.location || "",
        });
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const avatar = await resolveAvatarForSave(editForm.avatar, auth.currentUser.uid);
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        fullName: editForm.fullName.trim(),
        avatar,
        location: editForm.location.trim(),
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
  const hasPersonality =
    profile.personality && Object.keys(profile.personality).length > 0;

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
                <Text style={[s.handle, { color: colors.primary }]}>@{profile.handle || profile.handleLower}</Text>
              )}
              <Text style={[s.email, { color: colors.textSecondary }]}>{auth.currentUser?.email}</Text>

              {profile.role === "host" && (
                <View style={[s.badge, { backgroundColor: "#E1F5EC" }]}>
                  <Icon name="verified" size={13} color="#1F8A6E" />
                  <Text style={[s.badgeText, { color: "#1F8A6E" }]}>{t("profile.verifiedHost")}</Text>
                </View>
              )}
              {profile.role === "admin" && (
                <View style={[s.badge, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="pro" size={13} color={colors.primary} />
                  <Text style={[s.badgeText, { color: colors.primary }]}>{t("profile.admin")}</Text>
                </View>
              )}
            </View>

            {/* ── Identity card (hosts) ── */}
            {canManageStripe && (
              <View style={[s.identityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Icon name="lock" size={18} color={colors.primary} />
                <Text style={[s.identityText, { color: colors.textSecondary }]}>
                  <Text style={{ fontWeight: "700", color: colors.text }}>{t("profile.identityVerified")}</Text>
                  {profile.location ? ` · ${profile.location}` : ""}
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

            {/* ── Kinlo Pro banner ── */}
            {canManageStripe && (
              <TouchableOpacity
                onPress={() => navigation.navigate("BondVibePro")}
                activeOpacity={0.85}
              >
                <View style={s.proBanner}>
                  <View style={[s.proIconCircle, { backgroundColor: "rgba(148,97,247,0.2)" }]}>
                    <Icon name="pro" size={22} color="#b48dff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={s.proTitle}>{t("profile.kinloProTitle")}</Text>
                      {isPremium && (
                        <View style={s.proActiveBadge}>
                          <Text style={s.proActiveBadgeText}>{t("profile.kinloProActive")}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.proSub}>{t("profile.kinloProSub")}</Text>
                  </View>
                  <Icon name="forward" size={18} color="rgba(255,255,255,0.4)" />
                </View>
              </TouchableOpacity>
            )}

            {/* ── Personalidad ── */}
            {hasPersonality && (
              <>
                <View style={s.sectionRow}>
                  <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t("profile.personality")}</Text>
                  <TouchableOpacity onPress={() => navigation.navigate("PersonalityQuiz")}>
                    <Text style={[s.sectionAction, { color: colors.primary }]}>{t("profile.retake")}</Text>
                  </TouchableOpacity>
                </View>
                <View style={[s.personalityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {Object.entries(profile.personality).map(([trait, score]) => (
                    <View key={trait} style={s.traitRow}>
                      <View style={s.traitHeader}>
                        <Text style={[s.traitName, { color: colors.text }]}>
                          {TRAIT_LABEL_KEYS[trait.toUpperCase()]
                            ? t(`profile.traits.${TRAIT_LABEL_KEYS[trait.toUpperCase()]}`)
                            : (trait.charAt(0).toUpperCase() + trait.slice(1).toLowerCase())}
                        </Text>
                        <Text style={[s.traitScore, { color: colors.primary }]}>{score}</Text>
                      </View>
                      <View style={[s.traitBar, { backgroundColor: colors.sunken }]}>
                        <LinearGradient
                          colors={BRAND.gradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[s.traitFill, { width: `${score}%` }]}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {!hasPersonality && (
              <>
                <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t("profile.personality")}</Text>
                <TouchableOpacity
                  style={[s.personalityPrompt, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => navigation.navigate("PersonalityQuiz")}
                >
                  <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                    <Icon name="brain" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.toolTitle, { color: colors.text }]}>{t("profile.discoverPersonality")}</Text>
                    <Text style={[s.toolSub, { color: colors.textTertiary }]}>{t("profile.bigFiveQuiz")}</Text>
                  </View>
                  <Icon name="forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </>
            )}

            {/* ── Account ── */}
            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t("profile.account")}</Text>
            <View style={[s.ajustesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Memberships moved to Events → Attending (they live with the
                  events those credits are used for). */}
              {!canManageStripe && (
                <>
                  <TouchableOpacity style={s.ajustesRow} onPress={() => navigation.navigate("RequestHost")}>
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
    headerTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
    editPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
    },
    editPillText: { fontSize: 14, fontWeight: "700" },

    // Scroll
    scroll: { paddingHorizontal: 20, paddingBottom: 48 },

    // User section
    userSection: { alignItems: "center", marginBottom: 16, gap: 6 },
    name: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5, marginTop: 8 },
    handle: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2, marginTop: -2 },
    email: { fontSize: 13 },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 20,
      marginTop: 2,
    },
    badgeText: { fontSize: 12, fontWeight: "700" },

    // Identity card
    identityCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14,
    },
    identityText: { flex: 1, fontSize: 13, lineHeight: 19 },

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
    metaNum: { fontSize: 21, fontWeight: "800", letterSpacing: -0.5 },
    metaLabel: { fontSize: 12, marginTop: 3, fontWeight: "500" },
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
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 14,
      marginBottom: 10,
      alignItems: "flex-start",
      gap: 6,
    },
    gridNum: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
    gridLabel: { fontSize: 12.5, fontWeight: "600" },

    // Kinlo Pro banner
    proBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: "#160F22",
      borderRadius: 20,
      padding: 16,
      marginBottom: 20,
    },
    proIconCircle: {
      width: 44, height: 44, borderRadius: 22,
      justifyContent: "center", alignItems: "center",
    },
    proTitle: { fontSize: 16, fontWeight: "800", color: "#F0EEFB", letterSpacing: -0.3 },
    proSub: { fontSize: 12, color: "rgba(240,238,251,0.55)", marginTop: 2 },
    proActiveBadge: {
      backgroundColor: "rgba(52,199,89,0.2)",
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    proActiveBadgeText: { fontSize: 10, fontWeight: "800", color: "#34C759", letterSpacing: 0.4 },

    // Section labels
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
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
    modeText: { fontSize: 14, fontWeight: "800" },
    sectionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
      marginTop: 4,
    },
    sectionAction: { fontSize: 13, fontWeight: "600" },


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
    toolTitle: { fontSize: 14, fontWeight: "700" },
    toolSub: { fontSize: 12, lineHeight: 16 },
    activeDot: { marginTop: 4 },
    activeDotText: { fontSize: 11, fontWeight: "700", color: "#1F8A6E" },

    // Personality
    personalityCard: {
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      marginBottom: 20,
      gap: 14,
    },
    traitRow: { gap: 5 },
    traitHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    traitName: { fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },
    traitBar: { height: 7, borderRadius: 4, overflow: "hidden" },
    traitFill: { height: "100%", borderRadius: 4 },
    traitScore: { fontSize: 13, fontWeight: "700" },
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
    ajustesLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
    ajustesSub: { fontSize: 12 },
    separator: { height: 1, marginLeft: 58 },

    // Logout / delete
    logoutRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
    },
    logoutText: { fontSize: 15, fontWeight: "700" },
    deleteRow: { alignItems: "center", paddingVertical: 12, marginBottom: 8 },
    deleteText: { fontSize: 13 },

    // Edit mode
    avatarEditWrap: { alignItems: "center", marginBottom: 28, gap: 8 },
    avatarEditHint: { fontSize: 13, fontWeight: "600" },
    formGroup: { marginBottom: 16 },
    inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
    input: {
      borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 15,
    },
    cancelRow: { alignItems: "center", paddingVertical: 16 },
    cancelText: { fontSize: 15, fontWeight: "600" },

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
      backgroundColor: "rgba(194,91,91,0.12)",
      justifyContent: "center", alignItems: "center",
      marginBottom: 16,
    },
    modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8, letterSpacing: -0.3 },
    modalBody: { fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 20 },
    modalBtns: { flexDirection: "row", gap: 12, width: "100%" },
    modalBtn: {
      flex: 1, borderWidth: 1, borderRadius: 14,
      paddingVertical: 13, alignItems: "center",
    },
    modalBtnText: { fontSize: 15, fontWeight: "700" },
  });
}
