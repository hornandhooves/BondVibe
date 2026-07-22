/**
 * C2 — Someone's match profile, with Like / Pass and safety actions. A Like
 * runs the server transaction: a reached cap routes to the Kinlo Plus paywall
 * (C4); a reciprocal like shows the match overlay (C3).
 */
import React, { useState } from "react";
import Icon from "../../components/Icon";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import MatchIntelCard from "../../components/ai/MatchIntelCard";
import SignalBreakdown from "../../components/matching/SignalBreakdown";
import { likeAttendee, MATCH_TYPE_COLORS } from "../../services/matchingService";
import { friendlyCallableError } from "../../utils/callableError";

export default function MatchPersonScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { eventId, eventTitle, profile } = route.params || {};
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState(null); // { matchId, allowMessaging }

  // KQA-003: nothing to show without a profile. The normal flow always passes
  // one (from the match grid), so this only catches a bad deep link or a
  // param-less navigation — every field below dereferences `profile`.
  // Placed AFTER the hooks, not right after the destructure: an early return
  // before useState would make those hooks conditional (Rules of Hooks / lint).
  if (!profile) return null;

  const onLike = async () => {
    setBusy(true);
    try {
      const res = await likeAttendee(eventId, profile.userId);
      if (res?.capReached) {
        navigation.navigate("PlusPaywall", {
          eventId,
          eventTitle,
          maxMatches: res.maxMatches,
        });
        return;
      }
      if (res?.matched) {
        setMatch({ matchId: res.matchId, allowMessaging: res.allowMessaging });
        return;
      }
      Alert.alert(t("matching.person.likedTitle"), t("matching.person.likedMsg"), [
        { text: t("matching.person.keepBrowsing"), onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      // Known callable codes (target_not_checked_in, not_checked_in, …) → friendly
      // copy; matching_closed keeps its specific message; else a generic fallback.
      const msg = e?.message?.includes("matching_closed")
        ? t("matching.person.matchingClosedMsg")
        : friendlyCallableError(e, t, "matching.person.couldntLikeMsg");
      Alert.alert(t("matching.person.oopsTitle"), msg);
    } finally {
      setBusy(false);
    }
  };

  const safety = () =>
    Alert.alert(t("matching.person.safetyTitle"), t("matching.person.safetyMsg", { name: profile.displayName }), [
      { text: t("matching.person.report"), onPress: () => navigation.navigate("Report", { targetUserId: profile.userId }) },
      { text: t("matching.person.block"), style: "destructive", onPress: () => Alert.alert(t("matching.person.blockedTitle"), t("matching.person.blockedMsg")) },
      { text: t("matching.person.hide"), onPress: () => navigation.goBack() },
      { text: t("matching.person.cancel"), style: "cancel" },
    ]);

  const styles = createStyles(colors);
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {profile.photoUrl ? (
            <Image source={{ uri: profile.photoUrl }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoFallback]}>
              <Text style={styles.photoInitial}>
                {(profile.displayName || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.safetyBtn} onPress={safety}>
            <Icon name="report" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.nameRow}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => navigation.navigate("UserProfile", { userId: profile.userId })}
              hitSlop={{ top: 6, bottom: 6, left: 0, right: 6 }}
            >
              <Text style={[styles.name, { color: colors.text }]}>
                {profile.displayName}
                {profile.age ? `, ${profile.age}` : ""}
              </Text>
            </TouchableOpacity>
            {typeof profile.compatibility === "number" && (
              <View style={[styles.compat, { backgroundColor: `${colors.primary}18` }]}>
                <Text style={[styles.compatText, { color: colors.primary }]}>
                  {t("matching.person.matchPercent", { percent: profile.compatibility })}
                </Text>
              </View>
            )}
          </View>
          {!!profile.profession && (
            <Text style={[styles.profession, { color: colors.textSecondary }]}>
              {profile.profession}
            </Text>
          )}

          {!!(profile.lookingFor || []).length && (
            <View style={styles.chips}>
              {profile.lookingFor.map((t) => {
                const c = MATCH_TYPE_COLORS[t] || {};
                return (
                  <View key={t} style={[styles.chip, { backgroundColor: c.bg }]}>
                    <Text style={[styles.chipText, { color: c.fg }]}>{t}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {!!profile.bio && (
            <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text>
          )}
          {!!profile.icebreaker && (
            <View style={[styles.iceCard, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
              <Text style={[styles.iceLabel, { color: colors.textSecondary }]}>{t("matching.person.askMeAbout")}</Text>
              <Text style={[styles.iceText, { color: colors.text }]}>{profile.icebreaker}</Text>
            </View>
          )}
          {!!(profile.interests || []).length && (
            <View style={styles.chips}>
              {profile.interests.map((i) => (
                <View key={i} style={[styles.chip, { backgroundColor: colors.surfaceGlass }]}>
                  <Text style={[styles.chipText, { color: colors.textSecondary }]}>{i}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {/* Deterministic affinity breakdown (P1) — the score is NOT from the AI. */}
        <SignalBreakdown affinity={profile.affinity} />
        {/* Match Intelligence (ai_features/15): rationale free, icebreakers Plus */}
        <MatchIntelCard
          eventId={eventId}
          otherUid={profile.userId}
          navigation={navigation}
        />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.action, { borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
          disabled={busy}
        >
          <Icon name="close" size={26} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.action, styles.like, { backgroundColor: colors.primary }]}
          onPress={onLike}
          disabled={busy}
        >
          <Icon name="heart" size={28} color="#fff" fill="#fff" />
        </TouchableOpacity>
      </View>

      {/* C3 — match overlay */}
      <Modal visible={!!match} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { backgroundColor: colors.surface }]}>
            <Icon name="heart" size={54} color={colors.primary} fill={colors.primary} />
            <Text style={[styles.matchTitle, { color: colors.text }]}>{t("matching.person.itsAMatch")}</Text>
            <Text style={[styles.matchSub, { color: colors.textSecondary }]}>
              {t("matching.person.youAndLiked", { name: profile.displayName })}
            </Text>
            {match?.allowMessaging ? (
              <TouchableOpacity
                style={[styles.matchBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const m = match;
                  setMatch(null);
                  navigation.replace("MatchChat", {
                    matchId: m.matchId,
                    name: profile.displayName,
                  });
                }}
              >
                <Icon name="message" size={18} color="#fff" />
                <Text style={styles.matchBtnText}>{t("matching.person.sayHi")}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => { setMatch(null); navigation.goBack(); }}>
              <Text style={[styles.keep, { color: colors.textSecondary }]}>{t("matching.person.keepBrowsing")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingBottom: 24 },
    hero: { height: 360, backgroundColor: colors.surfaceGlass },
    photo: { width: "100%", height: "100%" },
    photoFallback: { alignItems: "center", justifyContent: "center", backgroundColor: `${colors.primary}18` },
    photoInitial: { fontSize: 96, fontWeight: "800", color: colors.primary },
    safetyBtn: {
      position: "absolute",
      top: 52,
      right: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center",
      justifyContent: "center",
    },
    body: { padding: 20 },
    nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    name: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3, flex: 1 },
    compat: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
    compatText: { fontSize: 13, fontWeight: "800" },
    profession: { fontSize: 15, marginTop: 4 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
    chip: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
    chipText: { fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
    bio: { fontSize: 15, lineHeight: 22, marginTop: 16 },
    iceCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16 },
    iceLabel: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
    iceText: { fontSize: 15, lineHeight: 21 },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 24,
      paddingVertical: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    action: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
    like: { borderWidth: 0 },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 32 },
    overlayCard: { width: "100%", borderRadius: 24, padding: 28, alignItems: "center" },
    matchTitle: { fontSize: 26, fontWeight: "800", marginTop: 14 },
    matchSub: { fontSize: 15, textAlign: "center", marginTop: 8, marginBottom: 20 },
    matchBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      height: 50,
      borderRadius: 25,
      paddingHorizontal: 32,
      marginBottom: 12,
    },
    matchBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    keep: { fontSize: 15, fontWeight: "600", paddingVertical: 6 },
  });
}
