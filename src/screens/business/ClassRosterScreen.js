/**
 * ClassRosterScreen — a class's roster (kinlo_business/01 §5). Capacity bar,
 * booked members (mark present → attendance + credit deduct), waitlist with
 * promote, and manual booking from any member. Cancelling a booking auto-
 * promotes the first waitlisted member.
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import {
  getClass,
  bookMember,
  removeFromRoster,
  removeFromWaitlist,
} from "../../services/businessClassesService";
import { listMembers, getMember } from "../../services/businessMembersService";
import { markPresent } from "../../services/businessAttendanceService";

const weekdayShort = (i, lang) => new Date(2024, 0, 7 + i).toLocaleDateString(lang || "en", { weekday: "short" });

export default function ClassRosterScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const classId = route.params?.classId;
  const [cls, setCls] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pickMember, setPickMember] = useState(false);
  const [members, setMembers] = useState([]);

  const load = useCallback(async () => {
    setCls(await getClass(classId));
    setLoading(false);
  }, [classId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openPicker = async () => {
    setMembers(await listMembers());
    setPickMember(true);
  };

  const onBook = async (m) => {
    setPickMember(false);
    const res = await bookMember(cls, m);
    await load();
    if (res.status === "waitlist") Alert.alert(t("business.roster.waitlistedTitle"), t("business.roster.waitlistedMsg", { name: m.name }));
    else if (res.status === "already") Alert.alert(t("business.roster.alreadyTitle"), t("business.roster.alreadyMsg"));
  };

  const onRemove = async (memberId) => {
    const res = await removeFromRoster(cls, memberId);
    await load();
    if (res.promoted) Alert.alert(t("business.roster.promotedTitle"), t("business.roster.promotedMsg", { name: res.promoted.name }));
  };

  const onMarkPresent = async (entry) => {
    const full = await getMember(entry.memberId);
    if (!full) return;
    const res = await markPresent({ ...full, id: entry.memberId }, { classTitle: cls.title });
    Alert.alert(
      t("business.attendance.markedTitle"),
      res.creditDeducted ? t("business.attendance.markedCredit", { remaining: res.remaining }) : t("business.attendance.marked")
    );
  };

  const styles = createStyles(colors);
  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </GradientBackground>
    );
  }
  if (!cls) {
    return (
      <GradientBackground>
        <View style={styles.loading}><Text style={{ color: colors.textSecondary }}>{t("business.roster.notFound")}</Text></View>
      </GradientBackground>
    );
  }

  const roster = cls.roster || [];
  const waitlist = cls.waitlist || [];
  const full = roster.length >= (cls.capacity || 1);
  const schedule =
    (cls.weekdays?.length ? cls.weekdays.map((d) => weekdayShort(d, i18n.language)).join(" · ") : cls.date ? new Date(cls.date).toLocaleDateString() : "") + `  ${cls.time || ""}`;

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{cls.title}</Text>
        {/* Class details are set on the Create-Event form (kinlo_business/06 FIX 2);
            this screen manages the roster. */}
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.schedule, { color: colors.textSecondary }]}>
          {schedule}{cls.instructor ? ` · ${cls.instructor}` : ""}{cls.location ? ` · ${cls.location}` : ""}
        </Text>

        <View style={styles.capRow}>
          <View style={[styles.capTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.capFill, { width: `${Math.min(1, roster.length / (cls.capacity || 1)) * 100}%`, backgroundColor: full ? colors.warning : colors.primary }]} />
          </View>
          <Text style={[styles.capText, { color: colors.text }]}>{roster.length}/{cls.capacity}</Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.roster.booked")}</Text>
        {roster.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t("business.roster.noneBooked")}</Text>
          </View>
        ) : (
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {roster.map((r, i) => (
              <View key={r.memberId} style={[styles.row, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
                <TouchableOpacity style={[styles.presentBtn, { backgroundColor: `${colors.success}18` }]} onPress={() => onMarkPresent(r)}>
                  <Text style={[styles.presentText, { color: colors.success }]}>{t("business.roster.present")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onRemove(r.memberId)}>
                  <Icon name="close" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {waitlist.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.roster.waitlist")} ({waitlist.length})</Text>
            <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {waitlist.map((w, i) => (
                <View key={w.memberId} style={[styles.row, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.rowPos, { color: colors.textTertiary }]}>#{i + 1}</Text>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{w.name}</Text>
                  <TouchableOpacity onPress={() => removeFromWaitlist(cls, w.memberId).then(load)}>
                    <Icon name="close" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.bookBtn, { backgroundColor: colors.primary }]} onPress={openPicker}>
          <Icon name="add" size={18} color="#fff" />
          <Text style={styles.bookText}>{full ? t("business.roster.addWaitlist") : t("business.roster.book")}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={pickMember} transparent animationType="slide" onRequestClose={() => setPickMember(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.roster.pickMember")}</Text>
              <TouchableOpacity onPress={() => setPickMember(false)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {members.map((m) => (
                <TouchableOpacity key={m.id} style={[styles.pickRow, { borderColor: colors.border }]} onPress={() => onBook(m)}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>{m.name}</Text>
                  <Icon name="forward" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, gap: 12 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    schedule: { fontSize: 13, fontWeight: "600" },
    capRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
    capTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
    capFill: { height: 8, borderRadius: 4 },
    capText: { fontSize: 14, fontWeight: "800" },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 22, marginBottom: 10 },
    listCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
    rowPos: { fontSize: 12, fontWeight: "700", width: 22 },
    rowName: { flex: 1, fontSize: 14.5, fontWeight: "600" },
    presentBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
    presentText: { fontSize: 12, fontWeight: "700" },
    emptyCard: { borderWidth: 1, borderRadius: 14, padding: 16, alignItems: "center" },
    emptyText: { fontSize: 13, textAlign: "center" },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    bookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 27 },
    bookText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    sheetTitle: { fontSize: 16, fontWeight: "800" },
    pickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  });
}
