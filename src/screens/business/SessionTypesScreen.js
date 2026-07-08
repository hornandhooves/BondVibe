/**
 * SessionTypesScreen — private-session products (kinlo_business/03). 1:1 /
 * couple / group, duration, price. Create/edit via an inline modal.
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { listSessionTypes, createSessionType, updateSessionType, deleteSessionType, capacityKind } from "../../services/businessSessionsService";
import { formatCentavos } from "../../utils/pricing";

export default function SessionTypesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // { id?, name, capacityMax, durationMin, price, description }

  const load = useCallback(async () => {
    setTypes(await listSessionTypes());
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => setEdit({ name: "", capacityMax: "1", durationMin: "60", price: "", description: "" });
  const openEdit = (ty) => setEdit({ id: ty.id, name: ty.name, capacityMax: String(ty.capacityMax), durationMin: String(ty.durationMin), price: ty.priceCents ? String(ty.priceCents / 100) : "", description: ty.description || "" });

  const save = async () => {
    if (!edit.name.trim()) { Alert.alert(t("business.sessionType.nameRequired")); return; }
    if (edit.id) await updateSessionType(edit.id, { name: edit.name.trim(), capacityMax: parseInt(edit.capacityMax, 10) || 1, durationMin: parseInt(edit.durationMin, 10) || 60, price: edit.price, description: edit.description.trim() || null });
    else await createSessionType(edit);
    setEdit(null);
    load();
  };
  const remove = async () => { await deleteSessionType(edit.id); setEdit(null); load(); };

  const styles = createStyles(colors);
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.sessionType.title")}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openNew}><Icon name="plus" size={20} color="#fff" /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : types.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("business.sessionType.empty")}</Text>
          <TouchableOpacity style={[styles.cta, { backgroundColor: colors.primary }]} onPress={openNew}><Text style={styles.ctaText}>{t("business.sessionType.addFirst")}</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {types.map((ty) => (
            <TouchableOpacity key={ty.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => openEdit(ty)}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{ty.name}</Text>
                <Text style={[styles.meta, { color: colors.textTertiary }]}>
                  {t(`business.sessionType.kind.${capacityKind(ty.capacityMax)}`)} · {ty.durationMin}m
                </Text>
              </View>
              <Text style={[styles.price, { color: colors.text }]}>{ty.priceCents ? formatCentavos(ty.priceCents) : t("business.sessionType.creditOnly")}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!edit} transparent animationType="slide" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{edit?.id ? t("business.sessionType.edit") : t("business.sessionType.new")}</Text>
              <TouchableOpacity onPress={() => setEdit(null)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.input, inputStyle]} value={edit?.name} onChangeText={(v) => setEdit((e) => ({ ...e, name: v }))} placeholder={t("business.sessionType.namePlaceholder")} placeholderTextColor={colors.textTertiary} />
            <View style={styles.row}>
              <TextInput style={[styles.input, inputStyle, { flex: 1 }]} value={edit?.capacityMax} onChangeText={(v) => setEdit((e) => ({ ...e, capacityMax: v }))} placeholder={t("business.sessionType.capacity")} placeholderTextColor={colors.textTertiary} keyboardType="number-pad" />
              <TextInput style={[styles.input, inputStyle, { flex: 1 }]} value={edit?.durationMin} onChangeText={(v) => setEdit((e) => ({ ...e, durationMin: v }))} placeholder={t("business.sessionType.minutes")} placeholderTextColor={colors.textTertiary} keyboardType="number-pad" />
              <TextInput style={[styles.input, inputStyle, { flex: 1 }]} value={edit?.price} onChangeText={(v) => setEdit((e) => ({ ...e, price: v }))} placeholder={t("business.sessionType.priceOpt")} placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" />
            </View>
            <Text style={[styles.capHint, { color: colors.textTertiary }]}>{t("business.sessionType.capacityHint")}</Text>
            <TextInput style={[styles.input, inputStyle, { minHeight: 60, textAlignVertical: "top" }]} value={edit?.description} onChangeText={(v) => setEdit((e) => ({ ...e, description: v }))} placeholder={t("business.sessionType.descPlaceholder")} placeholderTextColor={colors.textTertiary} multiline />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save}><Text style={styles.saveText}>{t("business.sessionType.save")}</Text></TouchableOpacity>
            {edit?.id && <TouchableOpacity style={styles.deleteBtn} onPress={remove}><Text style={[styles.deleteText, { color: colors.error }]}>{t("business.sessionType.delete")}</Text></TouchableOpacity>}
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
    card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
    name: { fontSize: 15, fontWeight: "800" },
    meta: { fontSize: 12.5, marginTop: 3 },
    price: { fontSize: 14, fontWeight: "800" },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
    cta: { borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    sheetTitle: { fontSize: 17, fontWeight: "800" },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
    row: { flexDirection: "row", gap: 8 },
    capHint: { fontSize: 11.5, marginBottom: 10, marginTop: -2 },
    saveBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 6 },
    saveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    deleteBtn: { alignItems: "center", paddingVertical: 14 },
    deleteText: { fontSize: 14, fontWeight: "700" },
  });
}
