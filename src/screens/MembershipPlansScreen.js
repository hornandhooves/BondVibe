import React, { useState, useCallback } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
import { Plus, Pencil, Archive, RotateCcw, X } from "lucide-react-native";
import { auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import KeyboardAccessory from "../components/KeyboardAccessory";
import {
  MEMBERSHIP_PLAN_TYPES,
  createMembershipPlan,
  updateMembershipPlan,
  setMembershipPlanActive,
  getHostMembershipPlans,
  formatPlanPrice,
  describePlan,
} from "../services/membershipService";

const emptyForm = {
  name: "",
  description: "",
  terms: "",
  type: MEMBERSHIP_PLAN_TYPES.CREDITS,
  creditsIncluded: "",
  validityDays: "",
  price: "",
  allowAutoRenew: true,
};

export default function MembershipPlansScreen({ navigation }) {
  const { colors, isDark } = useTheme();
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
      type: plan.type,
      creditsIncluded: plan.creditsIncluded ? String(plan.creditsIncluded) : "",
      validityDays: plan.validityDays ? String(plan.validityDays) : "",
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
      type: form.type,
      creditsIncluded:
        form.type === MEMBERSHIP_PLAN_TYPES.CREDITS
          ? parseInt(form.creditsIncluded, 10)
          : null,
      validityDays: parseInt(form.validityDays, 10),
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
      Alert.alert("Couldn't save plan", result.error || "Please try again.");
    }
  };

  const handleArchiveToggle = (plan) => {
    const archiving = plan.active;
    Alert.alert(
      archiving ? "Archive plan?" : "Reactivate plan?",
      archiving
        ? "It will stop being sold. Existing members keep their memberships."
        : "It will be available for purchase again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: archiving ? "Archive" : "Reactivate",
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
  const isCredits = form.type === MEMBERSHIP_PLAN_TYPES.CREDITS;

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
          <Pencil size={16} color={colors.textSecondary} strokeWidth={2} />
          <Text style={[styles.cardActionText, { color: colors.textSecondary }]}>
            Edit
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardAction}
          onPress={() => handleArchiveToggle(plan)}
        >
          {plan.active ? (
            <Archive size={16} color={colors.textSecondary} strokeWidth={2} />
          ) : (
            <RotateCcw size={16} color={colors.primary} strokeWidth={2} />
          )}
          <Text
            style={[
              styles.cardActionText,
              { color: plan.active ? colors.textSecondary : colors.primary },
            ]}
          >
            {plan.active ? "Archive" : "Reactivate"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Membership Plans
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
            Sell class packs or time passes. Members buy a plan and use credits to
            attend your events.
          </Text>

          <TouchableOpacity style={styles.newButton} onPress={openCreate} activeOpacity={0.85}>
            <View
              style={[
                styles.newButtonGlass,
                { backgroundColor: `${colors.primary}33`, borderColor: `${colors.primary}66` },
              ]}
            >
              <Plus size={20} color={colors.primary} strokeWidth={2.4} />
              <Text style={[styles.newButtonText, { color: colors.primary }]}>
                New Plan
              </Text>
            </View>
          </TouchableOpacity>

          {plans.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No plans yet
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Create your first membership plan to start selling class packs.
              </Text>
            </View>
          )}

          {activePlans.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                ACTIVE
              </Text>
              {activePlans.map(renderPlanCard)}
            </>
          )}

          {archivedPlans.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                ARCHIVED
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
                {editingId ? "Edit Plan" : "New Plan"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={colors.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Field label="Plan name" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g. 10 Classes"
                  placeholderTextColor={colors.textTertiary}
                  value={form.name}
                  onChangeText={(t) => setForm({ ...form, name: t })}
                  maxLength={60}
                />
              </Field>

              <Field label="Type" colors={colors}>
                <View style={styles.typeRow}>
                  {[
                    { key: MEMBERSHIP_PLAN_TYPES.CREDITS, label: "Class pack" },
                    { key: MEMBERSHIP_PLAN_TYPES.UNLIMITED, label: "Unlimited" },
                  ].map((opt) => {
                    const selected = form.type === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.typeChip,
                          {
                            backgroundColor: selected ? `${colors.primary}26` : "transparent",
                            borderColor: selected ? colors.primary : colors.border,
                          },
                        ]}
                        onPress={() => setForm({ ...form, type: opt.key })}
                      >
                        <Text
                          style={{
                            color: selected ? colors.primary : colors.textSecondary,
                            fontWeight: "600",
                          }}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Field>

              {isCredits && (
                <Field label="Classes included" colors={colors}>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    placeholder="e.g. 10"
                    placeholderTextColor={colors.textTertiary}
                    value={form.creditsIncluded}
                    onChangeText={(t) =>
                      setForm({ ...form, creditsIncluded: t.replace(/[^0-9]/g, "") })
                    }
                    keyboardType="number-pad"
                    returnKeyType="done"
                  />
                </Field>
              )}

              <Field label="Validity (days)" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g. 60"
                  placeholderTextColor={colors.textTertiary}
                  value={form.validityDays}
                  onChangeText={(t) =>
                    setForm({ ...form, validityDays: t.replace(/[^0-9]/g, "") })
                  }
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </Field>

              <Field label="Price (MXN)" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder="e.g. 1200"
                  placeholderTextColor={colors.textTertiary}
                  value={form.price}
                  onChangeText={(t) =>
                    setForm({ ...form, price: t.replace(/[^0-9.]/g, "") })
                  }
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </Field>

              <Field label="What's included (optional)" colors={colors}>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder="What members get, schedule, level, etc."
                  placeholderTextColor={colors.textTertiary}
                  value={form.description}
                  onChangeText={(t) => setForm({ ...form, description: t })}
                  multiline
                  maxLength={500}
                />
              </Field>

              <Field label="Terms & conditions (optional)" colors={colors}>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder="Cancellation, expiry, transfer rules, etc."
                  placeholderTextColor={colors.textTertiary}
                  value={form.terms}
                  onChangeText={(t) => setForm({ ...form, terms: t })}
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
                    Allow auto-renewal
                  </Text>
                  <Text style={[styles.toggleHint, { color: colors.textTertiary }]}>
                    Members can subscribe to renew automatically.
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
                      {editingId ? "Save Changes" : "Create Plan"}
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
    backButton: { fontSize: 28 },
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
