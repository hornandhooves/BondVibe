import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { doc, updateDoc , setDoc} from "firebase/firestore";
import { createNotification } from "../utils/notificationService";
import { auth, db } from "../services/firebase";
import { resolveAvatarForSave } from "../services/storageService";
import { useTheme } from "../contexts/ThemeContext";
import AvatarPicker, { AvatarDisplay } from "../components/AvatarPicker";
import Icon from "../components/Icon";
import SelectDropdown from "../components/SelectDropdown";
import PhoneInput from "../components/PhoneInput";
import useCities from "../hooks/useCities";


export default function ProfileSetupScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { cities: CITY_OPTIONS } = useCities();
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isOver18, setIsOver18] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    avatar: null,
    location: "",
    phone: "",
  });

  const handleAvatarChange = (newAvatar) => {
    setForm({ ...form, avatar: newAvatar });
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      Alert.alert(t("auth.profileSetup.errors.nameRequiredTitle"), t("auth.profileSetup.errors.nameRequiredMsg"));
      return;
    }

    if (!form.location.trim()) {
      Alert.alert(t("auth.profileSetup.errors.locationRequiredTitle"), t("auth.profileSetup.errors.locationRequiredMsg"));
      return;
    }

    if (!isOver18) {
      Alert.alert(t("auth.profileSetup.errors.ageRequiredTitle"), t("auth.profileSetup.errors.ageRequiredMsg"));
      return;
    }

    setSaving(true);
    try {
      console.log("📝 Saving profile setup...");

      // Upload the avatar photo to Storage if it's a local picker image.
      const avatar = await resolveAvatarForSave(
        form.avatar,
        auth.currentUser.uid
      );

      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        fullName: form.fullName.trim(),
        avatar,
        location: form.location.trim(),
        isOver18: true,
        profileCompleted: true,
        profileCompletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      // Phone is private PII — not in the world-readable users doc.
      await setDoc(
        doc(db, "users", auth.currentUser.uid, "private", "contact"),
        { phone: form.phone.replace(/[^0-9+]/g, "") },
        { merge: true }
      );

      // Create welcome notification
      await createNotification(auth.currentUser.uid, {
        type: "welcome",
        title: t("auth.profileSetup.welcomeNotification.title"),
        message: t("auth.profileSetup.welcomeNotification.message"),
        icon: "party",
      });

      console.log("✅ Profile setup completed!");
    } catch (error) {
      console.error("❌ Error saving profile:", error);
      Alert.alert(t("auth.profileSetup.errors.saveErrorTitle"), t("auth.profileSetup.errors.saveErrorMsg"));
    } finally {
      setSaving(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      <AvatarPicker
        visible={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        currentAvatar={form.avatar}
        onAvatarChange={handleAvatarChange}
      />

      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t("auth.profileSetup.headerTitle")}
        </Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {t("auth.profileSetup.headerSubtitle")}
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar Selection */}
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => setShowAvatarPicker(true)}
        >
          <View
            style={[
              styles.avatarGlass,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: `${colors.primary}66`,
              },
            ]}
          >
            <AvatarDisplay avatar={form.avatar} size={80} name={form.fullName} />
          </View>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {t("auth.profileSetup.tapToChangeAvatar")}
          </Text>
        </TouchableOpacity>

        {/* Form Fields */}
        <View style={styles.formSection}>
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              {t("auth.profileSetup.fullNameLabel")} <Text style={{ color: colors.accent }}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={form.fullName}
              onChangeText={(text) => setForm({ ...form, fullName: text })}
              placeholder={t("auth.profileSetup.fullNamePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              maxLength={50}
              autoCapitalize="words"
            />
          </View>

          {/* Location — one of the cities where we operate (single source: LOCATIONS) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              {t("auth.profileSetup.locationLabel")} <Text style={{ color: colors.accent }}>*</Text>
            </Text>
            <SelectDropdown
              value={CITY_OPTIONS.find((c) => c.label === form.location)?.id}
              onValueChange={(id) =>
                setForm({
                  ...form,
                  location: CITY_OPTIONS.find((c) => c.id === id)?.label || "",
                })
              }
              options={CITY_OPTIONS}
              type="location"
              placeholder={t("auth.profileSetup.locationPlaceholder")}
            />
          </View>

          {/* Phone (optional) — country code picker, default +52 */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              {t("auth.profileSetup.phoneLabel")} <Text style={{ color: colors.textTertiary }}>{t("auth.profileSetup.phoneOptional")}</Text>
            </Text>
            <PhoneInput
              value={form.phone}
              onChangeText={(text) => setForm({ ...form, phone: text })}
            />
          </View>

          {/* Age Confirmation Checkbox */}
          <TouchableOpacity
            style={[
              styles.ageCheckbox,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: isOver18 ? colors.primary : colors.border,
                borderWidth: isOver18 ? 2 : 1,
              },
            ]}
            onPress={() => setIsOver18(!isOver18)}
            activeOpacity={0.7}
          >
            <View style={styles.checkboxContainer}>
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: isOver18 ? colors.primary : "transparent",
                    borderColor: isOver18 ? colors.primary : colors.border,
                  },
                ]}
              >
                {isOver18 && (
                  <Icon name="check" size={14} color={colors.onPrimary} />
                )}
              </View>
            </View>
            <View style={styles.checkboxTextContainer}>
              <Text style={[styles.checkboxTitle, { color: colors.text }]}>
                {t("auth.profileSetup.ageCheckboxTitle")}
                <Text style={{ color: colors.accent }}>*</Text>
              </Text>
              <Text
                style={[styles.checkboxSubtitle, { color: colors.textSecondary }]}
              >
                {t("auth.profileSetup.ageCheckboxSubtitle")}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Info Note */}
        <View style={styles.infoNote}>
          <View
            style={[
              styles.infoNoteGlass,
              {
                backgroundColor: `${colors.primary}15`,
                borderColor: `${colors.primary}30`,
              },
            ]}
          >
            <View style={styles.infoNoteIcon}>
              <Icon name="info" size={18} color={colors.primary} />
            </View>
            <Text
              style={[styles.infoNoteText, { color: colors.textSecondary }]}
            >
              {t("auth.profileSetup.infoNote")}
            </Text>
          </View>
        </View>

        {/* Continue Button */}
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleSave}
          disabled={saving}
        >
          <View
            style={[
              styles.continueGlass,
              {
                backgroundColor: colors.primary,
                opacity: saving ? 0.7 : 1,
              },
            ]}
          >
            <Text style={styles.continueButtonText}>
              {saving ? t("auth.profileSetup.saving") : t("auth.profileSetup.continue")}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Required Fields Note */}
        <Text style={[styles.requiredNote, { color: colors.textTertiary }]}>
          <Text style={{ color: colors.accent }}>*</Text> {t("auth.profileSetup.requiredNote")}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      paddingHorizontal: 24,
      paddingTop: 70,
      paddingBottom: 20,
      alignItems: "center",
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700",
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    headerSubtitle: { fontSize: 15, textAlign: "center" },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    avatarContainer: { alignItems: "center", marginBottom: 28 },
    avatarGlass: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 12,
      overflow: "hidden",
    },
    avatarText: { fontSize: 14, fontWeight: "600" },
    formSection: { gap: 20, marginBottom: 24 },
    inputGroup: { gap: 8 },
    inputLabel: { fontSize: 14, fontWeight: "600", letterSpacing: -0.1 },
    input: {
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      borderRadius: 12,
    },
    ageCheckbox: {
      borderRadius: 16,
      padding: 16,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    checkboxContainer: { marginRight: 14, marginTop: 2 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxTextContainer: { flex: 1 },
    checkboxTitle: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
    checkboxSubtitle: { fontSize: 13 },
    infoNote: { marginBottom: 24, borderRadius: 16, overflow: "hidden" },
    infoNoteGlass: {
      borderWidth: 1,
      padding: 16,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    infoNoteIcon: { marginRight: 12, marginTop: 1 },
    infoNoteText: { flex: 1, fontSize: 13, lineHeight: 20 },
    continueButton: { borderRadius: 16, overflow: "hidden", marginBottom: 16 },
    continueGlass: { paddingVertical: 18, alignItems: "center" },
    continueButtonText: {
      fontSize: 17,
      fontWeight: "700",
      color: "#FFFFFF",
      letterSpacing: -0.2,
    },
    requiredNote: { fontSize: 12, textAlign: "center" },
  });
}
