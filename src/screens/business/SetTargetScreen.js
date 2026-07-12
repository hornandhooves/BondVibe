/**
 * SetTargetScreen — Revenue Targets goal setup (design_handoff_revenue_targets).
 * Owner picks a fiscal year + annual goal; mid-year, chooses how to handle the
 * months already gone (remaining-only vs full-year+backfill) and how to spread
 * the target (evenly vs manual per month). Saves the derived perMonthCents.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { listPaymentsInRange } from "../../services/businessPaymentsService";
import {
  getGoal,
  saveGoal,
  computeMonthlyTargets,
  bucketPaymentsByFiscalMonth,
  fyStartDate,
  fyPosition,
  fiscalMonthDate,
  GOAL_MODES,
  MID_YEAR_MODES,
} from "../../services/businessGoalsService";
import { formatCentavos } from "../../utils/pricing";
import { FONTS } from "../../constants/theme-tokens";

const SAVE_GRADIENT = ["#4F5BD5", "#7C3AED"];
const CARD_BORDER = "#ECE8F2";
const BANNER_BG = "#FDF0DC";
const BANNER_BORDER = "#F2D9A8";
const BANNER_TEXT = "#92600A";

const monthName = (m, locale, long = true) => new Date(2000, m, 1).toLocaleDateString(locale, { month: long ? "long" : "short" });

export default function SetTargetScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const now = new Date();

  const [fyStartMonth, setFyStartMonth] = useState(0);
  const [annual, setAnnual] = useState("");
  const [mode, setMode] = useState(GOAL_MODES.EVEN);
  const [midYearMode, setMidYearMode] = useState(MID_YEAR_MODES.REMAINING);
  const [manual, setManual] = useState({}); // fiscal index -> string pesos
  const [createdAt, setCreatedAt] = useState(null);
  const [elapsedActual, setElapsedActual] = useState(new Array(12).fill(0));
  const [monthPicker, setMonthPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const position = fyPosition(fyStartMonth, now);
  const elapsed = position - 1;
  const remaining = 12 - elapsed;
  const midYear = elapsed > 0;
  const annualCents = Math.round((parseFloat(annual) || 0) * 100);

  // Load existing goal once.
  useEffect(() => {
    (async () => {
      const g = await getGoal();
      if (g) {
        setFyStartMonth(g.fyStartMonth || 0);
        setAnnual(g.annualCents ? String(g.annualCents / 100) : "");
        setMode(g.mode || GOAL_MODES.EVEN);
        setMidYearMode(g.midYearMode || MID_YEAR_MODES.REMAINING);
        setCreatedAt(g.createdAt || null);
        if (Array.isArray(g.perMonthCents)) {
          const m = {};
          g.perMonthCents.forEach((c, i) => { if (c) m[i] = String(c / 100); });
          setManual(m);
        }
      }
      setLoading(false);
    })();
  }, []);

  // Elapsed-month actual (for backfill split + explainer), re-queried per FY start.
  // Guard against out-of-order responses bucketing against a stale start month.
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = fyStartDate(fyStartMonth, now);
      const pays = await listPaymentsInRange(s.toISOString(), now.toISOString());
      if (alive) setElapsedActual(bucketPaymentsByFiscalMonth(pays, fyStartMonth, now));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fyStartMonth]);

  const booked = elapsedActual.slice(0, elapsed).reduce((s, c) => s + (c || 0), 0);
  const remTargetCents = midYearMode === MID_YEAR_MODES.BACKFILL ? Math.max(0, annualCents - booked) : Math.round((annualCents * remaining) / 12);
  const perMonthEven = remaining > 0 ? Math.round(remTargetCents / remaining) : 0;

  const onSave = useCallback(async () => {
    if (annualCents <= 0) {
      Alert.alert(t("business.goal.amountRequiredTitle"), t("business.goal.amountRequiredMsg"));
      return;
    }
    setSaving(true);
    try {
      const perMonthManual = new Array(12).fill(0);
      for (let i = 0; i < 12; i++) perMonthManual[i] = Math.round((parseFloat(manual[i]) || 0) * 100);
      const perMonthCents = computeMonthlyTargets({
        annualCents,
        mode,
        midYearMode,
        perMonthManual,
        position,
        actualElapsedByFMonth: elapsedActual,
      });
      await saveGoal({ fyStartMonth, annualCents, mode, midYearMode, perMonthCents, createdAt });
      navigation.navigate("BusinessTargetTracker");
    } catch (e) {
      setSaving(false);
      Alert.alert(t("business.common.errorTitle"), t("business.common.tryAgain"));
    }
  }, [annualCents, mode, midYearMode, manual, position, elapsedActual, fyStartMonth, createdAt, navigation, t]);

  const styles = createStyles(colors);
  const cardBorder = isDark ? colors.border : CARD_BORDER;
  const fieldBg = isDark ? colors.surfaceGlass : "#F5F3F9";

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      </GradientBackground>
    );
  }

  const endMonth = (fyStartMonth + 11) % 12;

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.goal.title")}</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Fiscal year */}
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.goal.fiscalYear")}</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
            <View style={styles.fyRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>{t("business.goal.starts")}</Text>
                <TouchableOpacity style={[styles.dropField, { backgroundColor: fieldBg }]} onPress={() => setMonthPicker(true)}>
                  <Text style={[styles.dropValue, { color: colors.text }]}>{monthName(fyStartMonth, i18n.language)}</Text>
                  <Icon name="down" size={13} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>{t("business.goal.ends")}</Text>
                <View style={[styles.dropField, { backgroundColor: fieldBg, opacity: 0.7 }]}>
                  <Text style={[styles.dropValue, { color: colors.text }]}>{monthName(endMonth, i18n.language)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Mid-year banner */}
          {midYear && (
            <View style={[styles.banner, { backgroundColor: BANNER_BG, borderColor: BANNER_BORDER }]}>
              <Icon name="info" size={15} color={BANNER_TEXT} style={{ marginTop: 1 }} />
              <Text style={styles.bannerText}>{t("business.goal.midYearBanner", { n: position })}</Text>
            </View>
          )}

          {/* Annual goal */}
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.goal.annualGoal")}</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder, flexDirection: "row", alignItems: "center" }]}>
            <Text style={[styles.dollar, { color: colors.primary }]}>$</Text>
            <TextInput
              style={[styles.annualInput, { color: colors.text }]}
              value={annual}
              onChangeText={setAnnual}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
            />
            <Text style={[styles.unit, { color: colors.textTertiary }]}>{t("business.goal.perYear")}</Text>
          </View>

          {/* Year in progress (mid-year only) */}
          {midYear && (
            <>
              <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.goal.yearInProgress")}</Text>
              {[
                { id: MID_YEAR_MODES.REMAINING, title: t("business.goal.remainingTitle"), sub: t("business.goal.remainingSub", { n: remaining }) },
                { id: MID_YEAR_MODES.BACKFILL, title: t("business.goal.backfillTitle"), sub: t("business.goal.backfillSub") },
              ].map((opt) => {
                const sel = midYearMode === opt.id;
                return (
                  <TouchableOpacity key={opt.id} onPress={() => setMidYearMode(opt.id)} activeOpacity={0.85} style={[styles.radioCard, { backgroundColor: colors.surface, borderColor: sel ? colors.primary : cardBorder, borderWidth: sel ? 1.5 : 1 }]}>
                    <View style={[styles.ring, { borderColor: sel ? colors.primary : "#C9C6D2", borderWidth: sel ? 5 : 1.5 }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.radioTitle, { color: colors.text }]}>{opt.title}</Text>
                      <Text style={[styles.radioSub, { color: colors.textTertiary }]}>{opt.sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {/* Distribute */}
          <Text style={[styles.eyebrow, { color: colors.textTertiary }]}>{t("business.goal.distribute")}</Text>
          <View style={styles.toggleTrack}>
            {[
              { id: GOAL_MODES.EVEN, label: t("business.goal.evenly") },
              { id: GOAL_MODES.MANUAL, label: t("business.goal.manual") },
            ].map((seg) => {
              const active = mode === seg.id;
              return (
                <TouchableOpacity key={seg.id} style={[styles.toggleSeg, active && { backgroundColor: "#4F5BD5" }]} onPress={() => setMode(seg.id)} activeOpacity={0.85}>
                  <Text style={[active ? styles.toggleActive : styles.toggleInactive, { color: active ? "#fff" : colors.textSecondary }]}>{seg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {mode === GOAL_MODES.EVEN ? (
            <View style={styles.explainer}>
              <Text style={styles.explainerText}>
                {t("business.goal.evenExplainer", {
                  total: formatCentavos(remTargetCents),
                  months: remaining,
                  perMonth: formatCentavos(perMonthEven),
                })}
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: cardBorder, marginTop: 9 }]}>
              {Array.from({ length: remaining }, (_, k) => elapsed + k).map((fi, k) => {
                const cal = fiscalMonthDate(fyStartMonth, fi, now).getMonth();
                return (
                  <View key={fi} style={[styles.manualRow, k > 0 && { borderTopColor: colors.divider || "#F0ECF6", borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.manualMonth, { color: colors.text }]}>{monthName(cal, i18n.language)}</Text>
                    <View style={[styles.manualInputWrap, { backgroundColor: fieldBg }]}>
                      <Text style={[styles.manualDollar, { color: colors.textTertiary }]}>$</Text>
                      <TextInput
                        style={[styles.manualInput, { color: colors.text }]}
                        value={manual[fi] || ""}
                        onChangeText={(v) => setManual((m) => ({ ...m, [fi]: v }))}
                        placeholder="0"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={onSave} disabled={saving} activeOpacity={0.9} style={styles.saveShadow}>
            <LinearGradient colors={SAVE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{t("business.goal.save")}</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Fiscal-year start month picker */}
      <Modal visible={monthPicker} transparent animationType="fade" onRequestClose={() => setMonthPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setMonthPicker(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t("business.goal.starts")}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {Array.from({ length: 12 }, (_, m) => (
                <TouchableOpacity key={m} style={styles.modalRow} onPress={() => { setFyStartMonth(m); setMonthPicker(false); }}>
                  <Text style={[styles.modalRowText, { color: fyStartMonth === m ? colors.primary : colors.text }]}>{monthName(m, i18n.language)}</Text>
                  {fyStartMonth === m && <Icon name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 60, paddingBottom: 8 },
    headerTitle: { fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.4 },
    content: { paddingHorizontal: 16, paddingBottom: 24 },
    eyebrow: { fontFamily: FONTS.bodyBold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 20, marginBottom: 9, paddingHorizontal: 4 },
    card: { borderWidth: 1, borderRadius: 16, padding: 15 },
    fyRow: { flexDirection: "row", gap: 12 },
    fieldLabel: { fontFamily: FONTS.bodySemibold, fontSize: 10.5, letterSpacing: 0.3, marginBottom: 6 },
    dropField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
    dropValue: { fontFamily: FONTS.bodyBold, fontSize: 13.5 },
    banner: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginTop: 14 },
    bannerText: { flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 11.5, lineHeight: 17, color: BANNER_TEXT },
    dollar: { fontFamily: FONTS.display, fontSize: 26, marginRight: 4 },
    annualInput: { flex: 1, fontFamily: FONTS.display, fontSize: 26, letterSpacing: -0.5, padding: 0 },
    unit: { fontFamily: FONTS.bodyMedium, fontSize: 13, marginLeft: 6 },
    radioCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 15, marginBottom: 10 },
    ring: { width: 18, height: 18, borderRadius: 9 },
    radioTitle: { fontFamily: FONTS.bodyBold, fontSize: 13 },
    radioSub: { fontFamily: FONTS.bodyMedium, fontSize: 10.5, marginTop: 2 },
    toggleTrack: { flexDirection: "row", backgroundColor: "#E7E3F0", borderRadius: 12, padding: 3 },
    toggleSeg: { flex: 1, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    toggleActive: { fontFamily: FONTS.bodyExtra, fontSize: 13.5 },
    toggleInactive: { fontFamily: FONTS.bodyBold, fontSize: 13.5 },
    explainer: { backgroundColor: "#EEF1FC", borderRadius: 12, padding: 13, marginTop: 9 },
    explainerText: { fontFamily: FONTS.bodyMedium, fontSize: 12, lineHeight: 17, color: "#3d47ab" },
    manualRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
    manualMonth: { fontFamily: FONTS.bodySemibold, fontSize: 13.5 },
    manualInputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 130 },
    manualDollar: { fontFamily: FONTS.display, fontSize: 14, marginRight: 3 },
    manualInput: { flex: 1, fontFamily: FONTS.display, fontSize: 14, letterSpacing: -0.2, padding: 0, textAlign: "right" },
    footer: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 6 },
    saveShadow: { borderRadius: 27, shadowColor: "#4F5BD5", shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#fff", fontFamily: FONTS.bodyExtra, fontSize: 16 },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 32 },
    modalSheet: { borderRadius: 18, padding: 18, maxWidth: 400, alignSelf: "center", width: "100%" },
    modalTitle: { fontFamily: FONTS.bodyExtra, fontSize: 15, marginBottom: 8 },
    modalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 13 },
    modalRowText: { fontFamily: FONTS.bodySemibold, fontSize: 15 },
  });
}
