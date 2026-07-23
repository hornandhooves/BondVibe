/**
 * EventChatsScreen — the group chats for every event you're part of (joined or
 * hosting), split into Upcoming and Past tabs. Reached from the Inbox
 * "Event chats" row; each row opens that event's EventChat.
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
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { getMyRosterEvents } from "../services/rosterService";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";
import { isEventPast } from "../utils/eventFilters";
import { useUnreadMessages } from "../hooks/useUnreadMessages";
import { TYPE, SPACING, RADII, ELEVATION } from "../constants/theme-tokens";

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

export default function EventChatsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("upcoming"); // 'upcoming' | 'past'
  const [msgFilter, setMsgFilter] = useState("all"); // 'all' | 'with' | 'without'
  const [msgMap, setMsgMap] = useState({}); // eventId -> hasMessages (BUG 21)
  // Per-event unread counts, keyed by bare eventId (matches item.id) — BUG 26.
  const { unreadByEvent } = useUnreadMessages();

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        const uid = auth.currentUser?.uid;
        if (!uid) {
          setEvents([]);
          setLoading(false);
          return;
        }
        try {
          // Every event whose chat you can see: ones you joined + ones you host.
          // ROSTER (fix/privacy-event-roster): joined events come from the roster.
          const [joined, hostSnap] = await Promise.all([
            getMyRosterEvents(),
            getDocs(
              query(collection(db, "events"), where("creatorId", "==", uid))
            ),
          ]);
          const byId = {};
          joined.forEach((e) => {
            byId[e.id] = e;
          });
          hostSnap.docs.forEach((d) => {
            byId[d.id] = { id: d.id, ...d.data() };
          });
          const list = Object.values(byId);
          if (alive) setEvents(list);
          // Which chats actually have messages (BUG 21) — one cheap limit(1)
          // read per event, in parallel, so hosts can find silent groups.
          const entries = await Promise.all(
            list.map(async (e) => {
              try {
                const s = await getDocs(query(collection(db, "events", e.id, "messages"), limit(1)));
                return [e.id, !s.empty];
              } catch (_e) {
                return [e.id, false];
              }
            })
          );
          if (alive) setMsgMap(Object.fromEntries(entries));
        } catch (e) {
          console.error("EventChats load:", e);
          if (alive) setEvents([]);
        }
        if (alive) setLoading(false);
      })();
      return () => {
        alive = false;
      };
    }, [])
  );

  const filtered = events
    .filter((e) =>
      tab === "past" ? isEventPast(e.date) : !isEventPast(e.date)
    )
    .filter((e) => {
      if (msgFilter === "with") return msgMap[e.id] === true;
      if (msgFilter === "without") return msgMap[e.id] === false;
      return true;
    })
    .sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db2 = new Date(b.date).getTime();
      // Upcoming: soonest first. Past: most recent first.
      return tab === "past" ? db2 - da : da - db2;
    });

  const styles = createStyles(colors);

  const Tab = ({ id, label }) => {
    const active = tab === id;
    return (
      <TouchableOpacity style={styles.tab} onPress={() => setTab(id)}>
        <View
          style={[
            styles.tabGlass,
            {
              backgroundColor: active ? `${colors.primary}33` : colors.surfaceGlass,
              borderColor: active ? `${colors.primary}66` : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: active ? colors.primary : colors.textSecondary },
            ]}
          >
            {label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const formatWhen = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[TYPE.titleLg, { color: colors.text }]}>{t("eventChats.title")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.tabsContainer}>
        <Tab id="upcoming" label={t("eventChats.upcoming")} />
        <Tab id="past" label={t("eventChats.past")} />
      </View>

      {/* Message filter (BUG 21): find silent groups to activate. */}
      <View style={styles.filterRow}>
        {[
          { id: "all", label: t("eventChats.filterAll") },
          { id: "with", label: t("eventChats.filterWith") },
          { id: "without", label: t("eventChats.filterWithout") },
        ].map((f) => {
          const on = msgFilter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setMsgFilter(f.id)}
              style={[styles.filterChip, { backgroundColor: on ? colors.primary : colors.surfaceGlass, borderColor: on ? colors.primary : colors.border }]}
            >
              <Text style={[styles.filterChipText, { color: on ? "#fff" : colors.textSecondary }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => {
            const unread = unreadByEvent[item.id] || 0;
            return (
            <TouchableOpacity
              testID={`event-chat-row-${index}`}
              style={[
                styles.row,
                ELEVATION.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() =>
                navigation.navigate("EventChat", {
                  eventId: item.id,
                  eventTitle: item.title,
                })
              }
              activeOpacity={0.8}
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.brandSoft }]}>
                <Icon name="calendar" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    TYPE.bodySemibold,
                    { color: colors.text },
                    unread > 0 && { fontWeight: "800" },
                  ]}
                  numberOfLines={1}
                >
                  {item.title || t("eventChats.defaultEventName")}
                </Text>
                <Text
                  style={[TYPE.caption, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {formatWhen(item.date)}
                </Text>
              </View>
              {unread > 0 ? (
                <View style={[styles.unreadBubble, { backgroundColor: colors.error }]}>
                  <Text style={styles.unreadText}>{unread > 9 ? "9+" : unread}</Text>
                </View>
              ) : (
                <Icon name="forward" size={16} color={colors.textTertiary} />
              )}
            </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text
              style={[TYPE.caption, styles.emptyText, { color: colors.textTertiary }]}
            >
              {tab === "past"
                ? t("eventChats.emptyPast")
                : t("eventChats.emptyUpcoming")}
            </Text>
          }
        />
      )}
    </GradientBackground>
  );
}

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
    tabsContainer: {
      flexDirection: "row",
      gap: SPACING.sm,
      paddingHorizontal: SPACING.screen,
      marginBottom: SPACING.sm,
    },
    tab: { flex: 1 },
    tabGlass: {
      borderWidth: 1,
      borderRadius: RADII.pill,
      paddingVertical: 10,
      alignItems: "center",
    },
    tabText: { fontSize: 14, fontWeight: "700" },
    filterRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      paddingHorizontal: SPACING.screen,
      marginBottom: SPACING.md,
    },
    filterChip: {
      borderWidth: 1,
      borderRadius: RADII.pill,
      paddingVertical: 6,
      paddingHorizontal: 14,
    },
    filterChipText: { fontSize: 12.5, fontWeight: "700" },
    list: {
      paddingHorizontal: SPACING.screen,
      paddingBottom: SPACING.xxxl,
      paddingTop: SPACING.sm,
      gap: SPACING.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      borderRadius: RADII.card,
      borderWidth: 1,
      padding: SPACING.card,
    },
    rowIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: { textAlign: "center", marginTop: 40 },
    // Per-event unread count bubble (BUG 26) — replaces the chevron on rows
    // that have unread messages.
    unreadBubble: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 7,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    unreadText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  });
}
