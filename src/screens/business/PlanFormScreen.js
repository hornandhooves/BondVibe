/**
 * PlanFormScreen — create / edit one membership.
 *
 * Evolves PackageFormScreen: same fields, plus the block that made the two old
 * concepts one — "How can people pay?". A package was a plan you assigned; a
 * membership plan was a plan you sold. Now that's two switches on one product.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import PricingTierToggle from "../../components/business/PricingTierToggle";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import { usePremium } from "../../hooks/usePremium";
import { usePayoutsReady } from "../../hooks/usePayoutsReady";
import { MEMBERSHIP_AUDIENCE } from "../../utils/membershipUtils";
import {
  PLAN_KIND,
  PLAN_KINDS,
  PAYMENT_MODE,
  LOYALTY_DEFAULTS,
  sanitizePaymentModes,
} from "../../constants/plans";
import { getPlan, createPlan, updatePlan, deletePlan } from "../../services/plansService";

const AUDIENCE_OPTIONS = [
  { value: MEMBERSHIP_AUDIENCE.LOCAL, labelKey: "business.pricingTier.local", icon: "location" },
  { value: MEMBERSHIP_AUDIENCE.GENERAL, labelKey: "business.pricingTier.general", icon: "globe" },
  { value: MEMBERSHIP_AUDIENCE.BOTH, labelKey: "business.pricingTier.both", icon: "community" },
];

export default function PlanFormScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { isPremium } = usePremium();
  const { payoutsReady } = usePayoutsReady();

  const planId = route.params?.planId || null;
  const editing = !!planId;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState(PLAN_KIND.CLASS);
  const [unlimited, setUnlimited] = useState(false);
  const [credits, setCredits] = useState("");
  const [price, setPrice] = useState("");
  const [validityDays, setValidityDays] = useState("");
  const [audienceTier, setAudienceTier] = useState(MEMBERSHIP_AUDIENCE.BOTH);
  const [description, setDescription] = useState("");
  const [sellOnline, setSellOnline] = useState(false);
  const [assignManually, setAssignManually] = useState(true);
  const [loyaltyOn, setLoyaltyOn] = useState(false);
  const [stampsNeeded, setStampsNeeded] = useState(String(LOYALTY_DEFAULTS.stampsNeeded));
  const [rewardLabel, setRewardLabel] = useState("");

  useEffect(() => {
    if (!editing) return;
    (async () => {
      const p = await getPlan(planId);
      if (p) {
        const modes = sanitizePaymentModes(p.paymentModes);
        setName(p.name || "");
        setKind(PLAN_KINDS.includes(p.kind) ? p.kind : PLAN_KIND.CLASS);
        setUnlimited(p.unlimited === true);
        setCredits(p.credits != null ? String(p.credits) : "");
        setPrice(p.priceCents ? String(p.priceCents / 100) : "");
        setValidityDays(p.validityDays != null ? String(p.validityDays) : "");
        setAudienceTier(p.audienceTier || MEMBERSHIP_AUDIENCE.BOTH);
        setDescription(p.description || "");
        setSellOnline(modes.includes(PAYMENT_MODE.ONLINE));
        setAssignManually(modes.includes(PAYMENT_MODE.MANUAL));
        setLoyaltyOn(p.loyaltyReward?.enabled === true);
        if (p.loyaltyReward?.stampsNeeded) setStampsNeeded(String(p.loyaltyReward.stampsNeeded));
        setRewardLabel(p.loyaltyReward?.rewardLabel || "");
      }
      setLoading(false);
    })();
  }, [planId]);

  /**
   * Manual assignment is Kinlo Pro. A non-Pro host editing a plan that already
   * has it on (migrated packages all do) must not have it silently stripped on
   * save — so only block TURNING it on.
   */
  const canToggleManual = isPremium || assignManually;

  const toggleManual = (next) => {
    if (next && !isPremium) return; // the PRO badge explains why
    setAssignManually(next);
  };

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert(t("plans.form.nameRequiredTitle"), t("plans.form.nameRequiredMsg"));
      return;
    }
    if (!unlimited && (!credits || parseInt(credits, 10) <= 0)) {
      Alert.alert(t("plans.form.creditsRequiredTitle"), t("plans.form.creditsRequiredMsg"));
      return;
    }
    if (!validityDays || parseInt(validityDays, 10) <= 0) {
      Alert.alert(t("plans.form.validityRequiredTitle"), t("plans.form.validityRequiredMsg"));
      return;
    }
    // At least one channel, or it's a product nobody can obtain — and the list
    // would show it looking perfectly normal.
    if (!sellOnline && !assignManually) {
      Alert.alert(t("plans.form.channelRequiredTitle"), t("plans.form.channelRequiredMsg"));
      return;
    }

    const modes = [
      ...(sellOnline ? [PAYMENT_MODE.ONLINE] : []),
      ...(assignManually ? [PAYMENT_MODE.MANUAL] : []),
    ];

    setSaving(true);
    try {
      const payload = {
        name,
        kind,
        unlimited,
        credits,
        // The form works in pesos; the model stores centavos.
        priceCents: Math.round((parseFloat(price) || 0) * 100),
        validityDays,
        audienceTier,
        description,
        paymentModes: modes,
        loyaltyReward: loyaltyOn
          ? { enabled: true, stampsNeeded, rewardLabel }
          : null,
      };
      if (editing) await updatePlan(planId, payload);
      else await createPlan(payload);
      navigation.goBack();
    } catch (e) {
      setSaving(false);
      Alert.alert(t("business.common.errorTitle"), t("business.common.tryAgain"));
    }
  };

  const onDelete = () =>
    Alert.alert(t("plans.form.deleteTitle"), t("plans.form.deleteMsg"), [
      { text: t("business.common.cancel"), style: "cancel" },
      {
        text: t("plans.form.delete"),
        style: "destructive",
        onPress: async () => {
          await deletePlan(planId);
          navigation.goBack();
        },
      },
    ]);

  const s = createStyles(colors);

  if (loading) {
    return (
      <GradientBackground>
        <View style={s.centre}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>
            {editing ? t("plans.form.editTitle") : t("plans.form.newTitle")}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={[s.label, { color: colors.textTertiary }]}>
            {t("plans.form.nameLabel")}
            <Text style={{ color: colors.primary }}> *</Text>
          </Text>
          <TextInput
            style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={name}
            onChangeText={setName}
            placeholder={t("plans.form.namePlaceholder")}
            placeholderTextColor={colors.textTertiary}
            testID="plan-name"
          />

          {/* Kind */}
          <Text style={[s.label, { color: colors.textTertiary, marginTop: 20 }]}>
            {t("plans.form.kindLabel")}
          </Text>
          <View style={s.chipRow}>
            {PLAN_KINDS.map((k) => {
              const active = kind === k;
              return (
                <TouchableOpacity
                  key={k}
                  onPress={() => setKind(k)}
                  style={[
                    s.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.chipText,
                      {
                        color: active ? colors.onPrimary : colors.text,
                        fontFamily: active ? FONTS.bodyBold : FONTS.bodyMedium,
                      },
                    ]}
                  >
                    {t(`plans.kind.${k}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Credits · validity · price */}
          <View style={s.triple}>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.textTertiary }]}>{t("plans.form.creditsLabel")}</Text>
              <TextInput
                style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, opacity: unlimited ? 0.4 : 1 }]}
                value={unlimited ? "" : credits}
                onChangeText={setCredits}
                editable={!unlimited}
                placeholder={unlimited ? t("plans.unlimited") : "10"}
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                testID="plan-credits"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.textTertiary }]}>{t("plans.form.validityLabel")}</Text>
              <TextInput
                style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={validityDays}
                onChangeText={setValidityDays}
                placeholder="60"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                testID="plan-validity"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.textTertiary }]}>{t("plans.form.priceLabel")}</Text>
              <TextInput
                style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={price}
                onChangeText={setPrice}
                placeholder="1200"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                testID="plan-price"
              />
            </View>
          </View>

          <TouchableOpacity style={s.inlineToggle} onPress={() => setUnlimited(!unlimited)}>
            <Switch
              value={unlimited}
              onValueChange={setUnlimited}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor={colors.onPrimary}
            />
            <Text style={[s.inlineToggleText, { color: colors.text }]}>{t("plans.form.unlimitedLabel")}</Text>
          </TouchableOpacity>

          {/* ── How can people pay? ── the block that merges the two concepts */}
          <View style={[s.payBlock, { backgroundColor: colors.brandSoft, borderColor: colors.border }]}>
            <Text style={[s.payTitle, { color: colors.text }]}>{t("plans.form.payTitle")}</Text>
            <Text style={[s.paySub, { color: colors.textSecondary }]}>{t("plans.form.paySub")}</Text>

            {/* Sell online */}
            <View style={[s.payRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[s.payIcon, { backgroundColor: colors.successBg }]}>
                <Icon name="payment" size={18} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.payRowTitle, { color: colors.text }]}>{t("plans.form.sellOnline")}</Text>
                <Text style={[s.payRowSub, { color: colors.textSecondary }]}>{t("plans.form.sellOnlineSub")}</Text>
              </View>
              <Switch
                value={sellOnline}
                onValueChange={setSellOnline}
                trackColor={{ true: colors.success, false: colors.border }}
                thumbColor={colors.onPrimary}
                testID="toggle-online"
              />
            </View>

            {/* Assign manually — Kinlo Pro */}
            <View style={[s.payRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[s.payIcon, { backgroundColor: colors.brandSoft }]}>
                <Icon name="edit" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={[s.payRowTitle, { color: colors.text }]}>{t("plans.form.assignManually")}</Text>
                  <View style={[s.proBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[s.proBadgeText, { color: colors.onPrimary }]}>{t("plans.form.pro")}</Text>
                  </View>
                </View>
                <Text style={[s.payRowSub, { color: colors.textSecondary }]}>{t("plans.form.assignManuallySub")}</Text>
              </View>
              <Switch
                value={assignManually}
                onValueChange={toggleManual}
                disabled={!canToggleManual}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.onPrimary}
                testID="toggle-manual"
              />
            </View>

            {/* Online needs payouts. Say it here rather than at checkout. */}
            {sellOnline && !payoutsReady && (
              <TouchableOpacity
                style={[s.notice, { backgroundColor: colors.warnSoft }]}
                onPress={() => navigation.navigate("StripeConnect")}
                testID="stripe-notice"
              >
                <Icon name="info" size={14} color={colors.warning} />
                <Text style={[s.noticeText, { color: colors.warning }]}>
                  {t("plans.form.needsStripe")}{" "}
                  <Text style={{ fontFamily: FONTS.bodyExtra }}>{t("plans.form.setUpStripe")}</Text>
                </Text>
              </TouchableOpacity>
            )}

            {!isPremium && (
              <Text style={[s.proNote, { color: colors.textSecondary }]}>{t("plans.form.manualNeedsPro")}</Text>
            )}
          </View>

          {/* ── Loyalty reward · optional ── */}
          <View style={[s.loyaltyBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.loyaltyHead}>
              <View style={{ flex: 1 }}>
                <Text style={[s.payRowTitle, { color: colors.text }]}>
                  {t("plans.form.loyaltyTitle")}
                  <Text style={{ color: colors.textTertiary, fontFamily: FONTS.body }}>
                    {" · "}{t("plans.form.optional")}
                  </Text>
                </Text>
                <Text style={[s.payRowSub, { color: colors.textSecondary }]}>{t("plans.form.loyaltySub")}</Text>
              </View>
              <Switch
                value={loyaltyOn}
                onValueChange={setLoyaltyOn}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.onPrimary}
                testID="toggle-loyalty"
              />
            </View>

            {loyaltyOn && (
              <View style={s.loyaltyFields}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: colors.textTertiary }]}>{t("plans.form.stampsLabel")}</Text>
                  <TextInput
                    style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={stampsNeeded}
                    onChangeText={setStampsNeeded}
                    keyboardType="number-pad"
                    testID="plan-stamps"
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={[s.label, { color: colors.textTertiary }]}>{t("plans.form.rewardLabel")}</Text>
                  <TextInput
                    style={[s.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={rewardLabel}
                    onChangeText={setRewardLabel}
                    placeholder={t("plans.form.rewardPlaceholder")}
                    placeholderTextColor={colors.textTertiary}
                    testID="plan-reward"
                  />
                </View>
              </View>
            )}
          </View>

          {/* Audience */}
          <Text style={[s.label, { color: colors.textTertiary, marginTop: 20 }]}>
            {t("plans.form.audienceLabel")}
          </Text>
          <PricingTierToggle
            options={AUDIENCE_OPTIONS}
            value={audienceTier}
            onChange={setAudienceTier}
          />

          {/* Description */}
          <Text style={[s.label, { color: colors.textTertiary, marginTop: 20 }]}>
            {t("plans.form.descriptionLabel")}
          </Text>
          <TextInput
            style={[s.input, s.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            value={description}
            onChangeText={setDescription}
            placeholder={t("plans.form.descriptionPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            multiline
          />

          {editing && (
            <TouchableOpacity style={s.deleteRow} onPress={onDelete}>
              <Icon name="delete" size={16} color={colors.error} />
              <Text style={[s.deleteText, { color: colors.error }]}>{t("plans.form.delete")}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={onSave}
            disabled={saving}
            activeOpacity={0.85}
            testID="plan-save"
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={[s.saveText, { color: colors.onPrimary }]}>
                {editing ? t("plans.form.saveChanges") : t("plans.form.create")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    centre: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.3 },
    content: { paddingHorizontal: 20, paddingBottom: 28 },
    label: {
      fontFamily: FONTS.bodyBold,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderRadius: 13,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontFamily: FONTS.body,
      fontSize: 15,
    },
    textArea: { minHeight: 88, textAlignVertical: "top" },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
    chipText: { fontSize: 13.5 },
    triple: { flexDirection: "row", gap: 10, marginTop: 20 },
    inlineToggle: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
    inlineToggleText: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
    payBlock: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 24 },
    payTitle: { fontFamily: FONTS.display, fontSize: 16, letterSpacing: -0.2 },
    paySub: { fontFamily: FONTS.body, fontSize: 12.5, marginTop: 3, marginBottom: 14 },
    payRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 13,
      padding: 12,
      marginBottom: 10,
    },
    payIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    payRowTitle: { fontFamily: FONTS.bodyBold, fontSize: 14.5 },
    payRowSub: { fontFamily: FONTS.body, fontSize: 12, marginTop: 2, lineHeight: 16 },
    proBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    proBadgeText: { fontFamily: FONTS.bodyExtra, fontSize: 9, letterSpacing: 0.5 },
    notice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      borderRadius: 10,
      padding: 11,
    },
    noticeText: { fontFamily: FONTS.bodyMedium, fontSize: 12, flex: 1, lineHeight: 17 },
    proNote: { fontFamily: FONTS.body, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
    loyaltyBlock: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 14 },
    loyaltyHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    loyaltyFields: { flexDirection: "row", gap: 10, marginTop: 14 },
    deleteRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 20 },
    deleteText: { fontFamily: FONTS.bodyBold, fontSize: 14 },
    footer: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 6 },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { fontFamily: FONTS.bodyExtra, fontSize: 16 },
  });
}
