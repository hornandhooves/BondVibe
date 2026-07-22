/**
 * RolesScreen — host-managed roles & permissions (kinlo_business/07 FIX 4).
 * Lists the business's roles; tap one to rename it (non-owner) and toggle its
 * access to each Business area. The owner can also add custom roles. Route
 * guards read these perms (getMyRolePerms / useBusinessPerms).
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch, Modal, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { BUSINESS_AREAS, roleAllows } from "../../constants/businessRoles";
import { listRoles, saveRole, addRole, removeRole } from "../../services/businessStaffService";

export default function RolesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // { id, name, editableName, removable, perms }

  const load = useCallback(async () => { setRoles(await listRoles()); setLoading(false); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = (r) => setEdit({ ...r, perms: { ...(r.perms || {}) } });
  // Toggle by the RESOLVED value (roleAllows: finance is default-deny), and store
  // an EXPLICIT boolean so the saved matrix never has undefined keys.
  const togglePerm = (a) => setEdit((e) => ({ ...e, perms: { ...e.perms, [a]: !roleAllows(e.perms, a) } }));

  const saveEdit = async () => {
    // Write the FULL boolean matrix (every area explicit) so the client switches
    // and the server rule can't disagree — a missing key used to read "on" on the
    // client but the finance rule (#59) denies it. Owner keeps all-true.
    const isOwner = edit.id === "owner";
    const perms = Object.fromEntries(
      BUSINESS_AREAS.map((a) => [a, isOwner ? true : roleAllows(edit.perms, a)])
    );
    const patch = { perms };
    if (edit.editableName) patch.name = (edit.name || "").trim() || edit.name;
    await saveRole(edit.id, patch);
    setEdit(null);
    load();
  };

  const onAddRole = async () => {
    // New roles: everything on EXCEPT finance (default-deny, mirrors the server).
    const perms = Object.fromEntries(BUSINESS_AREAS.map((a) => [a, a !== "finance"]));
    const created = await addRole({ name: t("business.roles.newRole"), perms });
    load();
    if (created) openEdit(created);
  };

  const onRemove = (r) =>
    Alert.alert(t("business.roles.removeTitle"), r.name, [
      { text: t("business.common.cancel"), style: "cancel" },
      { text: t("business.roles.remove"), style: "destructive", onPress: async () => { await removeRole(r.id); setEdit(null); load(); } },
    ]);

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.roles.title")}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={onAddRole}><Icon name="plus" size={20} color="#fff" /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>{t("business.roles.hint")}</Text>
          {roles.map((r) => {
            const on = BUSINESS_AREAS.filter((a) => roleAllows(r.perms, a)).length;
            return (
              <TouchableOpacity key={r.id} style={[styles.roleRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => openEdit(r)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.roleName, { color: colors.text }]}>{r.name}{r.id === "owner" ? ` · ${t("business.roles.locked")}` : ""}</Text>
                  <Text style={[styles.roleMeta, { color: colors.textTertiary }]}>{t("business.roles.areasCount", { n: on, total: BUSINESS_AREAS.length })}</Text>
                </View>
                <Icon name="forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Role editor */}
      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.roles.editTitle")}</Text>
              <TouchableOpacity onPress={() => setEdit(null)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            {edit?.editableName ? (
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={edit?.name}
                onChangeText={(v) => setEdit((e) => ({ ...e, name: v }))}
                placeholder={t("business.roles.namePlaceholder")}
                placeholderTextColor={colors.textTertiary}
              />
            ) : (
              <Text style={[styles.lockedName, { color: colors.text }]}>{edit?.name} · {t("business.roles.locked")}</Text>
            )}
            <ScrollView style={{ maxHeight: 340, marginTop: 8 }}>
              {BUSINESS_AREAS.map((a) => {
                const owner = edit?.id === "owner";
                return (
                  <View key={a} style={[styles.permRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.permLabel, { color: colors.text }]}>{t(`business.roles.area.${a}`)}</Text>
                    <Switch
                      value={owner ? true : roleAllows(edit?.perms, a)}
                      onValueChange={() => togglePerm(a)}
                      disabled={owner}
                      trackColor={{ true: colors.primary }}
                    />
                  </View>
                );
              })}
            </ScrollView>
            {edit?.removable && (
              <TouchableOpacity style={styles.removeBtn} onPress={() => onRemove(edit)}>
                <Icon name="delete" size={15} color={colors.error} />
                <Text style={[styles.removeText, { color: colors.error }]}>{t("business.roles.remove")}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveEdit}>
              <Text style={styles.saveText}>{t("business.roles.save")}</Text>
            </TouchableOpacity>
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
    roleRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
    roleName: { fontSize: 15.5, fontWeight: "800" },
    roleMeta: { fontSize: 12.5, marginTop: 3 },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    sheetTitle: { fontSize: 17, fontWeight: "800" },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    lockedName: { fontSize: 15, fontWeight: "700" },
    permRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    permLabel: { fontSize: 14.5, fontWeight: "600" },
    removeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, marginTop: 4 },
    removeText: { fontSize: 14, fontWeight: "700" },
    saveBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 8 },
    saveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
