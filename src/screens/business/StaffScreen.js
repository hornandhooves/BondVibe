/**
 * StaffScreen — staff roles (kinlo_business/01 §7). Invite by email, set a
 * scoped role (owner / instructor / reception), and remove. Reception can't see
 * finance (enforced in rules).
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { auth } from "../../services/firebase";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { listStaff, inviteStaff, updateStaffRole, removeStaff, getWorkingHours, setWorkingHours, listRoles, listStaffInvites } from "../../services/businessStaffService";

const weekdayShort = (i, lang) => new Date(2024, 0, 7 + i).toLocaleDateString(lang || "en", { weekday: "narrow" });

export default function StaffScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("reception");
  const [roles, setRoles] = useState([]);
  const [invites, setInvites] = useState([]);
  const [whEdit, setWhEdit] = useState(null); // { id, days, start, end }
  const me = auth.currentUser?.uid;

  const assignable = roles.filter((r) => r.id !== "owner");

  const openWorkingHours = (s) => {
    const wh = getWorkingHours(s);
    setWhEdit({ id: s.id, days: [...wh.days], start: wh.start, end: wh.end });
  };
  const toggleWhDay = (d) =>
    setWhEdit((w) => ({ ...w, days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d] }));
  const saveWorkingHours = async () => {
    await setWorkingHours(whEdit.id, { days: whEdit.days, start: whEdit.start.trim(), end: whEdit.end.trim() });
    setWhEdit(null);
    load();
  };

  const load = useCallback(async () => {
    const [st, rl, iv] = await Promise.all([listStaff(), listRoles(), listStaffInvites()]);
    setStaff(st);
    setRoles(rl);
    setInvites(iv);
    setRole((cur) => (rl.some((r) => r.id === cur && r.id !== "owner") ? cur : (rl.find((r) => r.id !== "owner")?.id || "reception")));
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const roleName = (id) => roles.find((r) => r.id === id)?.name || t(`business.staff.role.${id}`, { defaultValue: id });

  const doInvite = async () => {
    if (!email.trim()) { Alert.alert(t("business.staff.emailRequired")); return; }
    const res = await inviteStaff(email, role);
    if (res.ok && res.pending) {
      setInviting(false); setEmail(""); load();
      Alert.alert(t("business.staff.pendingTitle"), t("business.staff.pendingMsg", { email: email.trim() }));
    } else if (res.ok) {
      setInviting(false); setEmail(""); load();
      Alert.alert(t("business.staff.invitedTitle"), t("business.staff.invitedMsg", { name: res.name || email }));
    } else {
      Alert.alert(t("business.staff.failTitle"), res.error === "self" ? t("business.staff.selfMsg") : t("business.common.tryAgain"));
    }
  };

  const changeRole = (s) => {
    const opts = assignable.map((r) => ({ text: r.name, onPress: () => updateStaffRole(s.id, r.id).then(load) }));
    Alert.alert(t("business.staff.changeRole"), s.name || s.email, [...opts, { text: t("business.common.cancel"), style: "cancel" }]);
  };

  const remove = (s) =>
    Alert.alert(t("business.staff.removeTitle"), t("business.staff.removeMsg", { name: s.name || s.email }), [
      { text: t("business.common.cancel"), style: "cancel" },
      { text: t("business.staff.remove"), style: "destructive", onPress: () => removeStaff(s.id).then(load) },
    ]);

  const styles = createStyles(colors);
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.staff.title")}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setInviting(true)}><Icon name="plus" size={20} color="#fff" /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>{t("business.staff.hint")}</Text>

          <TouchableOpacity
            style={[styles.rolesEntry, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate("BusinessRoles")}
          >
            <View style={[styles.rolesIcon, { backgroundColor: colors.brandSoft }]}><Icon name="settings" size={17} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rolesTitle, { color: colors.text }]}>{t("business.roles.title")}</Text>
              <Text style={[styles.rolesSub, { color: colors.textTertiary }]}>{t("business.roles.entrySub")}</Text>
            </View>
            <Icon name="forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          {invites.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.staff.pendingSection")}</Text>
              {invites.map((iv) => (
                <View key={iv.id} style={[styles.inviteRow, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                  <Icon name="clock" size={15} color={colors.warning} />
                  <Text style={[styles.inviteEmail, { color: colors.text }]} numberOfLines={1}>{iv.email}</Text>
                  <Text style={[styles.inviteRole, { color: colors.textTertiary }]}>{roleName(iv.role)}</Text>
                </View>
              ))}
            </>
          )}

          {staff.map((s) => {
            const wh = getWorkingHours(s);
            const canHaveHours = s.role === "owner" || s.role === "instructor";
            return (
              <View key={s.id} style={[styles.cardWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]}>{s.name || s.email || t("business.staff.member")}</Text>
                    <Text style={[styles.email, { color: colors.textTertiary }]} numberOfLines={1}>{s.email}</Text>
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: s.role === "owner" ? `${colors.primary}18` : colors.surfaceGlass }]}>
                    <Text style={[styles.roleText, { color: s.role === "owner" ? colors.primary : colors.textSecondary }]}>{roleName(s.role)}</Text>
                  </View>
                  {s.role !== "owner" && s.id !== me && (
                    <View style={styles.actions}>
                      <TouchableOpacity onPress={() => changeRole(s)}><Icon name="edit" size={18} color={colors.textSecondary} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => remove(s)}><Icon name="close" size={18} color={colors.error} /></TouchableOpacity>
                    </View>
                  )}
                </View>
                {canHaveHours && (
                  <TouchableOpacity style={[styles.whRow, { borderTopColor: colors.border }]} onPress={() => openWorkingHours(s)}>
                    <Icon name="clock" size={15} color={colors.textTertiary} />
                    <Text style={[styles.whText, { color: colors.textSecondary }]}>
                      {t("business.staff.workingHours")}: {wh.start}–{wh.end} · {wh.days.map((d) => weekdayShort(d, i18n.language)).join("")}
                    </Text>
                    <Icon name="edit" size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={inviting} transparent animationType="slide" onRequestClose={() => setInviting(false)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.staff.invite")}</Text><TouchableOpacity onPress={() => setInviting(false)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity></View>
            <TextInput style={[styles.input, inputStyle]} value={email} onChangeText={setEmail} placeholder={t("business.staff.emailPlaceholder")} placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none" />
            <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 8 }]}>{t("business.staff.pickRole")}</Text>
            <View style={styles.roleWrap}>
              {assignable.map((r) => {
                const on = role === r.id;
                return <TouchableOpacity key={r.id} onPress={() => setRole(r.id)} style={[styles.roleChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}14` : "transparent" }]}><Text style={[styles.segText, { color: on ? colors.primary : colors.textSecondary }]}>{r.name}</Text></TouchableOpacity>;
              })}
            </View>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={doInvite}><Text style={styles.saveText}>{t("business.staff.sendInvite")}</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Working-hours editor (frames the Agenda's default range) */}
      <Modal visible={!!whEdit} transparent animationType="slide" onRequestClose={() => setWhEdit(null)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.staff.workingHours")}</Text><TouchableOpacity onPress={() => setWhEdit(null)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity></View>
            <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 10 }]}>{t("business.staff.workingDays")}</Text>
            <View style={styles.dayRow}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const on = whEdit?.days.includes(d);
                return (
                  <TouchableOpacity key={d} onPress={() => toggleWhDay(d)} style={[styles.dayChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}18` : "transparent" }]}>
                    <Text style={[styles.dayChipText, { color: on ? colors.primary : colors.textSecondary }]}>{weekdayShort(d, i18n.language)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 6 }]}>{t("business.staff.startTime")}</Text>
                <TextInput style={[styles.input, inputStyle, { marginBottom: 0 }]} value={whEdit?.start} onChangeText={(v) => setWhEdit((w) => ({ ...w, start: v }))} placeholder="07:00" placeholderTextColor={colors.textTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleHint, { color: colors.textTertiary, marginTop: 0, marginBottom: 6 }]}>{t("business.staff.endTime")}</Text>
                <TextInput style={[styles.input, inputStyle, { marginBottom: 0 }]} value={whEdit?.end} onChangeText={(v) => setWhEdit((w) => ({ ...w, end: v }))} placeholder="20:00" placeholderTextColor={colors.textTertiary} />
              </View>
            </View>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveWorkingHours}><Text style={styles.saveText}>{t("business.agenda.save")}</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    hint: { fontSize: 12.5, lineHeight: 18, marginBottom: 14 },
    card: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
    cardWrap: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: "hidden" },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
    whRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 11 },
    whText: { flex: 1, fontSize: 12.5, fontWeight: "600" },
    dayRow: { flexDirection: "row", gap: 6 },
    dayChip: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
    dayChipText: { fontSize: 12, fontWeight: "800" },
    timeRow: { flexDirection: "row", gap: 12, marginTop: 14 },
    name: { fontSize: 15, fontWeight: "700" },
    email: { fontSize: 12, marginTop: 2 },
    roleBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    roleText: { fontSize: 11.5, fontWeight: "700" },
    actions: { flexDirection: "row", gap: 12, marginLeft: 4 },
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    sheetTitle: { fontSize: 17, fontWeight: "800" },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
    segRow: { flexDirection: "row", gap: 8 },
    seg: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
    segText: { fontSize: 13.5, fontWeight: "700" },
    rolesEntry: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16 },
    rolesIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    rolesTitle: { fontSize: 14.5, fontWeight: "800" },
    rolesSub: { fontSize: 12, marginTop: 2 },
    sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
    inviteRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 },
    inviteEmail: { flex: 1, fontSize: 13.5, fontWeight: "600" },
    inviteRole: { fontSize: 12, fontWeight: "700" },
    roleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    roleChip: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
    roleHint: { fontSize: 12, lineHeight: 17, marginTop: 10 },
    saveBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 14 },
    saveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
