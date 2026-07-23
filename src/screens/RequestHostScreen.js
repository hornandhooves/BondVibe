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
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import Icon from "../components/Icon";
import ChipGroup from "../components/ChipGroup";
import SuccessModal from "../components/SuccessModal";
import { uploadHostRequestAttachment } from "../services/storageService";
import {
  COMMUNITY_TYPES,
  MEET_FREQUENCIES,
  GROUP_SIZES,
  TAGLINE_MAX,
  COMMUNITY_TYPE_OTHER_MAX,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  MAX_HOST_ATTACHMENTS,
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
  const [communityTypeOther, setCommunityTypeOther] = useState("");
  const [frequency, setFrequency] = useState(null);
  const [groupSize, setGroupSize] = useState(null);
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState({ instagram: "", web: "" });
  const [attachments, setAttachments] = useState([]); // [{ uri }]
  const [submitting, setSubmitting] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
    icon: "party",
    tone: "success",
  });

  // Step 1 requires a community type + a one-line tagline; the "Other" chip also
  // requires the free-text kind (host-approval-gate Board 3).
  const otherComplete =
    communityType !== "other" || communityTypeOther.trim().length > 0;
  const step1Complete =
    !!communityType && tagline.trim().length > 0 && otherComplete;

  // Board 3d / Decision B: to submit, the reviewer needs something to judge —
  // a real description (min length) AND at least one attachment OR one link.
  const hasLink = links.instagram.trim().length > 0 || links.web.trim().length > 0;
  const descriptionValid = description.trim().length >= DESCRIPTION_MIN;
  const canSubmit =
    step1Complete &&
    descriptionValid &&
    (attachments.length > 0 || hasLink);

  const addAttachment = (att) =>
    setAttachments((cur) => [...cur, att].slice(0, MAX_HOST_ATTACHMENTS));

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        t("requestHost.permissionNeededTitle"),
        t("requestHost.permissionNeededMessage")
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]) {
      addAttachment({ uri: res.assets[0].uri, kind: "image" });
    }
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!res.canceled && res.assets?.[0]) {
      const f = res.assets[0];
      addAttachment({ uri: f.uri, kind: "pdf", name: f.name });
    }
  };

  // One "Attach" button offering either source (Board 3 value content).
  const pickAttachment = () => {
    if (attachments.length >= MAX_HOST_ATTACHMENTS) return;
    Alert.alert(
      t("requestHost.attachChooseTitle"),
      undefined,
      [
        { text: t("requestHost.attachPhoto"), onPress: pickImage },
        { text: t("requestHost.attachPdf"), onPress: pickPdf },
        { text: t("requestHost.cancel"), style: "cancel" },
      ],
      { cancelable: true }
    );
  };

  const removeAttachment = (i) =>
    setAttachments((cur) => cur.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!canSubmit || submitting) return;
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

      // Upload attachments first (images + PDFs → hostRequests/{uid}/…).
      const uid = auth.currentUser.uid;
      const uploaded = [];
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        const isPdf = att.kind === "pdf";
        const url = await uploadHostRequestAttachment(
          uid,
          att.uri,
          i,
          isPdf ? "pdf" : "image"
        );
        uploaded.push({
          url,
          type: isPdf ? "pdf" : "image",
          name: att.name || `attachment_${i + 1}`,
        });
      }

      const trimmedTagline = tagline.trim();
      const trimmedDescription = description.trim();
      const ig = links.instagram.trim();
      const web = links.web.trim();

      await addDoc(collection(db, "hostRequests"), {
        userId: uid,
        // The structured answers — what a reviewer actually needs.
        communityType,
        // Only sent when the "Other" chip is chosen; never undefined.
        communityTypeOther:
          communityType === "other" ? communityTypeOther.trim() : null,
        frequency: frequency || null, // never undefined — Firestore rejects it
        groupSize: groupSize || null,
        tagline: trimmedTagline,
        // host-approval-gate: description is now required value content.
        description: trimmedDescription,
        links: { instagram: ig || null, web: web || null },
        attachments: uploaded, // [] when none — never undefined
        // Back-compat: AdminDashboard also renders `whyHost`, and every request
        // filed before this redesign carries it. Mirror the tagline so the old
        // admin view keeps working with no migration.
        whyHost: trimmedTagline,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      setSubmitting(false);
      // host-approval-gate: hosting is NOT active. Land on the "in review"
      // status screen — the grant now happens only when an admin approves.
      navigation.replace("HostStatus");
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

  // "You already have a request in flight" → send them to their status screen.
  const handleModalClose = () => {
    setModalConfig((c) => ({ ...c, visible: false }));
    navigation.replace("HostStatus");
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
              {/* "Other" reveals a free-text kind (Board 3). */}
              {communityType === "other" && (
                <View
                  style={[
                    s.inputWrap,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      marginTop: 12,
                    },
                  ]}
                >
                  <TextInput
                    testID="requestHost-communityTypeOther"
                    style={[s.input, { color: colors.text }]}
                    placeholder={t("requestHost.communityTypeOtherPlaceholder")}
                    placeholderTextColor={colors.textTertiary}
                    value={communityTypeOther}
                    onChangeText={setCommunityTypeOther}
                    maxLength={COMMUNITY_TYPE_OTHER_MAX}
                    editable={!submitting}
                    returnKeyType="done"
                  />
                </View>
              )}
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

            {/* Description — required value content (Board 3). */}
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
                {t("requestHost.descriptionLabel")}
                <Text style={{ color: colors.primary }}> *</Text>
              </Text>
              <View
                style={[
                  s.inputWrap,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <TextInput
                  testID="requestHost-description"
                  style={[s.input, s.textArea, { color: colors.text }]}
                  placeholder={t("requestHost.descriptionPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={5}
                  maxLength={DESCRIPTION_MAX}
                  editable={!submitting}
                />
              </View>
              <Text
                style={[
                  s.counter,
                  {
                    color: descriptionValid
                      ? colors.textTertiary
                      : colors.warning,
                  },
                ]}
              >
                {descriptionValid
                  ? `${description.trim().length}/${DESCRIPTION_MAX}`
                  : t("requestHost.descriptionMinHint", {
                      min: DESCRIPTION_MIN,
                      current: description.trim().length,
                    })}
              </Text>
            </View>

            {/* Links — optional but recommended. */}
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
                {t("requestHost.linksLabel")}
              </Text>
              <View
                style={[
                  s.inputWrap,
                  { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 10 },
                ]}
              >
                <TextInput
                  testID="requestHost-link-instagram"
                  style={[s.input, { color: colors.text }]}
                  placeholder={t("requestHost.instagramPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={links.instagram}
                  onChangeText={(v) => setLinks((l) => ({ ...l, instagram: v }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!submitting}
                />
              </View>
              <View
                style={[
                  s.inputWrap,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <TextInput
                  testID="requestHost-link-web"
                  style={[s.input, { color: colors.text }]}
                  placeholder={t("requestHost.webPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={links.web}
                  onChangeText={(v) => setLinks((l) => ({ ...l, web: v }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  editable={!submitting}
                />
              </View>
            </View>

            {/* Attachments — images OR PDF (portfolio/value content). ≥1
                attachment OR ≥1 link is required to submit (Decision B). PDFs
                render as an icon + filename card, not a thumbnail. */}
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
                {t("requestHost.attachmentsLabel")}
              </Text>
              <View style={s.attachmentsRow}>
                {attachments.map((a, i) => (
                  <View key={a.uri} style={s.thumbWrap}>
                    {a.kind === "pdf" ? (
                      <View
                        style={[
                          s.pdfThumb,
                          { borderColor: colors.border, backgroundColor: colors.surface },
                        ]}
                      >
                        <Icon name="clipboard" size={24} color={colors.primary} />
                        <Text
                          style={[s.pdfName, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {a.name || "PDF"}
                        </Text>
                      </View>
                    ) : (
                      <Image source={{ uri: a.uri }} style={s.thumb} />
                    )}
                    <TouchableOpacity
                      onPress={() => removeAttachment(i)}
                      style={[s.thumbRemove, { backgroundColor: colors.text }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Icon name="close" size={12} color={colors.background} />
                    </TouchableOpacity>
                  </View>
                ))}
                {attachments.length < MAX_HOST_ATTACHMENTS && (
                  <TouchableOpacity
                    testID="requestHost-add-attachment"
                    onPress={pickAttachment}
                    disabled={submitting}
                    style={[
                      s.addThumb,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Icon name="add" size={22} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[s.counter, { color: colors.textTertiary, textAlign: "left", marginTop: 8 }]}>
                {t("requestHost.attachmentsHint")}
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity
          testID="requestHost-submit"
          onPress={step === 1 ? () => setStep(2) : submit}
          disabled={(step === 1 ? !step1Complete : !canSubmit) || submitting}
          activeOpacity={0.9}
          style={[
            s.cta,
            {
              backgroundColor: colors.primary,
              opacity:
                (step === 1 ? !step1Complete : !canSubmit) || submitting
                  ? 0.5
                  : 1,
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

        {/* host-approval-gate: step 2 is required content now — no skip. Hint
            tells the applicant what's still missing. */}
        {step === 2 && !canSubmit && !submitting && (
          <Text style={[s.hint, { color: colors.textTertiary }]}>
            {t("requestHost.step2Hint")}
          </Text>
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
    attachmentsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    thumbWrap: { width: 72, height: 72 },
    thumb: { width: 72, height: 72, borderRadius: 12 },
    pdfThumb: {
      width: 72,
      height: 72,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
      gap: 4,
    },
    pdfName: { fontFamily: FONTS.body, fontSize: 9, textAlign: "center" },
    thumbRemove: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    addThumb: {
      width: 72,
      height: 72,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
    },
    hint: {
      fontFamily: FONTS.body,
      fontSize: 12.5,
      textAlign: "center",
      marginTop: 14,
      lineHeight: 18,
    },
  });
}
