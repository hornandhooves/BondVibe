import React, { useState, useCallback } from "react";
import Icon from "../components/Icon";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import KeyboardAccessory from "../components/KeyboardAccessory";
import PricingTierToggle from "../components/business/PricingTierToggle";
import {
  MEMBERSHIP_PLAN_TYPES,
  MEMBERSHIP_AUDIENCE,
  createMembershipPlan,
  updateMembershipPlan,
  setMembershipPlanActive,
  getHostMembershipPlans,
  formatPlanPrice,
  describePlan,
} from "../services/membershipService";

const AUDIENCE_OPTIONS = [
  { value: MEMBERSHIP_AUDIENCE.LOCAL, labelKey: "business.pricingTier.local", icon: "location" },
  { value: MEMBERSHIP_AUDIENCE.GENERAL, labelKey: "business.pricingTier.general", icon: "globe" },
  { value: MEMBERSHIP_AUDIENCE.BOTH, labelKey: "business.pricingTier.both", icon: "community" },
];

const emptyForm = {
  name: "",
  description: "",
  terms: "",
  type: MEMBERSHIP_PLAN_TYPES.CREDITS,
  creditsIncluded: "",
  validityDays: "",
  audienceTier: MEMBERSHIP_AUDIENCE.BOTH,
  price: "",
  allowAutoRenew: true,
};

export default function MembershipPlansScreen({ navigation, route }) {
  // When opened mid event-creation, back returns to the event draft, not Home.
  const fromEventCreation = route?.params?.fromEventCreation;
  const goBack = () =>
    fromEventCreation ? navigation.navigate("CreateEvent") : navigation.goBack();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useFocusEffect(
    useCallback(() => {
      loadPlans();
    }, [])
  );

  const loadPlans = async () => {
    const data = await getHostMembershipPlans(auth.currentUser.uid);
    setPlans(data);
    setLoading(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (plan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name || "",
      description: plan.description || "",
      terms: plan.terms || "",
      type: MEMBERSHIP_PLAN_TYPES.CREDITS,
      // Legacy unlimited plans migrate on edit: host must set a credit count.
      creditsIncluded: plan.creditsIncluded ? String(plan.creditsIncluded) : "",
      validityDays: plan.validityDays ? String(plan.validityDays) : "",
      audienceTier: plan.audienceTier || MEMBERSHIP_AUDIENCE.BOTH,
      price: plan.priceCentavos ? String(plan.priceCentavos / 100) : "",
      allowAutoRenew: plan.allowAutoRenew !== false,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    const payload = {
      name: form.name,
      description: form.description,
      terms: form.terms,
      type: MEMBERSHIP_PLAN_TYPES.CREDITS,
      creditsIncluded: parseInt(form.creditsIncluded, 10),
      validityDays: parseInt(form.validityDays, 10),
      audienceTier: form.audienceTier,
      priceCentavos: Math.round(parseFloat(form.price) * 100),
      allowAutoRenew: form.allowAutoRenew,
    };

    setSaving(true);
    const result = editingId
      ? await updateMembershipPlan(editingId, payload)
      : await createMembershipPlan(payload);
    setSaving(false);

    if (result.success) {
      setModalVisible(false);
      loadPlans();
    } else {
      Alert.alert(t("membershipPlans.couldNotSaveTitle"), result.error || t("membershipPlans.tryAgain"));
    }
  };

  const handleArchiveToggle = (plan) => {
    const archiving = plan.active;
    Alert.alert(
      archiving ? t("membershipPlans.archivePlanTitle") : t("membershipPlans.reactivatePlanTitle"),
      archiving
        ? t("membershipPlans.archivePlanMessage")
        : t("membershipPlans.reactivatePlanMessage"),
      [
        { text: t("membershipPlans.cancel"), style: "cancel" },
        {
          text: archiving ? t("membershipPlans.archive") : t("membershipPlans.reactivate"),
          style: archiving ? "destructive" : "default",
          onPress: async () => {
            await setMembershipPlanActive(plan.id, !plan.active);
            loadPlans();
          },
        },
      ]
    );
  };

  const styles = createStyles(colors, isDark);

  const activePlans = plans.filter((p) => p.active);
  const archivedPlans = plans.filter((p) => !p.active);

  const renderPlanCard = (plan) => (
    <View key={plan.id} style={[styles.card, !plan.active && styles.cardArchived]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.planName, { color: colors.text }]} numberOfLines={1}>
          {plan.name}
        </Text>
        <Text style={[styles.planPrice, { color: colors.primary }]}>
          {formatPlanPrice(plan.priceCentavos)}
        </Text>
      </View>
      <Text style={[styles.planMeta, { color: colors.textSecondary }]}>
        {describePlan(plan)}
      </Text>
      {!!plan.description && (
        <Text style={[styles.planDesc, { color: colors.textTertiary }]} numberOfLines={2}>
          {plan.description}
        </Text>
      )}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardAction} onPress={() => openEdit(plan)}>
          <Icon name="edit" size={16} color={colors.textSecondary} />
          <Text style={[styles.cardActionText, { color: colors.textSecondary }]}>
            {t("membershipPlans.edit")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardAction}
          onPress={() => handleArchiveToggle(plan)}
        >
          {plan.active ? (
            <Icon name="archive" size={16} color={colors.textSecondary} />
          ) : (
            <Icon name="rotate" size={16} color={colors.primary} />
          )}
          <Text
            style={[
              styles.cardActionText,
              { color: plan.active ? colors.textSecondary : colors.primary },
            ]}
          >
            {plan.active ? t("membershipPlans.archive") : t("membershipPlans.reactivate")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t("membershipPlans.title")}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {t("membershipPlans.intro")}
          </Text>

          <TouchableOpacity style={styles.newButton} onPress={openCreate} activeOpacity={0.85}>
            <View
              style={[
                styles.newButtonGlass,
                { backgroundColor: `${colors.primary}33`, borderColor: `${colors.primary}66` },
              ]}
            >
              <Icon name="plus" size={20} color={colors.primary} />
              <Text style={[styles.newButtonText, { color: colors.primary }]}>
                {t("membershipPlans.newPlan")}
              </Text>
            </View>
          </TouchableOpacity>

          {plans.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {t("membershipPlans.noPlansYet")}
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t("membershipPlans.noPlansYetHint")}
              </Text>
            </View>
          )}

          {activePlans.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                {t("membershipPlans.active")}
              </Text>
              {activePlans.map(renderPlanCard)}
            </>
          )}

          {archivedPlans.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                {t("membershipPlans.archived")}
              </Text>
              {archivedPlans.map(renderPlanCard)}
            </>
          )}
        </ScrollView>
      )}

      {/* Create / Edit modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingId ? t("membershipPlans.editPlan") : t("membershipPlans.newPlan")}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Icon name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Field label={t("membershipPlans.planNameLabel")} colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder={t("membershipPlans.planNamePlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={form.name}
                  onChangeText={(txt) => setForm({ ...form, name: txt })}
                  maxLength={60}
                />
              </Field>

              <Field label={t("membershipPlans.audienceLabel")} colors={colors}>
                <PricingTierToggle
                  value={form.audienceTier}
                  onChange={(v) => setForm({ ...form, audienceTier: v })}
                  options={AUDIENCE_OPTIONS}
                  t={t}
                />
              </Field>

              <Field label={t("membershipPlans.classesIncludedLabel")} colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder={t("membershipPlans.classesIncludedPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={form.creditsIncluded}
                  onChangeText={(txt) =>
                    setForm({ ...form, creditsIncluded: txt.replace(/[^0-9]/g, "") })
                  }
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </Field>

              <Field label={t("membershipPlans.validityLabel")} colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder={t("membershipPlans.validityPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={form.validityDays}
                  onChangeText={(txt) =>
                    setForm({ ...form, validityDays: txt.replace(/[^0-9]/g, "") })
                  }
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </Field>

              <Field label={t("membershipPlans.priceLabel")} colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder={t("membershipPlans.pricePlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={form.price}
                  onChangeText={(txt) =>
                    setForm({ ...form, price: txt.replace(/[^0-9.]/g, "") })
                  }
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </Field>

              <Field label={t("membershipPlans.descriptionLabel")} colors={colors}>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder={t("membershipPlans.descriptionPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={form.description}
                  onChangeText={(txt) => setForm({ ...form, description: txt })}
                  multiline
                  maxLength={500}
                />
              </Field>

              <Field label={t("membershipPlans.termsLabel")} colors={colors}>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder={t("membershipPlans.termsPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={form.terms}
                  onChangeText={(txt) => setForm({ ...form, terms: txt })}
                  multiline
                  maxLength={500}
                />
              </Field>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setForm({ ...form, allowAutoRenew: !form.allowAutoRenew })}
                activeOpacity={0.7}
              >
                <View>
                  <Text style={[styles.toggleLabel, { color: colors.text }]}>
                    {t("membershipPlans.allowAutoRenew")}
                  </Text>
                  <Text style={[styles.toggleHint, { color: colors.textTertiary }]}>
                    {t("membershipPlans.allowAutoRenewHint")}
                  </Text>
                </View>
                <View
                  style={[
                    styles.toggle,
                    {
                      backgroundColor: form.allowAutoRenew ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      { alignSelf: form.allowAutoRenew ? "flex-end" : "flex-start" },
                    ]}
                  />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.saveButtonGlass,
                    {
                      backgroundColor: `${colors.primary}33`,
                      borderColor: `${colors.primary}66`,
                      opacity: saving ? 0.6 : 1,
                    },
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.saveButtonText, { color: colors.primary }]}>
                      {editingId ? t("membershipPlans.saveChanges") : t("membershipPlans.createPlan")}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <KeyboardAccessory />
        </KeyboardAvoidingView>
      </Modal>
    </GradientBackground>
  );
}

function Field({ label, colors, children }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8, fontWeight: "600" }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    intro: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
    newButton: { borderRadius: 14, overflow: "hidden", marginBottom: 24 },
    newButtonGlass: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1,
      paddingVertical: 14,
    },
    newButtonText: { fontSize: 16, fontWeight: "700" },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
      marginBottom: 10,
      marginTop: 4,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
      padding: 16,
      marginBottom: 12,
    },
    cardArchived: { opacity: 0.6 },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    planName: { fontSize: 16, fontWeight: "700", flex: 1, marginRight: 12 },
    planPrice: { fontSize: 16, fontWeight: "700" },
    planMeta: { fontSize: 13, marginBottom: 4 },
    planDesc: { fontSize: 13, lineHeight: 18 },
    cardActions: { flexDirection: "row", gap: 20, marginTop: 14 },
    cardAction: { flexDirection: "row", alignItems: "center", gap: 6 },
    cardActionText: { fontSize: 13, fontWeight: "600" },
    emptyState: { alignItems: "center", paddingVertical: 30 },
    emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    modalCard: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 36,
      maxHeight: "90%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    modalTitle: { fontSize: 20, fontWeight: "700" },
    input: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    textArea: { minHeight: 80, textAlignVertical: "top" },
    typeRow: { flexDirection: "row", gap: 10 },
    typeChip: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    toggleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 24,
    },
    toggleLabel: { fontSize: 15, fontWeight: "600" },
    toggleHint: { fontSize: 12, marginTop: 2, maxWidth: 240 },
    toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: "center" },
    toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
    saveButton: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
    saveButtonGlass: {
      borderWidth: 1,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 54,
    },
    saveButtonText: { fontSize: 16, fontWeight: "700" },
  });
}
