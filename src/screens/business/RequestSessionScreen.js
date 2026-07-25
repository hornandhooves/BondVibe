/**
 * RequestSessionScreen (attendee) — self-serve private-session request
 * (kinlo_business/03 flow 5). Pick a session type + a time; the server creates a
 * 'requested' booking and the host confirms/declines.
 */
import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import { getBusinessSessionTypes, requestSession } from "../../services/businessPassService";
import { formatCentavos } from "../../utils/pricing";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";

export default function RequestSessionScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { bizId, businessName } = route.params || {};
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeId, setTypeId] = useState(null);
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState("10:00");
  const { loading: busy, run } = useAsyncLoad(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const ty = await getBusinessSessionTypes(bizId);
      setTypes(ty);
      if (ty[0]) setTypeId(ty[0].id);
      setLoading(false);
    })();
  }, [bizId]);

  const type = types.find((x) => x.id === typeId);

  const submit = () => {
    if (!type) return;
    const start = new Date(date);
    const [h, mn] = time.split(":").map((n) => parseInt(n, 10) || 0);
    start.setHours(h, mn, 0, 0);
    return run(async () => {
      const res = await requestSession({ bizId, sessionTypeId: type.id, sessionTypeName: type.name, start: start.toISOString(), durationMin: type.durationMin });
      if (res.ok) setDone(true);
    });
  };

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{businessName || t("business.request.title")}</Text>
          <View style={{ width: 28 }} />
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : done ? (
          <View style={styles.center}>
            <View style={[styles.art, { backgroundColor: `${colors.success}18` }]}><Icon name="successCircle" size={40} color={colors.success} /></View>
            <Text style={[styles.doneTitle, { color: colors.text }]}>{t("business.request.sentTitle")}</Text>
            <Text style={[styles.doneText, { color: colors.textSecondary }]}>{t("business.request.sentText")}</Text>
            <TouchableOpacity style={[styles.cta, { backgroundColor: colors.primary }]} onPress={() => navigation.goBack()}><Text style={styles.ctaText}>{t("business.request.done")}</Text></TouchableOpacity>
          </View>
        ) : types.length === 0 ? (
          <View style={styles.center}><Text style={{ color: colors.textSecondary, textAlign: "center", paddingHorizontal: 40 }}>{t("business.request.noTypes")}</Text></View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.request.pickType")}</Text>
              {types.map((ty) => {
                const on = typeId === ty.id;
                return (
                  <TouchableOpacity key={ty.id} onPress={() => setTypeId(ty.id)} style={[styles.typeCard, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}0F` : colors.surface }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeName, { color: colors.text }]}>{ty.name}</Text>
                      <Text style={[styles.typeMeta, { color: colors.textTertiary }]}>{ty.durationMin}m</Text>
                    </View>
                    <Text style={[styles.typePrice, { color: colors.text }]}>{ty.priceCents ? formatCentavos(ty.priceCents) : t("business.request.credit")}</Text>
                  </TouchableOpacity>
                );
              })}

              <View style={styles.row}>
                <View style={{ flex: 2 }}><Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.booking.date")}</Text><DateField label={t("business.booking.date")} value={date} onChange={setDate} minimumDate={new Date()} /></View>
                <View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.booking.time")}</Text><TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} value={time} onChangeText={setTime} placeholder="10:00" placeholderTextColor={colors.textTertiary} /></View>
              </View>
              <Text style={[styles.hint, { color: colors.textTertiary }]}>{t("business.request.hint")}</Text>
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity style={[styles.cta, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} onPress={submit} disabled={busy}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.ctaText}>{t("business.request.send")}</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, gap: 12 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", textAlign: "center" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
    art: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 18 },
    doneTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8, textAlign: "center" },
    doneText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
    content: { paddingHorizontal: 24, paddingBottom: 20 },
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8, marginTop: 8 },
    typeCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 10 },
    typeName: { fontSize: 15, fontWeight: "800" },
    typeMeta: { fontSize: 12.5, marginTop: 2 },
    typePrice: { fontSize: 14, fontWeight: "800" },
    row: { flexDirection: "row", gap: 10, marginTop: 8 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    hint: { fontSize: 12, lineHeight: 17, marginTop: 12 },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    cta: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
