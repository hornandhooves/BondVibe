/**
 * SessionsAgendaScreen — the private-sessions home (kinlo_business/03).
 * Requests inbox (confirm/decline inline), upcoming confirmed sessions, and
 * entries to session types + availability. Host books manually with +.
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import ListRow from "../../components/ListRow";
import { useTheme } from "../../contexts/ThemeContext";
import { listBookings, confirmBooking, declineBooking, BOOKING_STATUS } from "../../services/businessSessionsService";

const fmt = (iso, lang) => new Date(iso).toLocaleString(lang || "en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const names = (b) => (b.members || []).map((m) => m.name).join(", ") || "—";

export default function SessionsAgendaScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setBookings(await listBookings());
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const requests = bookings.filter((b) => b.status === BOOKING_STATUS.REQUESTED);
  const now = Date.now();
  const upcoming = bookings.filter((b) => b.status === BOOKING_STATUS.CONFIRMED && new Date(b.start).getTime() >= now - 3600000);

  const onConfirm = async (b) => { await confirmBooking(b); load(); };
  const onDecline = async (b) => { await declineBooking(b.id); load(); };

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.agenda.title")}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate("BusinessBookingForm", {})}><Icon name="plus" size={20} color="#fff" /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ListRow icon="ai" title={t("business.sessionType.title")} onPress={() => navigation.navigate("BusinessSessionTypes")} />
            <ListRow icon="calendarCheck" title={t("business.availability.title")} onPress={() => navigation.navigate("BusinessAvailability")} divider={false} />
          </View>

          {requests.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.agenda.requests")} ({requests.length})</Text>
              {requests.map((b) => (
                <View key={b.id} style={[styles.reqCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.reqName, { color: colors.text }]}>{names(b)}</Text>
                  <Text style={[styles.reqMeta, { color: colors.textTertiary }]}>{b.sessionTypeName} · {fmt(b.start, i18n.language)}</Text>
                  <View style={styles.reqActions}>
                    <TouchableOpacity style={[styles.declineBtn, { borderColor: colors.border }]} onPress={() => onDecline(b)}><Text style={[styles.declineText, { color: colors.textSecondary }]}>{t("business.agenda.decline")}</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={() => onConfirm(b)}><Text style={styles.confirmText}>{t("business.agenda.confirm")}</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.agenda.upcoming")}</Text>
          {upcoming.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t("business.agenda.noUpcoming")}</Text>
            </View>
          ) : (
            upcoming.map((b) => (
              <TouchableOpacity key={b.id} style={[styles.card2, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.primary }]} onPress={() => navigation.navigate("BusinessSessionDetail", { bookingId: b.id })}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{names(b)}</Text>
                  <Text style={[styles.meta, { color: colors.textTertiary }]} numberOfLines={1}>{b.sessionTypeName}{b.location ? ` · ${b.location}` : ""}</Text>
                </View>
                <Text style={[styles.time, { color: colors.primary }]}>{fmt(b.start, i18n.language)}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    card: { borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 8 },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 20, marginBottom: 10 },
    reqCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
    reqName: { fontSize: 15, fontWeight: "800" },
    reqMeta: { fontSize: 12.5, marginTop: 3 },
    reqActions: { flexDirection: "row", gap: 10, marginTop: 12 },
    declineBtn: { flex: 1, borderWidth: 1, borderRadius: 20, paddingVertical: 10, alignItems: "center" },
    declineText: { fontSize: 13.5, fontWeight: "700" },
    confirmBtn: { flex: 1, borderRadius: 20, paddingVertical: 10, alignItems: "center" },
    confirmText: { color: "#fff", fontSize: 13.5, fontWeight: "700" },
    card2: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderLeftWidth: 3, borderRadius: 14, padding: 14, marginBottom: 10 },
    name: { fontSize: 15, fontWeight: "800" },
    meta: { fontSize: 12.5, marginTop: 2 },
    time: { fontSize: 12, fontWeight: "800", textAlign: "right", maxWidth: 120 },
    emptyCard: { borderWidth: 1, borderRadius: 14, padding: 16, alignItems: "center" },
    emptyText: { fontSize: 13, textAlign: "center" },
  });
}
