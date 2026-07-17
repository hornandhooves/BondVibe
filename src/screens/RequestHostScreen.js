import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import Icon from "../components/Icon";
import ChipGroup from "../components/ChipGroup";
import SuccessModal from "../components/SuccessModal";
import {
  COMMUNITY_TYPES,
  MEET_FREQUENCIES,
  GROUP_SIZES,
  TAGLINE_MAX,
  EXPERIENCE_MAX,
  toChips,
} from "../constants/hostOnboarding";

/**
 * Apply to host — "tell us about your community".
 *
 * This used to be three required 500-char essays (whyHost / experience /
 * eventIdeas): the flow's biggest drop-off, asking for a cover letter before
 * the person had seen anything. Step 1 is now taps plus one short line, and the
 * only long-form question left (experience) moved to step 2 and is optional —
 * it colours a review, it never blocks a submission.
 */
export default function RequestHostScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(1);
  const [communityType, setCommunityType] = useState(null);
  const [frequency, setFrequency] = useState(null);
  const [groupSize, setGroupSize] = useState(null);
  const [tagline, setTagline] = useState("");
  const [experience, setExperience] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
    icon: "party",
    tone: "success",
  });

  // Step 1 IS the application; step 2 only adds colour. Keeping the required set
  // this small is the whole point of the redesign.
  const step1Complete = !!communityType && tagline.trim().length > 0;

  const submit = async () => {
    if (!step1Complete) return;
    setSubmitting(true);

    try {
      const existingSnapshot = await getDocs(
        query(
          collection(db, "hostRequests"),
          where("userId", "==", auth.currentUser.uid),
          where("status", "==", "pending")
        )
      );

      if (!existingSnapshot.empty) {
        setSubmitting(false);
        setModalConfig({
          visible: true,
          title: t("requestHost.alreadySubmittedTitle"),
          message: t("requestHost.alreadySubmittedMessage"),
          icon: "clock",
          tone: "brand",
        });
        return;
      }

      const trimmedTagline = tagline.trim();
      const trimmedExperience = experience.trim();

      await addDoc(collection(db, "hostRequests"), {
        userId: auth.currentUser.uid,
        // The structured answers — what a reviewer actually needs.
        communityType,
        frequency: frequency || null, // never undefined — Firestore rejects it
        groupSize: groupSize || null,
        tagline: trimmedTagline,
        experience: trimmedExperience || null,
        // Back-compat: AdminDashboard renders `whyHost`, and every request filed
        // before this redesign carries it. Mirroring the tagline keeps that view
        // working with no migration and no second admin code path.
        whyHost: trimmedTagline,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      setSubmitting(false);
      // Straight on to choosing how they host. There's no approval to wait for
      // any more — free hosting activates on the next screen — so a "submitted,
      // we'll be in touch" modal would be inventing a queue that doesn't exist.
      navigation.replace("HostTypeSelection");
    } catch (error) {
      console.error("❌ Error submitting host request:", error);
      setSubmitting(false);
      Alert.alert(
        t("requestHost.submissionErrorTitle"),
        t("requestHost.submissionErrorMessage"),
        [{ text: t("requestHost.ok") }]
      );
    }
  };

  // The only modal left is "you already have a request in flight" — send them on
  // to pick a host type rather than back to Home, since that's the step they
  // stopped at.
  const handleModalClose = () => {
    setModalConfig((c) => ({ ...c, visible: false }));
    navigation.replace("HostTypeSelection");
  };

  const onBack = () => {
    if (step === 2) return setStep(1);
    navigation.goBack();
  };

  const s = createStyles(colors);

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
        >
          <Icon name="back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={[s.progressTrack, { backgroundColor: colors.sunken }]}>
          <View
            style={[
              s.progressFill,
              { backgroundColor: colors.primary, width: step === 1 ? "50%" : "100%" },
            ]}
          />
        </View>

        <Text style={[s.stepLabel, { color: colors.textSecondary }]}>
          {t("requestHost.stepOf", { current: step, total: 2 })}
        </Text>
      </View>

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 ? (
          <>
            <Text style={[s.title, { color: colors.text }]}>
              {t("requestHost.step1Title")}
            </Text>
            <Text style={[s.subtitle, { color: colors.textSecondary }]}>
              {t("requestHost.step1Subtitle")}
            </Text>

            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
                {t("requestHost.communityTypeLabel")}
                <Text style={{ color: colors.primary }}> *</Text>
              </Text>
              <ChipGroup
                testID="chips-communityType"
                options={toChips(COMMUNITY_TYPES, t)}
                value={communityType}
                onChange={setCommunityType}
                disabled={submitting}
              />
            </View>

            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
                {t("requestHost.frequencyLabel")}
              </Text>
              <ChipGroup
                testID="chips-frequency"
                options={toChips(MEET_FREQUENCIES, t)}
                value={frequency}
                onChange={setFrequency}
                disabled={submitting}
              />
            </View>

            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
                {t("requestHost.groupSizeLabel")}
              </Text>
              <ChipGroup
                testID="chips-groupSize"
                options={toChips(GROUP_SIZES, t)}
                value={groupSize}
                onChange={setGroupSize}
                disabled={submitting}
              />
            </View>

            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
                {t("requestHost.taglineLabel")}
                <Text style={{ color: colors.primary }}> *</Text>
              </Text>
              <View
                style={[
                  s.inputWrap,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <TextInput
                  style={[s.input, { color: colors.text }]}
                  placeholder={t("requestHost.taglinePlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={tagline}
                  onChangeText={setTagline}
                  maxLength={TAGLINE_MAX}
                  editable={!submitting}
                  returnKeyType="done"
                />
              </View>
              <Text style={[s.counter, { color: colors.textTertiary }]}>
                {tagline.length}/{TAGLINE_MAX}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={[s.title, { color: colors.text }]}>
              {t("requestHost.step2Title")}
            </Text>
            <Text style={[s.subtitle, { color: colors.textSecondary }]}>
              {t("requestHost.step2Subtitle")}
            </Text>

            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
                {t("requestHost.experienceLabel")}
                <Text style={{ color: colors.textTertiary }}>
                  {" "}
                  {t("requestHost.optional")}
                </Text>
              </Text>
              <View
                style={[
                  s.inputWrap,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <TextInput
                  style={[s.input, s.textArea, { color: colors.text }]}
                  placeholder={t("requestHost.experiencePlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={experience}
                  onChangeText={setExperience}
                  multiline
                  numberOfLines={5}
                  maxLength={EXPERIENCE_MAX}
                  editable={!submitting}
                />
              </View>
              <Text style={[s.counter, { color: colors.textTertiary }]}>
                {experience.length}/{EXPERIENCE_MAX}
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity
          onPress={step === 1 ? () => setStep(2) : submit}
          disabled={!step1Complete || submitting}
          activeOpacity={0.9}
          style={[
            s.cta,
            {
              backgroundColor: colors.primary,
              opacity: !step1Complete || submitting ? 0.5 : 1,
            },
          ]}
        >
          {submitting ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color={colors.onPrimary} />
              <Text style={[s.ctaText, { color: colors.onPrimary, marginLeft: 10 }]}>
                {t("requestHost.submitting")}
              </Text>
            </View>
          ) : (
            <Text style={[s.ctaText, { color: colors.onPrimary }]}>
              {step === 1
                ? t("requestHost.continue")
                : t("requestHost.submitApplication")}
            </Text>
          )}
        </TouchableOpacity>

        {/* Step 2 is optional, so it needs a way past it that isn't the back button. */}
        {step === 2 && !submitting && (
          <TouchableOpacity onPress={submit} style={s.skip} activeOpacity={0.7}>
            <Text style={[s.skipText, { color: colors.textSecondary }]}>
              {t("requestHost.skipAndSubmit")}
            </Text>
          </TouchableOpacity>
        )}

        {step === 1 && !step1Complete && (
          <Text style={[s.hint, { color: colors.textTertiary }]}>
            {t("requestHost.step1Hint")}
          </Text>
        )}
      </ScrollView>

      <SuccessModal
        visible={modalConfig.visible}
        onClose={handleModalClose}
        title={modalConfig.title}
        message={modalConfig.message}
        icon={modalConfig.icon}
        tone={modalConfig.tone}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 3 },
    stepLabel: { fontFamily: FONTS.bodySemibold, fontSize: 12.5 },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 20 },
    title: {
      fontFamily: FONTS.display,
      fontSize: 26,
      letterSpacing: -0.6,
      marginBottom: 8,
    },
    subtitle: {
      fontFamily: FONTS.body,
      fontSize: 14.5,
      lineHeight: 21,
      marginBottom: 28,
    },
    field: { marginBottom: 24 },
    fieldLabel: {
      fontFamily: FONTS.bodyBold,
      fontSize: 11.5,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      marginBottom: 12,
    },
    inputWrap: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    input: { fontFamily: FONTS.body, fontSize: 15, paddingVertical: 12 },
    textArea: { minHeight: 110, textAlignVertical: "top" },
    counter: {
      fontFamily: FONTS.body,
      fontSize: 11.5,
      textAlign: "right",
      marginTop: 6,
    },
    cta: {
      borderRadius: 27,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 54,
      marginTop: 8,
    },
    ctaText: { fontFamily: FONTS.bodyExtra, fontSize: 16, letterSpacing: 0.2 },
    loadingRow: { flexDirection: "row", alignItems: "center" },
    skip: { alignItems: "center", paddingVertical: 16 },
    skipText: { fontFamily: FONTS.bodySemibold, fontSize: 14 },
    hint: {
      fontFamily: FONTS.body,
      fontSize: 12.5,
      textAlign: "center",
      marginTop: 14,
      lineHeight: 18,
    },
  });
}
