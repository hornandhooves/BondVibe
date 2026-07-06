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
import { doc, updateDoc } from "firebase/firestore";
import { createNotification } from "../utils/notificationService";
import { auth, db } from "../services/firebase";
import { resolveAvatarForSave } from "../services/storageService";
import { useTheme } from "../contexts/ThemeContext";
import AvatarPicker, { AvatarDisplay } from "../components/AvatarPicker";
import Icon from "../components/Icon";
import SelectDropdown from "../components/SelectDropdown";
import PhoneInput from "../components/PhoneInput";
import { LOCATIONS } from "../utils/locations";

const CITY_OPTIONS = LOCATIONS.filter((l) => l.id !== "all");

export default function ProfileSetupScreen() {
  const { colors, isDark } = useTheme();
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
      Alert.alert("Required Field", "Please enter your name to continue.");
      return;
    }

    if (!form.location.trim()) {
      Alert.alert("Required Field", "Please enter your location to continue.");
      return;
    }

    if (!isOver18) {
      Alert.alert("Age Requirement", "You must be 18 or older to use Kinlo.");
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
        phone: form.phone.replace(/[^0-9+]/g, ""),
        isOver18: true,
        profileCompleted: true,
        profileCompletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create welcome notification
      await createNotification(auth.currentUser.uid, {
        type: "welcome",
        title: "Welcome to Kinlo!",
        message: "Hey! We're so hyped you're here. This app was built with tons of love for people like you who want real connections, not just likes. Go explore some events, meet awesome humans, and let's make some memories! You got this",
        icon: "party",
      });

      console.log("✅ Profile setup completed!");
    } catch (error) {
      console.error("❌ Error saving profile:", error);
      Alert.alert("Error", "Failed to save profile. Please try again.");
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
          Complete Your Profile
        </Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          Tell us a bit about yourself
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
            Tap to change avatar
          </Text>
        </TouchableOpacity>

        {/* Form Fields */}
        <View style={styles.formSection}>
          {/* Full Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Full Name <Text style={{ color: colors.accent }}>*</Text>
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
              placeholder="Your name"
              placeholderTextColor={colors.textTertiary}
              maxLength={50}
              autoCapitalize="words"
            />
          </View>

          {/* Location — one of the cities where we operate (single source: LOCATIONS) */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Location <Text style={{ color: colors.accent }}>*</Text>
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
              placeholder="Select your city"
            />
          </View>

          {/* Phone (optional) — country code picker, default +52 */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Phone <Text style={{ color: colors.textTertiary }}>(optional)</Text>
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
                I confirm I am 18 years or older{" "}
                <Text style={{ color: colors.accent }}>*</Text>
              </Text>
              <Text
                style={[styles.checkboxSubtitle, { color: colors.textSecondary }]}
              >
                Kinlo is only available for adults
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
              Your profile helps us match you with compatible groups and events.
              You can always edit this later.
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
              {saving ? "Saving..." : "Continue"}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Required Fields Note */}
        <Text style={[styles.requiredNote, { color: colors.textTertiary }]}>
          <Text style={{ color: colors.accent }}>*</Text> Required fields
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
