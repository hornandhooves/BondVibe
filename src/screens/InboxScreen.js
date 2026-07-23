/**
 * InboxScreen — the header ✉ hub (§1.4): ★Ask Kinlo pinned on top, then
 * 1:1 DM threads inline, plus section rows into Match chats and Event chats.
 * Replaces DMList as the ✉ target (DMList stays as a route).
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { respondToStaffInvite } from "../services/businessStaffService";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import ListRow from "../components/ListRow";
import SectionHeader from "../components/SectionHeader";
import CountPill from "../components/CountPill";
import { AvatarDisplay } from "../components/AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { getMyThreads } from "../services/dmService";
import { getBlockedIds } from "../services/blockService";
import { useInboxBadges, isThreadUnread } from "../hooks/useInboxBadge";
import { TYPE, SPACING, RADII, AI, ELEVATION } from "../constants/theme-tokens";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function InboxScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staffInvites, setStaffInvites] = useState([]); // pending staff invites (32.1)
  const me = auth.currentUser?.uid;
  const badges = useInboxBadges(); // per-category unread (spec 12)

  // BUG 32.1: load unresolved staff-invite notifications for the Accept/Decline card.
  const loadStaffInvites = useCallback(async () => {
    if (!me) return;
    try {
      const snap = await getDocs(
        query(collection(db, "notifications"), where("userId", "==", me))
      );
      const invites = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((n) => n.type === "staff_invite" && !n.resolved && n.metadata?.bizId);
      setStaffInvites(invites);
    } catch {
      setStaffInvites([]);
    }
  }, [me]);

  const respondInvite = useCallback(async (invite, accept) => {
    // Optimistically drop the card; mark the notification resolved either way.
    setStaffInvites((prev) => prev.filter((i) => i.id !== invite.id));
    await respondToStaffInvite(invite.metadata.bizId, accept);
    try {
      await updateDoc(doc(db, "notifications", invite.id), { resolved: true, read: true });
    } catch {
      // ignore
    }
  }, []);

  // Count pill + chevron for a category row (default chevron when count is 0).
  const rowRight = (n) =>
    n > 0 ? (
      <View style={styles.rowRight}>
        <CountPill n={n} />
        <Icon name="forward" size={18} color={colors.textTertiary} />
      </View>
    ) : undefined;

  useFocusEffect(
    useCallback(() => {
      (async () => {
        loadStaffInvites();
        try {
          const [threads, blocked] = await Promise.all([getMyThreads(), getBlockedIds()]);
          const resolved = await Promise.all(
            threads.map(async (thread) => {
              const otherUid = (thread.users || []).find((u) => u !== me);
              if (!otherUid || blocked.includes(otherUid)) return null;
              const s = await getDoc(doc(db, "users", otherUid));
              const u = s.exists() ? s.data() : {};
              return {
                id: thread.id,
                otherUid,
                name: u.fullName || u.name || t("inbox.defaultUserName"),
                avatar: u.avatar,
                lastMessage: thread.lastMessage || "",
                unread: isThreadUnread(thread, me),
              };
            })
          );
          setRows(resolved.filter(Boolean));
        } catch {
          setRows([]);
        }
        setLoading(false);
      })();
    }, [me, loadStaffInvites])
  );

  const styles = createStyles(colors);

  const header = (
    <View>
      {/* Staff invites (BUG 32.1) — Accept grants access; Decline removes it. */}
      {staffInvites.map((inv) => (
        <View
          key={inv.id}
          style={[styles.inviteCard, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.primary }]}
        >
          <View style={styles.inviteTop}>
            <View style={[styles.inviteIcon, { backgroundColor: colors.brandSoft }]}>
              <Icon name="users" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.bodySemibold, { color: colors.text }]} numberOfLines={2}>
                {t("inbox.staffInvite.title", {
                  business: inv.metadata?.businessName || t("inbox.staffInvite.aBusiness"),
                  role: inv.metadata?.role || "",
                })}
              </Text>
              <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
                {t("inbox.staffInvite.sub")}
              </Text>
            </View>
          </View>
          <View style={styles.inviteActions}>
            <TouchableOpacity
              style={[styles.inviteBtn, { borderColor: colors.border }]}
              onPress={() => respondInvite(inv, false)}
              activeOpacity={0.85}
            >
              <Text style={[styles.inviteBtnText, { color: colors.textSecondary }]}>
                {t("inbox.staffInvite.decline")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inviteBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => respondInvite(inv, true)}
              activeOpacity={0.85}
            >
              <Text style={[styles.inviteBtnText, { color: colors.onPrimary }]}>
                {t("inbox.staffInvite.accept")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* ★ Ask Kinlo — pinned (spec §1.4) */}
      <TouchableOpacity
        onPress={() => navigation.navigate("AskKinlo")}
        activeOpacity={0.85}
        testID="inbox-ask-kinlo"
      >
        <LinearGradient
          colors={AI.panel}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.pinned, ELEVATION.floatingNeutral]}
        >
          <View style={styles.pinnedIcon}>
            <Icon name="ai" size={20} color={AI.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[TYPE.bodySemibold, { color: "#FFFFFF" }]}>{t("inbox.askKinlo")}</Text>
            <Text style={[TYPE.caption, { color: AI.textOnDark }]}>
              {t("inbox.askKinloSub")}
            </Text>
          </View>
          <Icon name="forward" size={18} color={AI.accent} />
        </LinearGradient>
      </TouchableOpacity>

      <View style={[styles.card, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ListRow
          icon="calendar"
          title={t("inbox.eventChats")}
          subtitle={t("inbox.eventChatsSub")}
          onPress={() => navigation.navigate("EventChats")}
          right={rowRight(badges.eventChats)}
        />
        <ListRow
          icon="heart"
          title={t("inbox.matchChats")}
          subtitle={t("inbox.matchChatsSub")}
          onPress={() => navigation.navigate("PeopleYouMet")}
          right={rowRight(badges.matchChats)}
        />
        <ListRow
          icon="users"
          title={t("inbox.communityChats")}
          subtitle={t("inbox.communityChatsSub")}
          onPress={() => navigation.navigate("CommunityChats")}
          right={rowRight(badges.communityChats)}
        />
        <ListRow
          testID="inbox-notifications-row"
          icon="bell"
          title={t("inbox.notifications")}
          subtitle={t("inbox.notificationsSub")}
          onPress={() => navigation.navigate("Notifications")}
          right={rowRight(badges.notifications)}
          divider={false}
        />
      </View>

      <SectionHeader title={t("inbox.directMessages")} />
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[TYPE.titleLg, { color: colors.text }]}>{t("inbox.title")}</Text>
        <TouchableOpacity onPress={() => navigation.navigate("FindPeople")} hitSlop={hit} testID="inbox-find-people">
          <Icon name="search" size={23} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              testID={`inbox-dm-row-${index}`}
              style={[styles.dmRow, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate("DMChat", { threadId: item.id, otherUid: item.otherUid })}
              activeOpacity={0.8}
            >
              <AvatarDisplay avatar={normAvatar(item.avatar)} size={42} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[TYPE.bodySemibold, { color: colors.text }, item.unread && styles.unreadName]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                {item.lastMessage ? (
                  <Text
                    style={[TYPE.caption, { color: item.unread ? colors.text : colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.lastMessage}
                  </Text>
                ) : null}
              </View>
              {item.unread && <View style={[styles.dmDot, { backgroundColor: colors.error }]} />}
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[TYPE.caption, styles.emptyText, { color: colors.textTertiary }]}>
              {t("inbox.noDMs")}
            </Text>
          }
        />
      )}
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
      paddingHorizontal: SPACING.screen,
      paddingTop: 60,
      paddingBottom: SPACING.md,
    },
    list: { paddingHorizontal: SPACING.screen, paddingBottom: SPACING.xxxl, gap: SPACING.sm },
    pinned: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      borderRadius: RADII.card,
      padding: SPACING.card,
      marginBottom: SPACING.md,
    },
    pinnedIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(199,146,234,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    card: { borderRadius: RADII.card, borderWidth: 1, overflow: "hidden" },
    // Staff invite card (BUG 32.1)
    inviteCard: {
      borderRadius: RADII.card,
      borderWidth: 1,
      padding: SPACING.card,
      marginBottom: SPACING.md,
    },
    inviteTop: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
    inviteIcon: {
      width: 38, height: 38, borderRadius: 19,
      alignItems: "center", justifyContent: "center",
    },
    inviteActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
    inviteBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: RADII.pill,
      paddingVertical: 10,
      alignItems: "center",
    },
    inviteBtnText: { fontSize: 14, fontWeight: "800" },
    groupRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      padding: SPACING.md,
    },
    groupInitial: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
    groupDivider: {
      position: "absolute",
      left: 64,
      right: 0,
      bottom: 0,
      height: 1,
    },
    dmRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      borderRadius: RADII.card,
      borderWidth: 1,
      padding: SPACING.md,
    },
    emptyText: { textAlign: "center", marginTop: SPACING.lg },
    rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    unreadName: { fontWeight: "800" },
    dmDot: { width: 9, height: 9, borderRadius: 5 },
  });
}
