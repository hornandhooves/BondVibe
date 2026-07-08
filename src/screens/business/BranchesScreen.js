/**
 * BranchesScreen — multi-branch management (kinlo_business/01 §7). One business,
 * many branches; members/classes carry a branchId and the dashboard rolls up
 * across them.
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { listBranches, addBranch, updateBranch, removeBranch } from "../../services/businessService";

export default function BranchesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // { id?, name, address }

  const load = useCallback(async () => { setBranches(await listBranches()); setLoading(false); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!edit.name.trim()) { Alert.alert(t("business.branches.nameRequired")); return; }
    if (edit.id) await updateBranch(edit.id, { name: edit.name.trim(), address: edit.address.trim() || null });
    else await addBranch({ name: edit.name, address: edit.address });
    setEdit(null); load();
  };
  const remove = async () => { await removeBranch(edit.id); setEdit(null); load(); };

  const styles = createStyles(colors);
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.branches.title")}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setEdit({ name: "", address: "" })}><Icon name="plus" size={20} color="#fff" /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : branches.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("business.branches.empty")}</Text>
          <TouchableOpacity style={[styles.cta, { backgroundColor: colors.primary }]} onPress={() => setEdit({ name: "", address: "" })}><Text style={styles.ctaText}>{t("business.branches.addFirst")}</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {branches.map((br) => (
            <TouchableOpacity key={br.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setEdit({ id: br.id, name: br.name, address: br.address || "" })}>
              <Icon name="location" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{br.name}</Text>
                {!!br.address && <Text style={[styles.addr, { color: colors.textTertiary }]} numberOfLines={1}>{br.address}</Text>}
              </View>
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.text }]}>{edit?.id ? t("business.branches.edit") : t("business.branches.new")}</Text><TouchableOpacity onPress={() => setEdit(null)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity></View>
            <TextInput style={[styles.input, inputStyle]} value={edit?.name} onChangeText={(v) => setEdit((e) => ({ ...e, name: v }))} placeholder={t("business.branches.namePlaceholder")} placeholderTextColor={colors.textTertiary} />
            <TextInput style={[styles.input, inputStyle]} value={edit?.address} onChangeText={(v) => setEdit((e) => ({ ...e, address: v }))} placeholder={t("business.branches.addressPlaceholder")} placeholderTextColor={colors.textTertiary} />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save}><Text style={styles.saveText}>{t("business.branches.save")}</Text></TouchableOpacity>
            {edit?.id && <TouchableOpacity style={styles.deleteBtn} onPress={remove}><Text style={[styles.deleteText, { color: colors.error }]}>{t("business.branches.delete")}</Text></TouchableOpacity>}
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
    card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
    name: { fontSize: 15, fontWeight: "800" },
    addr: { fontSize: 12.5, marginTop: 2 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
    cta: { borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    sheetTitle: { fontSize: 17, fontWeight: "800" },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
    saveBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 2 },
    saveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    deleteBtn: { alignItems: "center", paddingVertical: 14 },
    deleteText: { fontSize: 14, fontWeight: "700" },
  });
}
