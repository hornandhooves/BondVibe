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
import { useFocusEffect } from "@react-navigation/native";
import AvatarPicker, { AvatarDisplay } from "../components/AvatarPicker";
import GradientBackground from "../components/GradientBackground";
import { AvatarFrame } from "../components/CategoryIcon";
import { usePremium } from "../hooks/usePremium";
import { getFollowers } from "../services/followService";
import { BRAND } from "../constants/theme-tokens";

const TRAIT_LABELS = {
  CONSCIENTIOUSNESS: "Conscientiousness",
  AGREEABLENESS: "Agreeableness",
  EXTRAVERSION: "Extraversion",
  NEUROTICISM: "Neuroticism",
  OPENNESS: "Openness",
};

export default function ProfileScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { isPremium } = usePremium();
  const [profile, setProfile] = useState(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [eventsCount, setEventsCount] = useState(0);
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
      const [userDoc, followerIds, evSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getFollowers(uid),
        getCountFromServer(
          query(collection(db, "events"), where("creatorId", "==", uid))
        ).catch(() => ({ data: () => ({ count: 0 }) })),
      ]);
      setFollowersCount(followerIds.length);
      setEventsCount(evSnap.data().count || 0);
      if (userDoc.exists()) {
        const data = userDoc.data();
        setProfile(data);
        let avatarData = data.avatar;
        if (typeof data.avatar === "string" && !data.avatar.startsWith("{")) {
          avatarData = { type: "emoji", value: data.avatar };
        } else if (typeof data.avatar === "string") {
          try { avatarData = JSON.parse(data.avatar); }
          catch { avatarData = { type: "emoji", value: "😊" }; }
        }
        setEditForm({
          fullName: data.fullName || "",
          avatar: avatarData || { type: "emoji", value: "😊" },
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
      Alert.alert("Error", "Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const s = createStyles(colors, isDark);

  if (!profile) {
    return (
      <GradientBackground>
        <View style={s.loader}>
          <Text style={{ color: colors.textSecondary }}>Loading…</Text>
        </View>
      </GradientBackground>
    );
  }

  const canManageStripe = profile.role === "host" || profile.role === "admin";

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
      />

      {/* ── Header — tab root: AppHeader shows the title; Edit is local ── */}
      <View style={s.header}>
        <View style={{ width: 26 }} />
        {!editing ? (
          <TouchableOpacity
            onPress={() => setEditing(true)}
            style={[s.editPill, { backgroundColor: colors.brandSoft }]}
          >
            <Icon name="edit" size={13} color={colors.primary} />
            <Text style={[s.editPillText, { color: colors.primary }]}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[s.editPill, { backgroundColor: colors.primary }]}
          >
            <Text style={[s.editPillText, { color: "#fff" }]}>
              {saving ? "…" : "Save"}
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
                <AvatarDisplay avatar={editForm.avatar} size={80} />
              </AvatarFrame>
              <Text style={[s.avatarEditHint, { color: colors.primary }]}>Tap to change</Text>
            </TouchableOpacity>

            <View style={s.formGroup}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Full name</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editForm.fullName}
                onChangeText={(t) => setEditForm({ ...editForm, fullName: t })}
                placeholder="Your name"
                placeholderTextColor={colors.textTertiary}
                maxLength={50}
              />
            </View>
            <View style={s.formGroup}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>City</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editForm.location}
                onChangeText={(t) => setEditForm({ ...editForm, location: t })}
                placeholder="City, Country"
                placeholderTextColor={colors.textTertiary}
                maxLength={50}
              />
            </View>
            <TouchableOpacity
              style={[s.cancelRow]}
              onPress={() => { setEditing(false); loadProfile(); }}
            >
              <Text style={[s.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* ── VIEW MODE ───────────────────────────────── */
          <>
            {/* ── User info ── */}
            <View style={s.userSection}>
              <AvatarFrame size={80}>
                <AvatarDisplay avatar={profile.avatar} size={66} />
              </AvatarFrame>
              <Text style={[s.name, { color: colors.text }]}>{profile.fullName}</Text>
              <Text style={[s.email, { color: colors.textSecondary }]}>{auth.currentUser?.email}</Text>

              {profile.role === "host" && (
                <View style={[s.badge, { backgroundColor: "#E1F5EC" }]}>
                  <Icon name="verified" size={13} color="#1F8A6E" />
                  <Text style={[s.badgeText, { color: "#1F8A6E" }]}>Verified host</Text>
                </View>
              )}
              {profile.role === "admin" && (
                <View style={[s.badge, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="pro" size={13} color={colors.primary} />
                  <Text style={[s.badgeText, { color: colors.primary }]}>Admin</Text>
                </View>
              )}
            </View>

            {/* ── Identity card (hosts) ── */}
            {canManageStripe && (
              <View style={[s.identityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Icon name="lock" size={18} color={colors.primary} />
                <Text style={[s.identityText, { color: colors.textSecondary }]}>
                  <Text style={{ fontWeight: "700", color: colors.text }}>Identity & payments verified.</Text>
                  {profile.location ? ` · ${profile.location}` : ""}
                </Text>
              </View>
            )}

            {/* ── Stats row ── */}
            <View style={[s.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity
                style={s.stat}
                onPress={() => navigation.navigate("FollowList", { userId: auth.currentUser.uid, type: "followers" })}
              >
                <Text style={[s.statNumber, { color: colors.text }]}>{eventsCount}</Text>
                <Text style={[s.statLabel, { color: colors.textSecondary }]}>Events</Text>
              </TouchableOpacity>

              <View style={s.statCenter}>
                <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.statCenterGrad}>
                  <Text style={s.statCenterNumber}>{ratingValue}★</Text>
                  <Text style={s.statCenterLabel}>Rating</Text>
                </LinearGradient>
              </View>

              <TouchableOpacity
                style={s.stat}
                onPress={() => navigation.navigate("FollowList", { userId: auth.currentUser.uid, type: "followers" })}
              >
                <Text style={[s.statNumber, { color: colors.text }]}>{followersCount}</Text>
                <Text style={[s.statLabel, { color: colors.textSecondary }]}>Members</Text>
              </TouchableOpacity>
            </View>

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
                      <Text style={s.proTitle}>Kinlo Pro</Text>
                      {isPremium && (
                        <View style={s.proActiveBadge}>
                          <Text style={s.proActiveBadgeText}>ACTIVE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.proSub}>Community Matching included</Text>
                  </View>
                  <Icon name="forward" size={18} color="rgba(255,255,255,0.4)" />
                </View>
              </TouchableOpacity>
            )}

            {/* Host tools now live in Host Mode → Manage (Events tab).
                A hint card points hosts there. */}
            {canManageStripe && (
              <TouchableOpacity
                style={[s.hostHint, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => navigation.navigate("MainTabs", { screen: "EventsTab" })}
              >
                <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="settings" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.toolTitle, { color: colors.text }]}>Host tools moved</Text>
                  <Text style={[s.toolSub, { color: colors.textTertiary }]}>
                    Switch to Hosting in the header → Events tab becomes Manage
                  </Text>
                </View>
                <Icon name="forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}

            {/* ── Personalidad ── */}
            {hasPersonality && (
              <>
                <View style={s.sectionRow}>
                  <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>PERSONALITY</Text>
                  <TouchableOpacity onPress={() => navigation.navigate("PersonalityQuiz")}>
                    <Text style={[s.sectionAction, { color: colors.primary }]}>Retake</Text>
                  </TouchableOpacity>
                </View>
                <View style={[s.personalityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {Object.entries(profile.personality).map(([trait, score]) => (
                    <View key={trait} style={s.traitRow}>
                      <View style={s.traitHeader}>
                        <Text style={[s.traitName, { color: colors.text }]}>
                          {TRAIT_LABELS[trait.toUpperCase()] ?? (trait.charAt(0).toUpperCase() + trait.slice(1).toLowerCase())}
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
                <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>PERSONALITY</Text>
                <TouchableOpacity
                  style={[s.personalityPrompt, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => navigation.navigate("PersonalityQuiz")}
                >
                  <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                    <Icon name="brain" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.toolTitle, { color: colors.text }]}>Discover your personality</Text>
                    <Text style={[s.toolSub, { color: colors.textTertiary }]}>Big Five personality quiz</Text>
                  </View>
                  <Icon name="forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </>
            )}

            {/* ── Account ── */}
            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>ACCOUNT</Text>
            <View style={[s.ajustesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity style={s.ajustesRow} onPress={() => navigation.navigate("MyMemberships")}>
                <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="ticket" size={18} color={colors.primary} />
                </View>
                <Text style={[s.ajustesLabel, { color: colors.text }]}>My memberships</Text>
                <Icon name="forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              {!canManageStripe && (
                <>
                  <View style={[s.separator, { backgroundColor: colors.border }]} />
                  <TouchableOpacity style={s.ajustesRow} onPress={() => navigation.navigate("RequestHost")}>
                    <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                      <Icon name="calendar" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.ajustesLabel, { color: colors.text }]}>Switch to hosting</Text>
                      <Text style={[s.ajustesSub, { color: colors.textTertiary }]}>Create your own experiences</Text>
                    </View>
                    <Icon name="forward" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </>
              )}

              <View style={[s.separator, { backgroundColor: colors.border }]} />

              <TouchableOpacity style={s.ajustesRow} testID="profile-settings" onPress={() => navigation.navigate("Settings")}>
                <View style={[s.toolIcon, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="settings" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.ajustesLabel, { color: colors.text }]}>Settings</Text>
                  <Text style={[s.ajustesSub, { color: colors.textTertiary }]}>Appearance, AI, safety, account</Text>
                </View>
                <Icon name="forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
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
      paddingTop: 4,
      paddingBottom: 16,
    },
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

    // Stats row
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderRadius: 20,
      marginBottom: 14,
      overflow: "hidden",
    },
    stat: { flex: 1, alignItems: "center", paddingVertical: 18 },
    statNumber: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
    statLabel: { fontSize: 12, marginTop: 3, fontWeight: "500" },
    statCenter: { flex: 1.1 },
    statCenterGrad: { alignItems: "center", paddingVertical: 18, borderRadius: 0 },
    statCenterNumber: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
    statCenterLabel: { fontSize: 12, marginTop: 3, color: "rgba(255,255,255,0.8)", fontWeight: "500" },

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
    sectionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
      marginTop: 4,
    },
    sectionAction: { fontSize: 13, fontWeight: "600" },

    hostHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      marginHorizontal: 20,
      marginBottom: 20,
    },

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
