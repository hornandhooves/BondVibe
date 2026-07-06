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
import { useFocusEffect } from "@react-navigation/native";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";
import { isEventPast } from "../utils/eventFilters";
import { TYPE, SPACING, RADII, ELEVATION } from "../constants/theme-tokens";

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

export default function EventChatsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("upcoming"); // 'upcoming' | 'past'

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
          const [joinedSnap, hostSnap] = await Promise.all([
            getDocs(
              query(
                collection(db, "events"),
                where("attendees", "array-contains", uid)
              )
            ),
            getDocs(
              query(collection(db, "events"), where("creatorId", "==", uid))
            ),
          ]);
          const byId = {};
          [...joinedSnap.docs, ...hostSnap.docs].forEach((d) => {
            byId[d.id] = { id: d.id, ...d.data() };
          });
          if (alive) setEvents(Object.values(byId));
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
    return d.toLocaleDateString([], {
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
        <Text style={[TYPE.titleLg, { color: colors.text }]}>Event chats</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.tabsContainer}>
        <Tab id="upcoming" label="Upcoming" />
        <Tab id="past" label="Past" />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
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
                  style={[TYPE.bodySemibold, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.title || "Event"}
                </Text>
                <Text
                  style={[TYPE.caption, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {formatWhen(item.date)}
                </Text>
              </View>
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text
              style={[TYPE.caption, styles.emptyText, { color: colors.textTertiary }]}
            >
              {tab === "past"
                ? "No past event chats yet."
                : "No upcoming event chats — join an event to start chatting."}
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
  });
}
