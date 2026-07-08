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
import { listStaff, inviteStaff, updateStaffRole, removeStaff } from "../../services/businessStaffService";

export default function StaffScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("reception");
  const me = auth.currentUser?.uid;

  const load = useCallback(async () => { setStaff(await listStaff()); setLoading(false); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doInvite = async () => {
    if (!email.trim()) { Alert.alert(t("business.staff.emailRequired")); return; }
    const res = await inviteStaff(email, role);
    if (res.ok) { setInviting(false); setEmail(""); load(); Alert.alert(t("business.staff.invitedTitle"), t("business.staff.invitedMsg", { name: res.name || email })); }
    else Alert.alert(t("business.staff.failTitle"), res.error === "not_found" ? t("business.staff.notFound") : res.error === "self" ? t("business.staff.selfMsg") : t("business.common.tryAgain"));
  };

  const changeRole = (s) => {
    const opts = ["instructor", "reception"].map((r) => ({ text: t(`business.staff.role.${r}`), onPress: () => updateStaffRole(s.id, r).then(load) }));
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
          {staff.map((s) => (
            <View key={s.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{s.name || s.email || t("business.staff.member")}</Text>
                <Text style={[styles.email, { color: colors.textTertiary }]} numberOfLines={1}>{s.email}</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: s.role === "owner" ? `${colors.primary}18` : colors.surfaceGlass }]}>
                <Text style={[styles.roleText, { color: s.role === "owner" ? colors.primary : colors.textSecondary }]}>{t(`business.staff.role.${s.role}`)}</Text>
              </View>
              {s.role !== "owner" && s.id !== me && (
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => changeRole(s)}><Icon name="edit" size={18} color={colors.textSecondary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(s)}><Icon name="close" size={18} color={colors.error} /></TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={inviting} transparent animationType="slide" onRequestClose={() => setInviting(false)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.staff.invite")}</Text><TouchableOpacity onPress={() => setInviting(false)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity></View>
            <TextInput style={[styles.input, inputStyle]} value={email} onChangeText={setEmail} placeholder={t("business.staff.emailPlaceholder")} placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none" />
            <View style={styles.segRow}>
              {["instructor", "reception"].map((r) => {
                const on = role === r;
                return <TouchableOpacity key={r} onPress={() => setRole(r)} style={[styles.seg, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}14` : "transparent" }]}><Text style={[styles.segText, { color: on ? colors.primary : colors.textSecondary }]}>{t(`business.staff.role.${r}`)}</Text></TouchableOpacity>;
              })}
            </View>
            <Text style={[styles.roleHint, { color: colors.textTertiary }]}>{t(`business.staff.roleHint.${role}`)}</Text>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={doInvite}><Text style={styles.saveText}>{t("business.staff.sendInvite")}</Text></TouchableOpacity>
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
    roleHint: { fontSize: 12, lineHeight: 17, marginTop: 10 },
    saveBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 14 },
    saveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
