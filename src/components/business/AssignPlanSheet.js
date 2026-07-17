import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../Icon";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import { usePremium } from "../../hooks/usePremium";
import { listManualPlans } from "../../services/plansService";
import {
  assignPlanManually,
  PAYMENT_METHODS,
  paymentMethodLabelKey,
} from "../../services/planAssignService";
import { formatCentavos } from "../../utils/pricing";

/**
 * "Assign a plan" — the host hands a membership to a member and says how it was
 * paid. Kinlo Pro.
 *
 * Merges what used to be two steps, assign-package and record-payment, because
 * they were always the same moment: someone paid you in cash and now they have
 * credits.
 *
 * The Pro check here is UX, not security — it keeps an honest host from walking
 * into a paywalled action. The real gate is the assignPlanManually callable,
 * which verifies the entitlement server-side before writing anything.
 *
 * @param {{visible: boolean, onClose: () => void, bizId: string, memberId: string,
 *   memberName?: string, onAssigned?: () => void, navigation: object}} p
 */
export default function AssignPlanSheet({
  visible,
  onClose,
  bizId,
  memberId,
  memberName,
  onAssigned,
  navigation,
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isPremium } = usePremium();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState(null);
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    listManualPlans(bizId)
      .then((rows) => {
        setPlans(rows);
        setPlanId(rows[0]?.id || null);
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [visible, bizId]);

  const submit = async () => {
    if (!planId) return;
    setSaving(true);
    try {
      await assignPlanManually({ bizId, memberId, planId, paymentMethod: method });
      onAssigned?.();
      onClose();
    } catch (e) {
      // Surface the server's own answer rather than a generic failure — these
      // are decisions, not glitches.
      const code = e?.message || "";
      Alert.alert(
        t("plans.assign.errorTitle"),
        code.includes("kinlo_pro_required")
          ? t("plans.assign.errorPro")
          : code.includes("audience_mismatch")
          ? t("plans.assign.errorAudience")
          : t("business.common.tryAgain")
      );
    } finally {
      setSaving(false);
    }
  };

  const s = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={[s.grabber, { backgroundColor: colors.border }]} />

          <View style={s.titleRow}>
            <Text style={[s.title, { color: colors.text }]}>{t("plans.assign.title")}</Text>
            <View style={[s.proBadge, { backgroundColor: colors.primary }]}>
              <Text style={[s.proBadgeText, { color: colors.onPrimary }]}>{t("plans.form.pro")}</Text>
            </View>
          </View>
          <Text style={[s.sub, { color: colors.textSecondary }]}>
            {memberName ? t("plans.assign.subFor", { name: memberName }) : t("plans.assign.sub")}
          </Text>

          {!isPremium ? (
            <View style={s.gate}>
              <Text style={[s.gateText, { color: colors.textSecondary }]}>{t("plans.assign.proGate")}</Text>
              <TouchableOpacity
                style={[s.cta, { backgroundColor: colors.primary }]}
                onPress={() => {
                  onClose();
                  navigation?.navigate("BondVibePro");
                }}
                testID="assign-go-pro"
              >
                <Text style={[s.ctaText, { color: colors.onPrimary }]}>{t("plans.assign.seePro")}</Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <View style={s.centre}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : plans.length === 0 ? (
            <View style={s.gate}>
              {/* Honest empty state: this isn't an error, they just have no
                  hand-assignable plan yet. */}
              <Text style={[s.gateText, { color: colors.textSecondary }]}>{t("plans.assign.noPlans")}</Text>
              <TouchableOpacity
                style={[s.cta, { backgroundColor: colors.primary }]}
                onPress={() => {
                  onClose();
                  navigation?.navigate("BusinessPlanForm", {});
                }}
              >
                <Text style={[s.ctaText, { color: colors.onPrimary }]}>{t("plans.assign.createPlan")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[s.label, { color: colors.textTertiary }]}>{t("plans.assign.planLabel")}</Text>
              <ScrollView style={s.planList} showsVerticalScrollIndicator={false}>
                {plans.map((p) => {
                  const active = planId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => setPlanId(p.id)}
                      activeOpacity={0.85}
                      testID={`assign-plan-${p.id}`}
                      style={[
                        s.planRow,
                        {
                          backgroundColor: active ? colors.brandSoft : colors.background,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.planName, { color: colors.text }]}>{p.name}</Text>
                        <Text style={[s.planMeta, { color: colors.textSecondary }]}>
                          {p.unlimited
                            ? t("plans.unlimited")
                            : t("plans.creditsCount", { count: p.credits || 0 })}
                          {p.priceCents ? ` · ${formatCentavos(p.priceCents)}` : ""}
                        </Text>
                      </View>
                      {active && (
                        <View style={[s.check, { backgroundColor: colors.primary }]}>
                          <Icon name="check" size={12} color={colors.onPrimary} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[s.label, { color: colors.textTertiary, marginTop: 16 }]}>
                {t("plans.assign.methodLabel")}
              </Text>
              <View style={s.methodRow}>
                {PAYMENT_METHODS.map((m) => {
                  const active = method === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setMethod(m)}
                      testID={`assign-method-${m}`}
                      style={[
                        s.methodChip,
                        {
                          backgroundColor: active ? colors.primary : colors.background,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.methodText,
                          {
                            color: active ? colors.onPrimary : colors.text,
                            fontFamily: active ? FONTS.bodyBold : FONTS.bodyMedium,
                          },
                        ]}
                      >
                        {t(paymentMethodLabelKey(m))}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[s.cta, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1, marginTop: 20 }]}
                onPress={submit}
                disabled={saving}
                testID="assign-submit"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={[s.ctaText, { color: colors.onPrimary }]}>{t("plans.assign.confirm")}</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.hardShadow, justifyContent: "flex-end" },
    sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34, maxHeight: "85%" },
    grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.3 },
    proBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    proBadgeText: { fontFamily: FONTS.bodyExtra, fontSize: 9, letterSpacing: 0.5 },
    sub: { fontFamily: FONTS.body, fontSize: 13, marginTop: 4, marginBottom: 18, lineHeight: 18 },
    centre: { paddingVertical: 40, alignItems: "center" },
    gate: { paddingVertical: 12 },
    gateText: { fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 19, marginBottom: 16 },
    label: {
      fontFamily: FONTS.bodyBold,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    planList: { maxHeight: 210 },
    planRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1.5,
      borderRadius: 13,
      padding: 14,
      marginBottom: 8,
    },
    planName: { fontFamily: FONTS.display, fontSize: 15, letterSpacing: -0.2 },
    planMeta: { fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
    check: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    methodRow: { flexDirection: "row", gap: 8 },
    methodChip: { flex: 1, borderWidth: 1, borderRadius: 20, paddingVertical: 10, alignItems: "center" },
    methodText: { fontSize: 13 },
    cta: { height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
    ctaText: { fontFamily: FONTS.bodyExtra, fontSize: 15.5 },
  });
}
