import React, { useState, useCallback } from "react";
import Icon from "../components/Icon";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { getAttendeeIds } from "../utils/eventHelpers";
import {
  getEventReservations,
  redeemMembershipCredit,
} from "../services/membershipService";

export default function EventCheckInScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { eventId, eventTitle } = route.params || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [eventId])
  );

  const load = async () => {
    try {
      const eventSnap = await getDoc(doc(db, "events", eventId));
      const eventData = eventSnap.exists() ? eventSnap.data() : {};
      const attendeeIds = getAttendeeIds(eventData.attendees);

      const reservations = await getEventReservations(eventId);
      const resByUser = {};
      reservations.forEach((r) => {
        resByUser[r.userId] = r;
      });

      const built = await Promise.all(
        attendeeIds.map(async (uid) => {
          let name = "Member";
          let avatar = null;
          try {
            const u = await getDoc(doc(db, "users", uid));
            if (u.exists()) {
              const d = u.data();
              name = d.fullName || d.name || "Member";
              if (d.avatar) avatar = d.avatar;
            }
          } catch (e) {
            // ignore individual load failure
          }
          return { uid, name, avatar, reservation: resByUser[uid] || null };
        })
      );

      // Membership attendees first (they need check-in), then others.
      built.sort((a, b) => (b.reservation ? 1 : 0) - (a.reservation ? 1 : 0));
      setRows(built);
    } catch (e) {
      console.error("❌ Error loading check-in list:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async (row) => {
    if (!row.reservation) return;
    setCheckingIn(row.uid);
    const r = await redeemMembershipCredit(row.reservation.id);
    setCheckingIn(null);
    if (r.success) {
      load();
    } else {
      Alert.alert("Couldn't check in", r.error || "Please try again.");
    }
  };

  const styles = createStyles(colors, isDark);

  const renderRow = (row) => {
    const res = row.reservation;
    const redeemed = res?.status === "redeemed";
    return (
      <View key={row.uid} style={styles.row}>
        <AvatarDisplay avatar={row.avatar} size={36} name={row.name} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {row.name}
          </Text>
          <View style={styles.metaRow}>
            {res ? (
              <Icon name="ticket" size={13} color={colors.primary} />
            ) : (
              <Icon name="payment" size={13} color={colors.textTertiary} />
            )}
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {res ? "Membership" : "Paid / Free"}
            </Text>
          </View>
        </View>

        {res && !redeemed && (
          <TouchableOpacity
            style={[styles.checkBtn, { borderColor: colors.primary }]}
            onPress={() => handleCheckIn(row)}
            disabled={checkingIn === row.uid}
            activeOpacity={0.8}
          >
            {checkingIn === row.uid ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.checkBtnText, { color: colors.primary }]}>
                Check in
              </Text>
            )}
          </TouchableOpacity>
        )}
        {res && redeemed && (
          <View style={styles.doneBadge}>
            <Icon name="check" size={16} color="#34C759" />
            <Text style={styles.doneText}>In</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          Check-in
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!!eventTitle && (
            <Text style={[styles.eventTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {eventTitle}
            </Text>
          )}
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Tap “Check in” for members attending with a class pass to deduct their
            credit. Paid/free attendees don't need check-in.
          </Text>
          {rows.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No attendees yet.
            </Text>
          ) : (
            rows.map(renderRow)
          )}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    eventTitle: { fontSize: 15, fontWeight: "600", marginBottom: 8 },
    hint: { fontSize: 13, lineHeight: 19, marginBottom: 20 },
    empty: { fontSize: 14, textAlign: "center", marginTop: 30 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
      padding: 14,
      marginBottom: 10,
    },
    name: { fontSize: 15, fontWeight: "700" },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
    meta: { fontSize: 12, fontWeight: "500" },
    checkBtn: {
      borderWidth: 1.5,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 84,
      alignItems: "center",
    },
    checkBtnText: { fontSize: 13, fontWeight: "700" },
    doneBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
    doneText: { color: "#34C759", fontWeight: "700", fontSize: 13 },
  });
}
