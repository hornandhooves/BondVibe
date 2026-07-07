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
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import ListRow from "../components/ListRow";
import SectionHeader from "../components/SectionHeader";
import { AvatarDisplay } from "../components/AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { getMyThreads } from "../services/dmService";
import { getBlockedIds } from "../services/blockService";
import { TYPE, SPACING, RADII, AI, ELEVATION } from "../constants/theme-tokens";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function InboxScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const me = auth.currentUser?.uid;

  useFocusEffect(
    useCallback(() => {
      (async () => {
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
              };
            })
          );
          setRows(resolved.filter(Boolean));
        } catch {
          setRows([]);
        }
        setLoading(false);
      })();
    }, [me])
  );

  const styles = createStyles(colors);

  const header = (
    <View>
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
        />
        <ListRow
          icon="heart"
          title={t("inbox.matchChats")}
          subtitle={t("inbox.matchChatsSub")}
          onPress={() => navigation.navigate("PeopleYouMet")}
        />
        <ListRow
          icon="users"
          title={t("inbox.communityChats")}
          subtitle={t("inbox.communityChatsSub")}
          onPress={() => navigation.navigate("CommunityChats")}
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
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.dmRow, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate("DMChat", { threadId: item.id, otherUid: item.otherUid })}
              activeOpacity={0.8}
            >
              <AvatarDisplay avatar={normAvatar(item.avatar)} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.bodySemibold, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.lastMessage ? (
                  <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                ) : null}
              </View>
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
  });
}
