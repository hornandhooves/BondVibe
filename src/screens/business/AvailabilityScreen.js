/**
 * AvailabilityScreen — publishable open slots for private sessions
 * (kinlo_business/03). Recurring weekdays or a one-off date, time, duration,
 * type, location, capacity. Used by the agenda and (later) attendee self-serve.
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
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import { listAvailability, createAvailability, deleteAvailability, listSessionTypes } from "../../services/businessSessionsService";

const weekdayShort = (i, lang) => new Date(2024, 0, 7 + i).toLocaleDateString(lang || "en", { weekday: "short" });

export default function AvailabilityScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const [slots, setSlots] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    const [s, ty] = await Promise.all([listAvailability(), listSessionTypes()]);
    setSlots(s); setTypes(ty); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => setForm({ sessionTypeId: types[0]?.id || null, weekdays: [], date: null, time: "10:00", durationMin: String(types[0]?.durationMin || 60), location: "", capacity: "1" }) || setAdding(true);
  const toggleDay = (d) => setForm((f) => ({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] }));

  const save = async () => {
    if (form.weekdays.length === 0 && !form.date) { Alert.alert(t("business.availability.whenRequired")); return; }
    const ty = types.find((x) => x.id === form.sessionTypeId);
    await createAvailability({ ...form, date: form.weekdays.length === 0 && form.date ? form.date.toISOString() : null, sessionTypeName: ty?.name || "" });
    setAdding(false); load();
  };

  const styles = createStyles(colors);
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.availability.title")}</Text>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openNew}><Icon name="plus" size={20} color="#fff" /></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : types.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("business.availability.needTypes")}</Text>
          <TouchableOpacity style={[styles.cta, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate("BusinessSessionTypes")}><Text style={styles.ctaText}>{t("business.sessionType.title")}</Text></TouchableOpacity>
        </View>
      ) : slots.length === 0 ? (
        <View style={styles.empty}><Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("business.availability.empty")}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {slots.map((s) => (
            <View key={s.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{s.sessionTypeName || t("business.availability.slot")}</Text>
                <Text style={[styles.meta, { color: colors.textTertiary }]}>
                  {(s.weekdays?.length ? s.weekdays.map((d) => weekdayShort(d, i18n.language)).join(" ") : s.date ? new Date(s.date).toLocaleDateString() : "")} · {s.time} · {s.durationMin}m{s.location ? ` · ${s.location}` : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => deleteAvailability(s.id).then(load)}><Icon name="close" size={18} color={colors.textTertiary} /></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView style={styles.sheetBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.availability.new")}</Text>
              <TouchableOpacity onPress={() => setAdding(false)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.chips}>
                {types.map((ty) => {
                  const active = form?.sessionTypeId === ty.id;
                  return <TouchableOpacity key={ty.id} onPress={() => setForm((f) => ({ ...f, sessionTypeId: ty.id, durationMin: String(ty.durationMin) }))} style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}18` : "transparent" }]}><Text style={[styles.chipText, { color: active ? colors.primary : colors.textSecondary }]}>{ty.name}</Text></TouchableOpacity>;
                })}
              </View>
              <View style={styles.dayRow}>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const active = form?.weekdays.includes(d);
                  return <TouchableOpacity key={d} onPress={() => toggleDay(d)} style={[styles.dayChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}18` : "transparent" }]}><Text style={[styles.dayChipText, { color: active ? colors.primary : colors.textSecondary }]}>{weekdayShort(d, i18n.language)}</Text></TouchableOpacity>;
                })}
              </View>
              {form?.weekdays.length === 0 && <DateField label={t("business.classForm.date")} value={form?.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} onClear={() => setForm((f) => ({ ...f, date: null }))} />}
              <View style={styles.row}>
                <TextInput style={[styles.input, inputStyle, { flex: 1 }]} value={form?.time} onChangeText={(v) => setForm((f) => ({ ...f, time: v }))} placeholder="10:00" placeholderTextColor={colors.textTertiary} />
                <TextInput style={[styles.input, inputStyle, { flex: 1 }]} value={form?.capacity} onChangeText={(v) => setForm((f) => ({ ...f, capacity: v }))} placeholder={t("business.sessionType.capacity")} placeholderTextColor={colors.textTertiary} keyboardType="number-pad" />
              </View>
              <TextInput style={[styles.input, inputStyle]} value={form?.location} onChangeText={(v) => setForm((f) => ({ ...f, location: v }))} placeholder={t("business.classForm.locationPlaceholder")} placeholderTextColor={colors.textTertiary} />
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save}><Text style={styles.saveText}>{t("business.availability.save")}</Text></TouchableOpacity>
            </ScrollView>
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
    card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
    name: { fontSize: 14.5, fontWeight: "800" },
    meta: { fontSize: 12, marginTop: 3 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
    cta: { borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, maxHeight: "85%" },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    sheetTitle: { fontSize: 17, fontWeight: "800" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
    chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
    chipText: { fontSize: 13, fontWeight: "700" },
    dayRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
    dayChip: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
    dayChipText: { fontSize: 11, fontWeight: "700" },
    row: { flexDirection: "row", gap: 8 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
    saveBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 6 },
    saveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
