/**
 * BookingFormScreen — the host books a private session by hand (kinlo_business/
 * 03). Pick a type, member(s) up to its capacity, date/time, location, and how
 * it's paid (session credit or money). Creating it settles the booking.
 */
import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import { listSessionTypes, createBooking, PAID_WITH } from "../../services/businessSessionsService";
import { listMembers } from "../../services/businessMembersService";

export default function BookingFormScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [types, setTypes] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [typeId, setTypeId] = useState(null);
  const [selected, setSelected] = useState([]); // [{memberId,name}]
  const [pick, setPick] = useState(false);
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [paidWith, setPaidWith] = useState("credit");

  useEffect(() => {
    (async () => {
      const [ty, ms] = await Promise.all([listSessionTypes(), listMembers()]);
      setTypes(ty); setMembers(ms);
      if (ty[0]) { setTypeId(ty[0].id); setLocation(""); }
      setLoading(false);
    })();
  }, []);

  const type = types.find((x) => x.id === typeId);
  const cap = type?.capacityMax || 1;

  const toggleMember = (m) => {
    setSelected((cur) => {
      if (cur.some((x) => x.memberId === m.id)) return cur.filter((x) => x.memberId !== m.id);
      if (cur.length >= cap) return cur;
      return [...cur, { memberId: m.id, name: m.name }];
    });
  };

  const onSave = async () => {
    if (!type) { Alert.alert(t("business.booking.typeRequired")); return; }
    if (selected.length === 0) { Alert.alert(t("business.booking.memberRequired")); return; }
    const start = new Date(date);
    const [h, mn] = time.split(":").map((n) => parseInt(n, 10) || 0);
    start.setHours(h, mn, 0, 0);
    setSaving(true);
    try {
      await createBooking({
        members: selected,
        sessionTypeId: type.id,
        sessionTypeName: type.name,
        start: start.toISOString(),
        durationMin: type.durationMin,
        location: location.trim() || null,
        paidWith,
        priceCents: type.priceCents || 0,
        status: "confirmed",
      });
      navigation.goBack();
    } catch (e) {
      setSaving(false);
      Alert.alert(t("business.common.errorTitle"), t("business.common.tryAgain"));
    }
  };

  const styles = createStyles(colors);
  if (loading) return <GradientBackground><View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View></GradientBackground>;
  if (types.length === 0) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={styles.header}><TouchableOpacity onPress={() => navigation.goBack()}><Icon name="close" size={26} color={colors.text} /></TouchableOpacity><Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.booking.title")}</Text><View style={{ width: 28 }} /></View>
        <View style={styles.loading}>
          <Text style={{ color: colors.textSecondary, textAlign: "center", paddingHorizontal: 40 }}>{t("business.booking.needTypes")}</Text>
          <TouchableOpacity style={[styles.cta, { backgroundColor: colors.primary }]} onPress={() => navigation.replace("BusinessSessionTypes")}><Text style={styles.ctaText}>{t("business.sessionType.title")}</Text></TouchableOpacity>
        </View>
      </GradientBackground>
    );
  }
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="close" size={26} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.booking.title")}</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.booking.type")}</Text>
          <View style={styles.chips}>
            {types.map((ty) => {
              const active = typeId === ty.id;
              return <TouchableOpacity key={ty.id} onPress={() => { setTypeId(ty.id); setSelected([]); }} style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}18` : "transparent" }]}><Text style={[styles.chipText, { color: active ? colors.primary : colors.textSecondary }]}>{ty.name}</Text></TouchableOpacity>;
            })}
          </View>

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.booking.members", { n: cap })}</Text>
          <View style={styles.chips}>
            {selected.map((m) => (
              <TouchableOpacity key={m.memberId} style={[styles.chipSel, { backgroundColor: `${colors.primary}18` }]} onPress={() => setSelected((c) => c.filter((x) => x.memberId !== m.memberId))}>
                <Text style={[styles.chipText, { color: colors.primary }]}>{m.name}</Text><Icon name="close" size={12} color={colors.primary} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.chip, { borderColor: colors.border }]} onPress={() => setPick(true)}><Text style={[styles.chipText, { color: colors.textSecondary }]}>+ {t("business.booking.add")}</Text></TouchableOpacity>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 2 }}><Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.booking.date")}</Text><DateField label={t("business.booking.date")} value={date} onChange={setDate} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.booking.time")}</Text><TextInput style={[styles.input, inputStyle]} value={time} onChangeText={setTime} placeholder="10:00" placeholderTextColor={colors.textTertiary} /></View>
          </View>

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.classForm.location")}</Text>
          <TextInput style={[styles.input, inputStyle]} value={location} onChangeText={setLocation} placeholder={t("business.classForm.locationPlaceholder")} placeholderTextColor={colors.textTertiary} />

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.booking.paidWith")}</Text>
          <View style={styles.segRow}>
            {PAID_WITH.map((p) => {
              const active = paidWith === p;
              return <TouchableOpacity key={p} onPress={() => setPaidWith(p)} style={[styles.seg, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}14` : "transparent" }]}><Text style={[styles.segText, { color: active ? colors.primary : colors.textSecondary }]}>{t(`business.payment.method.${p}`)}</Text></TouchableOpacity>;
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={onSave} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{t("business.booking.save")}</Text>}
          </TouchableOpacity>
        </View>

        <Modal visible={pick} transparent animationType="slide" onRequestClose={() => setPick(false)}>
          <View style={styles.sheetBackdrop}>
            <View style={[styles.sheet, { backgroundColor: colors.background }]}>
              <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.booking.pickMembers")}</Text><TouchableOpacity onPress={() => setPick(false)}><Icon name="close" size={22} color={colors.textSecondary} /></TouchableOpacity></View>
              <ScrollView style={{ maxHeight: 400 }}>
                {members.map((m) => {
                  const on = selected.some((x) => x.memberId === m.id);
                  return (
                    <TouchableOpacity key={m.id} style={[styles.pickRow, { borderColor: colors.border }]} onPress={() => toggleMember(m)}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }}>{m.name}</Text>
                      {on && <Icon name="successCircle" size={18} color={colors.success} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 24 },
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8, marginTop: 8 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
    chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
    chipSel: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
    chipText: { fontSize: 13, fontWeight: "700" },
    row: { flexDirection: "row", gap: 10 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 8 },
    segRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    seg: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, flexGrow: 1, alignItems: "center" },
    segText: { fontSize: 12, fontWeight: "700" },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    cta: { borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28, marginTop: 16 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    sheetTitle: { fontSize: 16, fontWeight: "800" },
    pickRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  });
}
