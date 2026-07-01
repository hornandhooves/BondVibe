import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { getEventReservations } from "../services/membershipService";
import { getAttendeeIds } from "../utils/eventHelpers";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function EventRosterScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { eventId } = route.params || {};
  const [rows, setRows] = useState([]);
  const [waitRows, setWaitRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const evSnap = await getDoc(doc(db, "events", eventId));
        if (!evSnap.exists()) return;
        const e = evSnap.data();
        const attendees = getAttendeeIds(e.attendees);
        const waitlist = Array.isArray(e.waitlist) ? e.waitlist : [];
        const isPast = e.date && new Date(e.date).getTime() < Date.now();
        const isFree = (e.price || 0) === 0;

        const [checkSnap, reservations] = await Promise.all([
          getDocs(collection(db, "events", eventId, "checkins")),
          getEventReservations(eventId).catch(() => []),
        ]);
        const checkedIn = new Set(checkSnap.docs.map((d) => d.id));
        const membershipIds = new Set(reservations.map((r) => r.userId));

        const resolve = async (ids) =>
          Promise.all(
            ids.map(async (id) => {
              const u = await getDoc(doc(db, "users", id));
              const d = u.exists() ? u.data() : {};
              return { id, name: d.fullName || d.name || "Member", avatar: d.avatar };
            })
          );

        const [aUsers, wUsers] = await Promise.all([
          resolve(attendees),
          resolve(waitlist),
        ]);

        setRows(
          aUsers.map((u) => ({
            ...u,
            tag: isFree ? "Free" : membershipIds.has(u.id) ? "Membership" : "Paid",
            status: checkedIn.has(u.id) ? "checked-in" : isPast ? "no-show" : "going",
          }))
        );
        setWaitRows(wUsers);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  const styles = createStyles(colors, isDark);
  const STATUS = {
    "checked-in": { label: "Checked in", color: "#34C759" },
    "no-show": { label: "No-show", color: "#EF4444" },
    going: { label: "Going", color: colors.textSecondary },
  };

  const Row = ({ u }) => (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <AvatarDisplay avatar={normAvatar(u.avatar)} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {u.name}
        </Text>
        {!!u.tag && (
          <Text style={[styles.tag, { color: colors.textTertiary }]}>{u.tag}</Text>
        )}
      </View>
      {u.status && (
        <Text style={[styles.status, { color: STATUS[u.status].color }]}>
          {STATUS[u.status].label}
        </Text>
      )}
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Attendees</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.counts}>
            <Text style={[styles.count, { color: colors.text }]}>
              {rows.length} going
            </Text>
            <Text style={[styles.count, { color: "#34C759" }]}>
              {rows.filter((r) => r.status === "checked-in").length} checked in
            </Text>
            {rows.some((r) => r.status === "no-show") && (
              <Text style={[styles.count, { color: "#EF4444" }]}>
                {rows.filter((r) => r.status === "no-show").length} no-show
              </Text>
            )}
          </View>

          {rows.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>No attendees yet.</Text>
          ) : (
            rows.map((u) => <Row key={u.id} u={u} />)
          )}

          {waitRows.length > 0 && (
            <>
              <Text style={[styles.section, { color: colors.textSecondary }]}>
                WAITLIST ({waitRows.length})
              </Text>
              {waitRows.map((u, i) => (
                <Row key={u.id} u={{ ...u, tag: `#${i + 1} in line` }} />
              ))}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    back: { fontSize: 28 },
    headerTitle: { fontSize: 18, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    counts: { flexDirection: "row", gap: 16, marginBottom: 16, flexWrap: "wrap" },
    count: { fontSize: 14, fontWeight: "700" },
    muted: { fontSize: 13 },
    section: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 20, marginBottom: 10 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    name: { fontSize: 15, fontWeight: "700" },
    tag: { fontSize: 12, marginTop: 2 },
    status: { fontSize: 13, fontWeight: "700" },
  });
}
