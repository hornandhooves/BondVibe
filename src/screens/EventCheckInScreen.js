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
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { getAttendeeIds } from "../utils/eventHelpers";
import {
  getEventReservations,
  redeemMembershipCredit,
  undoMembershipRedemption,
} from "../services/membershipService";

export default function EventCheckInScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { eventId, eventTitle } = route.params || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

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

      const [reservations, checkinsSnap] = await Promise.all([
        getEventReservations(eventId),
        getDocs(collection(db, "events", eventId, "checkins")),
      ]);
      const resByUser = {};
      reservations.forEach((r) => { resByUser[r.userId] = r; });
      const checkedInIds = new Set(checkinsSnap.docs.map((d) => d.id));

      const built = await Promise.all(
        attendeeIds.map(async (uid) => {
          let name = t("eventCheckIn.member");
          let avatar = null;
          try {
            const u = await getDoc(doc(db, "users", uid));
            if (u.exists()) {
              const d = u.data();
              name = d.fullName || d.name || t("eventCheckIn.member");
              if (d.avatar) avatar = d.avatar;
            }
          } catch (e) {
            // ignore individual load failure
          }
          const reservation = resByUser[uid] || null;
          // A membership reservation redeemed before this screen wrote a checkins
          // doc still counts as checked in (legacy).
          const checkedIn = checkedInIds.has(uid) || reservation?.status === "redeemed";
          return { uid, name, avatar, reservation, checkedIn };
        })
      );
      built.sort((a, b) => a.name.localeCompare(b.name));
      setRows(built);
    } catch (e) {
      console.error("❌ Error loading check-in list:", e);
    } finally {
      setLoading(false);
    }
  };

  // Toggle a single attendee. Membership attendees also settle the credit
  // (redeem on check-in, restore on undo); everyone flips a checkins doc so the
  // "checked in" signal is uniform (and recap-photo eligibility works).
  const toggle = async (row) => {
    setBusy(row.uid);
    try {
      if (row.checkedIn) {
        if (row.reservation) {
          const r = await undoMembershipRedemption(row.reservation.id);
          if (!r.success) throw new Error(r.error);
        }
        await deleteDoc(doc(db, "events", eventId, "checkins", row.uid)).catch(() => {});
      } else {
        if (row.reservation) {
          const r = await redeemMembershipCredit(row.reservation.id);
          if (!r.success) throw new Error(r.error);
        }
        await setDoc(doc(db, "events", eventId, "checkins", row.uid), {
          userId: row.uid,
          name: row.name,
          checkedInAt: new Date().toISOString(),
          by: auth.currentUser?.uid || null,
        });
      }
      await load();
    } catch (e) {
      Alert.alert(t("eventCheckIn.couldntCheckIn"), e?.message || t("eventCheckIn.pleaseTryAgain"));
    } finally {
      setBusy(null);
    }
  };

  const styles = createStyles(colors, isDark);
  const checkedIn = rows.filter((r) => r.checkedIn);
  const notCheckedIn = rows.filter((r) => !r.checkedIn);

  const renderRow = (row) => (
    <View key={row.uid} style={styles.row}>
      <AvatarDisplay avatar={row.avatar} size={36} name={row.name} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{row.name}</Text>
        <View style={styles.metaRow}>
          <Icon name={row.reservation ? "ticket" : "payment"} size={13} color={row.reservation ? colors.primary : colors.textTertiary} />
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {row.reservation ? t("eventCheckIn.membership") : t("eventCheckIn.paidOrFree")}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.toggle,
          row.checkedIn
            ? { borderColor: colors.border }
            : { borderColor: colors.primary, backgroundColor: `${colors.primary}12` },
        ]}
        onPress={() => toggle(row)}
        disabled={busy === row.uid}
        activeOpacity={0.8}
      >
        {busy === row.uid ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={[styles.toggleText, { color: row.checkedIn ? colors.textSecondary : colors.primary }]}>
            {row.checkedIn ? t("eventCheckIn.undo") : t("eventCheckIn.checkIn")}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {t("eventCheckIn.title")}
        </Text>
        <TouchableOpacity
          style={[styles.qrBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate("CheckInScanner", { eventId, eventTitle })}
        >
          <Icon name="qr" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!!eventTitle && (
            <Text style={[styles.eventTitle, { color: colors.textSecondary }]} numberOfLines={1}>{eventTitle}</Text>
          )}
          {rows.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>{t("eventCheckIn.noAttendees")}</Text>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                {t("eventCheckIn.notCheckedIn")} · {notCheckedIn.length}
              </Text>
              {notCheckedIn.length === 0 ? (
                <Text style={[styles.sectionEmpty, { color: colors.textTertiary }]}>{t("eventCheckIn.allIn")}</Text>
              ) : (
                notCheckedIn.map(renderRow)
              )}

              <Text style={[styles.sectionLabel, { color: colors.textTertiary, marginTop: 22 }]}>
                {t("eventCheckIn.checkedIn")} · {checkedIn.length}
              </Text>
              {checkedIn.length === 0 ? (
                <Text style={[styles.sectionEmpty, { color: colors.textTertiary }]}>{t("eventCheckIn.noneYet")}</Text>
              ) : (
                checkedIn.map(renderRow)
              )}
            </>
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
    headerTitle: { fontSize: 20, fontWeight: "700", flex: 1, textAlign: "center", marginHorizontal: 8 },
    qrBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    eventTitle: { fontSize: 15, fontWeight: "600", marginBottom: 16 },
    empty: { fontSize: 14, textAlign: "center", marginTop: 30 },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 },
    sectionEmpty: { fontSize: 13, marginBottom: 6 },
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
    toggle: {
      borderWidth: 1.5,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 84,
      alignItems: "center",
    },
    toggleText: { fontSize: 13, fontWeight: "700" },
  });
}
