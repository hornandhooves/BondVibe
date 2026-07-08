/**
 * SessionDetailScreen — a booking's detail + lifecycle actions
 * (kinlo_business/03): confirm/decline (requested) · mark done / no-show /
 * reschedule / cancel / message (confirmed). Marking done fires the existing
 * rating flow for members with an app account; message opens the 1:1 DM thread.
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import { getMember } from "../../services/businessMembersService";
import {
  getBooking, confirmBooking, declineBooking, cancelBooking, markDone, markNoShow, updateBooking, BOOKING_STATUS,
} from "../../services/businessSessionsService";

export default function SessionDetailScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const bookingId = route.params?.bookingId;
  const [b, setB] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reschedule, setReschedule] = useState(null); // { date, time }

  const load = useCallback(async () => { setB(await getBooking(bookingId)); setLoading(false); }, [bookingId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusMeta = {
    requested: { color: colors.warning },
    confirmed: { color: colors.success },
    done: { color: colors.primary },
    no_show: { color: colors.error },
    cancelled: { color: colors.textTertiary },
    declined: { color: colors.textTertiary },
  };

  const doAction = async (fn, ...args) => { await fn(...args); load(); };

  const onMessage = async () => {
    const first = (b.members || [])[0];
    if (!first) return;
    const full = await getMember(first.memberId);
    if (full?.linkedUid) navigation.navigate("DMChat", { otherUid: full.linkedUid, name: full.name });
    else Alert.alert(t("business.session.noAppTitle"), t("business.session.noAppMsg"));
  };

  const applyReschedule = async () => {
    const start = new Date(reschedule.date);
    const [h, mn] = (reschedule.time || "10:00").split(":").map((n) => parseInt(n, 10) || 0);
    start.setHours(h, mn, 0, 0);
    await updateBooking(bookingId, { start: start.toISOString() });
    setReschedule(null);
    load();
  };

  const styles = createStyles(colors);
  if (loading) return <GradientBackground><View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View></GradientBackground>;
  if (!b) return <GradientBackground><View style={styles.loading}><Text style={{ color: colors.textSecondary }}>{t("business.session.notFound")}</Text></View></GradientBackground>;

  const meta = statusMeta[b.status] || statusMeta.confirmed;
  const when = new Date(b.start).toLocaleString(i18n.language, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.session.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusPill, { backgroundColor: `${meta.color}22` }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{t(`business.session.status.${b.status}`)}</Text>
        </View>

        <Text style={[styles.members, { color: colors.text }]}>{(b.members || []).map((m) => m.name).join(", ")}</Text>
        <Text style={[styles.type, { color: colors.textSecondary }]}>{b.sessionTypeName} · {b.durationMin}m</Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row label={t("business.session.when")} value={when} colors={colors} />
          {!!b.location && <Row label={t("business.classForm.location")} value={b.location} colors={colors} />}
          <Row label={t("business.session.paidWith")} value={t(`business.payment.method.${b.paidWith}`)} colors={colors} />
        </View>

        {!!b.notes && (
          <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.notesText, { color: colors.text }]}>{b.notes}</Text>
          </View>
        )}

        {/* Actions */}
        {b.status === BOOKING_STATUS.REQUESTED && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.ghost, { borderColor: colors.border }]} onPress={() => doAction(declineBooking, b.id)}><Text style={[styles.ghostText, { color: colors.textSecondary }]}>{t("business.agenda.decline")}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary }]} onPress={() => doAction(confirmBooking, b)}><Text style={styles.primaryText}>{t("business.agenda.confirm")}</Text></TouchableOpacity>
          </View>
        )}
        {b.status === BOOKING_STATUS.CONFIRMED && (
          <>
            <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary, marginTop: 20 }]} onPress={() => doAction(markDone, b.id)}><Text style={styles.primaryText}>{t("business.session.markDone")}</Text></TouchableOpacity>
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.ghost, { borderColor: colors.border }]} onPress={() => setReschedule({ date: new Date(b.start), time: new Date(b.start).toTimeString().slice(0, 5) })}><Text style={[styles.ghostText, { color: colors.text }]}>{t("business.session.reschedule")}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.ghost, { borderColor: colors.border }]} onPress={onMessage}><Text style={[styles.ghostText, { color: colors.text }]}>{t("business.session.message")}</Text></TouchableOpacity>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.ghost, { borderColor: colors.border }]} onPress={() => doAction(markNoShow, b.id)}><Text style={[styles.ghostText, { color: colors.textSecondary }]}>{t("business.session.noShow")}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.ghost, { borderColor: `${colors.error}55` }]} onPress={() => doAction(cancelBooking, b.id)}><Text style={[styles.ghostText, { color: colors.error }]}>{t("business.session.cancel")}</Text></TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!reschedule} transparent animationType="fade" onRequestClose={() => setReschedule(null)}>
        <View style={styles.centerBackdrop}>
          <View style={[styles.reCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.reTitle, { color: colors.text }]}>{t("business.session.reschedule")}</Text>
            <DateField label={t("business.booking.date")} value={reschedule?.date} onChange={(v) => setReschedule((r) => ({ ...r, date: v }))} />
            <TextInput style={[styles.reInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} value={reschedule?.time} onChangeText={(v) => setReschedule((r) => ({ ...r, time: v }))} placeholder="10:00" placeholderTextColor={colors.textTertiary} />
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.ghost, { borderColor: colors.border }]} onPress={() => setReschedule(null)}><Text style={[styles.ghostText, { color: colors.textSecondary }]}>{t("business.common.cancel")}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary }]} onPress={applyReschedule}><Text style={styles.primaryText}>{t("business.session.save")}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function Row({ label, value, colors }) {
  return (
    <View style={rowStyles.row}>
      <Text style={[rowStyles.label, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[rowStyles.value, { color: colors.text }]}>{value}</Text>
    </View>
  );
}
const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9 },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
});

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    statusPill: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginBottom: 14 },
    statusText: { fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
    members: { fontSize: 22, fontWeight: "800" },
    type: { fontSize: 14, marginTop: 4 },
    card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, marginTop: 18 },
    notesCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
    notesText: { fontSize: 13.5, lineHeight: 19 },
    actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    ghost: { flex: 1, borderWidth: 1, borderRadius: 24, paddingVertical: 13, alignItems: "center" },
    ghostText: { fontSize: 14, fontWeight: "700" },
    primary: { flex: 1, borderRadius: 24, paddingVertical: 14, alignItems: "center" },
    primaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    centerBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 32 },
    reCard: { width: "100%", borderRadius: 20, padding: 20 },
    reTitle: { fontSize: 16, fontWeight: "800", marginBottom: 14 },
    reInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 10 },
  });
}
