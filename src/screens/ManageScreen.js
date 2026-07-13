/**
 * ManageScreen — "Your events" (T4b): the Hosting root of the Events tab. A real
 * hosted-events list with a search box, Upcoming/Past, a prominent Create event
 * button, and per-card Check-in / Roster / Edit plus a capacity bar. The
 * "Your business" entry moved to the Business tab (T2), so this no longer touches
 * the Business Hub.
 */
import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { collection, query, where, getDocs } from "firebase/firestore";
import { LinearGradient } from "expo-linear-gradient";
import { auth, db } from "../services/firebase";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII, BRAND, ELEVATION } from "../constants/theme-tokens";
import { filterUpcomingEvents, filterPastEvents } from "../utils/eventFilters";
import { formatISODate, formatEventTime } from "../utils/dateUtils";

export default function ManageScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState("upcoming"); // upcoming | past

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setEvents([]);
        return;
      }
      const snap = await getDocs(query(collection(db, "events"), where("creatorId", "==", uid)));
      setEvents(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.status !== "cancelled"),
      );
    } catch (e) {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const q = search.trim().toLowerCase();
  const byTime = timeFilter === "upcoming" ? filterUpcomingEvents(events) : filterPastEvents(events);
  const filtered = (q ? byTime.filter((e) => (e.title || "").toLowerCase().includes(q)) : byTime).sort(
    (a, b) => {
      const da = new Date(a.date).getTime();
      const dbb = new Date(b.date).getTime();
      return timeFilter === "upcoming" ? da - dbb : dbb - da;
    },
  );

  const styles = createStyles(colors);

  const EventRow = ({ event }) => {
    const going = Array.isArray(event.attendees) ? event.attendees.length : event.participantCount || 0;
    const cap = event.maxPeople || event.maxAttendees || 0;
    const pct = cap > 0 ? Math.min(100, Math.round((going / cap) * 100)) : 0;
    const actions = [
      { key: "checkin", icon: "qr", label: t("manage.action.checkIn"), onPress: () => navigation.navigate("CheckInScanner", { eventId: event.id, eventTitle: event.title }) },
      { key: "roster", icon: "users", label: t("manage.action.roster"), onPress: () => navigation.navigate("EventRoster", { eventId: event.id }) },
      { key: "edit", icon: "edit", label: t("manage.action.edit"), onPress: () => navigation.navigate("EditEvent", { eventId: event.id }) },
    ];
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.navigate("EventDetail", { eventId: event.id })} activeOpacity={0.85} style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={[styles.catChip, { backgroundColor: `${colors.primary}1A` }]}>
              <Text style={[styles.catText, { color: colors.primary }]}>{event.category || t("myEvents.event")}</Text>
            </View>
            <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
              {formatISODate(event.date)} · {formatEventTime(event.date, event.time)}
            </Text>
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {event.title || t("myEvents.untitledEvent")}
          </Text>
          {cap > 0 && (
            <>
              <Text style={[styles.capText, { color: colors.textSecondary }]}>{t("manage.capacity", { going, max: cap })}</Text>
              <View style={[styles.capTrack, { backgroundColor: `${colors.primary}18` }]}>
                <View style={[styles.capFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
              </View>
            </>
          )}
        </TouchableOpacity>
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          {actions.map((a, i) => (
            <TouchableOpacity
              key={a.key}
              style={[styles.action, i > 0 && { borderLeftColor: colors.border, borderLeftWidth: StyleSheet.hairlineWidth }]}
              onPress={a.onPress}
            >
              <Icon name={a.icon} size={16} color={colors.primary} />
              <Text style={[styles.actionLabel, { color: colors.primary }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
        <Icon name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder={t("manage.searchYourEvents")}
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
          testID="your-events-search"
        />
      </View>

      {/* Upcoming / Past */}
      <View style={styles.filters}>
        {["upcoming", "past"].map((f) => (
          <TouchableOpacity key={f} style={styles.filterTab} onPress={() => setTimeFilter(f)}>
            <View style={[styles.filterGlass, { borderBottomColor: timeFilter === f ? colors.primary : "transparent" }]}>
              <Text style={[styles.filterText, { color: timeFilter === f ? colors.primary : colors.textSecondary }]}>{t(`myEvents.${f}`)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Create event — prominent */}
      <TouchableOpacity onPress={() => navigation.navigate("CreateEvent")} activeOpacity={0.85} testID="manage-create-event" style={styles.createWrap}>
        <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.createBtn, ELEVATION.floatingBrand]}>
          <View style={styles.createIcon}>
            <Icon name="add" size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[TYPE.label, styles.createText]}>{t("manage.createEvent")}</Text>
            <Text style={styles.createSub}>{t("manage.createEventSub")}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* List */}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyArt, { backgroundColor: colors.brandSoft }]}>
            <Icon name="calendar" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {timeFilter === "past" ? t("manage.empty.noPast") : t("manage.empty.noUpcoming")}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("manage.empty.text")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {filtered.map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: SPACING.screen,
      marginTop: SPACING.sm,
      marginBottom: SPACING.md,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: RADII.card,
      borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 15, padding: 0 },
    filters: { flexDirection: "row", paddingHorizontal: SPACING.screen, marginBottom: SPACING.md },
    filterTab: { flex: 1 },
    filterGlass: { paddingVertical: 10, alignItems: "center", borderBottomWidth: 2 },
    filterText: { fontSize: 14, fontWeight: "700" },
    createWrap: { marginHorizontal: SPACING.screen, marginBottom: SPACING.md },
    createBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: RADII.card,
    },
    createIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.22)",
      alignItems: "center",
      justifyContent: "center",
    },
    createText: { color: "#FFFFFF", fontSize: 17 },
    createSub: { color: "rgba(255,255,255,0.9)", fontSize: 12.5, fontWeight: "600", marginTop: 2 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    listContent: { paddingHorizontal: SPACING.screen, paddingBottom: SPACING.xxxl },
    card: { borderRadius: RADII.card, borderWidth: 1, marginBottom: SPACING.md, overflow: "hidden" },
    cardBody: { padding: 16 },
    cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    catChip: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 8 },
    catText: { fontSize: 11, fontWeight: "700" },
    cardDate: { fontSize: 12.5, fontWeight: "600" },
    cardTitle: { fontSize: 17, fontWeight: "700", letterSpacing: -0.3, marginBottom: 10 },
    capText: { fontSize: 12.5, fontWeight: "600", marginBottom: 6 },
    capTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
    capFill: { height: 7, borderRadius: 4 },
    actionsRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
    action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
    actionLabel: { fontSize: 13, fontWeight: "700" },
    empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
    emptyArt: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontWeight: "700", marginBottom: 10, letterSpacing: -0.3 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  });
}
