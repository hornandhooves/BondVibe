import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  Switch,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { resolveAvatarForSave } from "../services/storageService";
import { signOut } from "firebase/auth";
import { useTheme } from "../contexts/ThemeContext";
import { useFocusEffect } from "@react-navigation/native";
import AvatarPicker, { AvatarDisplay } from "../components/AvatarPicker";
import GradientBackground from "../components/GradientBackground";
import {
  ChevronLeft,
  
  MapPin,
  Wallet,
  Gift,
  CreditCard,
  Brain,
  RefreshCw,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Crown,
  BadgeCheck,
  Trash2,
  Sparkles,
  Ticket,
  BarChart3,
} from "lucide-react-native";

export default function ProfileScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({
    fullName: "",
    avatar: null,
    location: "",
  });

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  const loadProfile = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setProfile(data);

        let avatarData = data.avatar;
        if (typeof data.avatar === "string" && !data.avatar.startsWith("{")) {
          avatarData = { type: "emoji", value: data.avatar };
        } else if (typeof data.avatar === "string") {
          try {
            avatarData = JSON.parse(data.avatar);
          } catch (e) {
            avatarData = { type: "emoji", value: "😊" };
          }
        }

        setEditForm({
          fullName: data.fullName || "",
          avatar: avatarData || { type: "emoji", value: "😊" },
          location: data.location || "",
        });
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upload the avatar photo to Storage if it's a local picker image.
      const avatar = await resolveAvatarForSave(
        editForm.avatar,
        auth.currentUser.uid
      );
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        fullName: editForm.fullName.trim(),
        avatar,
        location: editForm.location.trim(),
        updatedAt: new Date().toISOString(),
      });
      await loadProfile();
      setEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert("Error", "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const performDeleteAccount = async () => {
    setDeleting(true);
    try {
      // Set flag to prevent "user not found" modal
      await AsyncStorage.setItem("@account_deleting", "true");
      const userId = auth.currentUser.uid;
      
      // Call cloud function to delete all user data
      const response = await fetch(
        "https://us-central1-bondvibe-dev.cloudfunctions.net/deleteUserAccount",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to delete account");
      }
      
      console.log("✅ Account deleted:", result);
      
      // Sign out after deletion
      await signOut(auth);
    } catch (error) {
      console.error("Delete account error:", error);
      alert("Error deleting account: " + error.message);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const performLogout = async () => {
    setShowLogoutModal(false);
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleAvatarChange = (newAvatar) => {
    setEditForm({ ...editForm, avatar: newAvatar });
  };

  const styles = createStyles(colors, isDark);

  if (!profile) {
    return (
      <GradientBackground>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading...
          </Text>
        </View>
      </GradientBackground>
    );
  }

  const canManageStripe = profile.role === "host" || profile.role === "admin";
  // Approved as host but hasn't activated hosting yet (deferred the choice).
  const isApprovedPendingHostType =
    profile.hostApproved &&
    profile.role !== "host" &&
    profile.role !== "admin";
  // Only paid hosts can sell memberships.
  const isPaidHost =
    profile.role === "host" && profile.hostConfig?.type === "paid";

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Logout Modal */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View
              style={[
                styles.modalGlass,
                {
                  backgroundColor: isDark
                    ? "rgba(17, 24, 39, 0.95)"
                    : "rgba(255, 255, 255, 0.95)",
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.modalIconCircle,
                  { backgroundColor: "rgba(239, 68, 68, 0.15)" },
                ]}
              >
                <LogOut size={32} color="#EF4444" strokeWidth={1.8} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Logout
              </Text>
              <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                Are you sure you want to logout?
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowLogoutModal(false)}
                >
                  <View
                    style={[
                      styles.modalButtonGlass,
                      {
                        backgroundColor: isDark
                          ? "rgba(255, 255, 255, 0.04)"
                          : "rgba(255, 255, 255, 0.85)",
                        borderColor: isDark
                          ? "rgba(255, 255, 255, 0.10)"
                          : "rgba(0, 0, 0, 0.08)",
                      },
                    ]}
                  >
                    <Text
                      style={[styles.modalCancelText, { color: colors.text }]}
                    >
                      Cancel
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalLogoutButton}
                  onPress={performLogout}
                >
                  <View style={styles.modalLogoutGlass}>
                    <Text style={styles.modalLogoutText}>Logout</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View
              style={[
                styles.modalGlass,
                {
                  backgroundColor: isDark
                    ? "rgba(17, 24, 39, 0.95)"
                    : "rgba(255, 255, 255, 0.95)",
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.modalIconCircle,
                  { backgroundColor: "rgba(239, 68, 68, 0.15)" },
                ]}
              >
                <Trash2 size={32} color="#EF4444" strokeWidth={1.8} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Delete Account
              </Text>
              <Text style={[styles.modalText, { color: colors.textSecondary }]}>
                This action is permanent and cannot be undone. All your data, events, and messages will be deleted.
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowDeleteModal(false)}
                  disabled={deleting}
                >
                  <View
                    style={[
                      styles.modalButtonGlass,
                      {
                        backgroundColor: isDark
                          ? "rgba(255, 255, 255, 0.04)"
                          : "rgba(255, 255, 255, 0.85)",
                        borderColor: isDark
                          ? "rgba(255, 255, 255, 0.10)"
                          : "rgba(0, 0, 0, 0.08)",
                      },
                    ]}
                  >
                    <Text
                      style={[styles.modalCancelText, { color: colors.text }]}
                    >
                      Cancel
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalLogoutButton}
                  onPress={performDeleteAccount}
                  disabled={deleting}
                >
                  <View style={styles.modalLogoutGlass}>
                    <Text style={styles.modalLogoutText}>
                      {deleting ? "Deleting..." : "Delete"}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Avatar Picker */}
      <AvatarPicker
        visible={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        currentAvatar={editForm.avatar}
        onAvatarChange={handleAvatarChange}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Profile
        </Text>
        {!editing ? (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={[styles.editButton, { color: colors.primary }]}>
              Edit
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {editing ? (
          /* EDIT MODE */
          <>
            <TouchableOpacity
              style={styles.avatarEditContainer}
              onPress={() => setShowAvatarPicker(true)}
            >
              <View
                style={[
                  styles.avatarGlass,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.04)"
                      : "rgba(255, 255, 255, 0.85)",
                    borderColor: `${colors.primary}66`,
                  },
                ]}
              >
                <AvatarDisplay avatar={editForm.avatar} size={80} />
              </View>
              <Text style={[styles.avatarEditText, { color: colors.primary }]}>
                Tap to change
              </Text>
            </TouchableOpacity>

            <View style={styles.formSection}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Full Name
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.04)"
                        : "rgba(255, 255, 255, 0.85)",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.10)"
                        : "rgba(0, 0, 0, 0.08)",
                      color: colors.text,
                    },
                  ]}
                  value={editForm.fullName}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, fullName: text })
                  }
                  placeholder="Your name"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={50}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Location
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.04)"
                        : "rgba(255, 255, 255, 0.85)",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.10)"
                        : "rgba(0, 0, 0, 0.08)",
                      color: colors.text,
                    },
                  ]}
                  value={editForm.location}
                  onChangeText={(text) =>
                    setEditForm({ ...editForm, location: text })
                  }
                  placeholder="City, Country"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={50}
                />
              </View>
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setEditing(false);
                  loadProfile();
                }}
              >
                <View
                  style={[
                    styles.actionButtonGlass,
                    {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.04)"
                        : "rgba(255, 255, 255, 0.85)",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.10)"
                        : "rgba(0, 0, 0, 0.08)",
                    },
                  ]}
                >
                  <Text
                    style={[styles.cancelButtonText, { color: colors.text }]}
                  >
                    Cancel
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={saving}
              >
                <View
                  style={[
                    styles.actionButtonGlass,
                    {
                      backgroundColor: `${colors.primary}33`,
                      borderColor: `${colors.primary}66`,
                    },
                  ]}
                >
                  <Text
                    style={[styles.saveButtonText, { color: colors.primary }]}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* VIEW MODE */
          <>
            <View style={styles.profileHeader}>
              <View
                style={[
                  styles.avatarGlass,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.04)"
                      : "rgba(255, 255, 255, 0.85)",
                    borderColor: `${colors.primary}66`,
                  },
                ]}
              >
                <AvatarDisplay avatar={profile.avatar} size={80} />
              </View>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {profile.fullName}
              </Text>
              <Text
                style={[styles.profileEmail, { color: colors.textSecondary }]}
              >
                {auth.currentUser?.email}
              </Text>

              {profile.role === "admin" && (
                <View style={styles.roleBadge}>
                  <View style={styles.roleBadgeAdmin}>
                    <Crown size={14} color="#FFD700" strokeWidth={2} />
                    <Text style={styles.roleBadgeTextAdmin}>Admin</Text>
                  </View>
                </View>
              )}
              {profile.role === "host" && (
                <View style={styles.roleBadge}>
                  <View style={styles.roleBadgeHost}>
                    <BadgeCheck size={14} color="#34C759" strokeWidth={2} />
                    <Text style={styles.roleBadgeTextHost}>Verified Host</Text>
                  </View>
                </View>
              )}
            </View>

            {profile.bio && (
              <View
                style={[
                  styles.bioCard,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.04)"
                      : "rgba(255, 255, 255, 0.85)",
                    borderColor: isDark
                      ? "rgba(255, 255, 255, 0.10)"
                      : "rgba(0, 0, 0, 0.08)",
                  },
                ]}
              >
                <Text style={[styles.bioText, { color: colors.text }]}>
                  {profile.bio}
                </Text>
              </View>
            )}

              <View style={styles.infoSection}>
              {/* Location Card */}
              <View
                style={[
                  styles.infoCard,
                  {
                    backgroundColor: isDark
                      ? "rgba(255, 255, 255, 0.04)"
                      : "rgba(255, 255, 255, 0.85)",
                    borderColor: isDark
                      ? "rgba(255, 255, 255, 0.10)"
                      : "rgba(0, 0, 0, 0.08)",
                  },
                ]}
              >
                <View
                  style={[
                    styles.infoIconCircle,
                    {
                      backgroundColor: isDark
                        ? `${colors.primary}20`
                        : `${colors.primary}15`,
                    },
                  ]}
                >
                  <MapPin size={22} color={colors.primary} strokeWidth={1.8} />
                </View>
                <View style={styles.infoContent}>
                  <Text
                    style={[styles.infoLabel, { color: colors.textSecondary }]}
                  >
                    Location
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.text }]}>
                    {profile.location || "Not set"}
                  </Text>
                </View>
              </View>

              {/* Host Type Card */}
              {canManageStripe && (
                <TouchableOpacity
                  onPress={() => navigation.navigate("StripeConnect")}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.infoCard,
                      {
                        backgroundColor: isDark
                          ? "rgba(255, 255, 255, 0.04)"
                          : "rgba(255, 255, 255, 0.85)",
                        borderColor: isDark
                          ? "rgba(255, 255, 255, 0.10)"
                          : "rgba(0, 0, 0, 0.08)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.infoIconCircle,
                        {
                          backgroundColor: isDark
                            ? `${colors.primary}20`
                            : `${colors.primary}15`,
                        },
                      ]}
                    >
                      {profile.hostConfig?.type === "paid" ? (
                        <CreditCard
                          size={22}
                          color={colors.primary}
                          strokeWidth={1.8}
                        />
                      ) : profile.hostConfig?.type === "free" ? (
                        <Gift
                          size={22}
                          color={colors.primary}
                          strokeWidth={1.8}
                        />
                      ) : (
                        <Wallet
                          size={22}
                          color={colors.primary}
                          strokeWidth={1.8}
                        />
                      )}
                    </View>
                    <View style={styles.infoContent}>
                      <Text
                        style={[
                          styles.infoLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Host Type
                      </Text>
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        {profile.hostConfig?.type === "paid"
                          ? "Paid Host"
                          : profile.hostConfig?.type === "free"
                          ? "Free Host"
                          : "Not configured"}
                        {profile.stripeConnect?.status === "active" && " ✓"}
                      </Text>
                    </View>
                    <ChevronRight
                      size={20}
                      color={colors.textTertiary}
                      strokeWidth={2}
                    />
                  </View>
                </TouchableOpacity>
              )}

              {/* Choose Host Type — for users approved as host who deferred */}
              {isApprovedPendingHostType && (
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate("HostTypeSelection", {
                      fromProfile: true,
                      userEmail: profile.email || auth.currentUser?.email,
                      fullName: profile.fullName || "Host",
                    })
                  }
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.infoCard,
                      {
                        backgroundColor: isDark
                          ? `${colors.primary}15`
                          : `${colors.primary}10`,
                        borderColor: `${colors.primary}40`,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.infoIconCircle,
                        {
                          backgroundColor: isDark
                            ? `${colors.primary}20`
                            : `${colors.primary}15`,
                        },
                      ]}
                    >
                      <Sparkles
                        size={22}
                        color={colors.primary}
                        strokeWidth={1.8}
                      />
                    </View>
                    <View style={styles.infoContent}>
                      <Text
                        style={[
                          styles.infoLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Hosting
                      </Text>
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        Choose your host type
                      </Text>
                    </View>
                    <ChevronRight
                      size={20}
                      color={colors.primary}
                      strokeWidth={2}
                    />
                  </View>
                </TouchableOpacity>
              )}

              {/* My Memberships — any user (attendee view) */}
              <TouchableOpacity
                onPress={() => navigation.navigate("MyMemberships")}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.infoCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.04)"
                        : "rgba(255, 255, 255, 0.85)",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.10)"
                        : "rgba(0, 0, 0, 0.08)",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.infoIconCircle,
                      {
                        backgroundColor: isDark
                          ? `${colors.primary}20`
                          : `${colors.primary}15`,
                      },
                    ]}
                  >
                    <Ticket size={22} color={colors.primary} strokeWidth={1.8} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text
                      style={[styles.infoLabel, { color: colors.textSecondary }]}
                    >
                      Memberships
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      My memberships
                    </Text>
                  </View>
                  <ChevronRight
                    size={20}
                    color={colors.textTertiary}
                    strokeWidth={2}
                  />
                </View>
              </TouchableOpacity>

              {/* Membership Plans — paid hosts only */}
              {isPaidHost && (
                <TouchableOpacity
                  onPress={() => navigation.navigate("MembershipPlans")}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.infoCard,
                      {
                        backgroundColor: isDark
                          ? "rgba(255, 255, 255, 0.04)"
                          : "rgba(255, 255, 255, 0.85)",
                        borderColor: isDark
                          ? "rgba(255, 255, 255, 0.10)"
                          : "rgba(0, 0, 0, 0.08)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.infoIconCircle,
                        {
                          backgroundColor: isDark
                            ? `${colors.primary}20`
                            : `${colors.primary}15`,
                        },
                      ]}
                    >
                      <Ticket size={22} color={colors.primary} strokeWidth={1.8} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text
                        style={[
                          styles.infoLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Memberships
                      </Text>
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        Manage membership plans
                      </Text>
                    </View>
                    <ChevronRight
                      size={20}
                      color={colors.textTertiary}
                      strokeWidth={2}
                    />
                  </View>
                </TouchableOpacity>
              )}

              {/* Host Analytics — paid hosts only */}
              {isPaidHost && (
                <TouchableOpacity
                  onPress={() => navigation.navigate("HostAnalytics")}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.infoCard,
                      {
                        backgroundColor: isDark
                          ? "rgba(255, 255, 255, 0.04)"
                          : "rgba(255, 255, 255, 0.85)",
                        borderColor: isDark
                          ? "rgba(255, 255, 255, 0.10)"
                          : "rgba(0, 0, 0, 0.08)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.infoIconCircle,
                        {
                          backgroundColor: isDark
                            ? `${colors.primary}20`
                            : `${colors.primary}15`,
                        },
                      ]}
                    >
                      <BarChart3 size={22} color={colors.primary} strokeWidth={1.8} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text
                        style={[styles.infoLabel, { color: colors.textSecondary }]}
                      >
                        Analytics
                      </Text>
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        Revenue & members
                      </Text>
                    </View>
                    <ChevronRight
                      size={20}
                      color={colors.textTertiary}
                      strokeWidth={2}
                    />
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* PERSONALITY QUIZ SECTION */}
            {!profile.personality ||
            Object.keys(profile.personality).length === 0 ? (
              <TouchableOpacity
                style={styles.quizPromptCard}
                onPress={() => navigation.navigate("PersonalityQuiz")}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.quizPromptGlass,
                    {
                      backgroundColor: isDark
                        ? `${colors.primary}15`
                        : `${colors.primary}10`,
                      borderColor: isDark
                        ? `${colors.primary}40`
                        : `${colors.primary}30`,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.quizIconCircle,
                      {
                        backgroundColor: isDark
                          ? `${colors.primary}25`
                          : `${colors.primary}20`,
                      },
                    ]}
                  >
                    <Brain size={28} color={colors.primary} strokeWidth={1.8} />
                  </View>
                  <View style={styles.quizPromptContent}>
                    <Text
                      style={[styles.quizPromptTitle, { color: colors.text }]}
                    >
                      Discover Your Personality
                    </Text>
                    <Text
                      style={[
                        styles.quizPromptText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Take our Big Five quiz to get matched with compatible
                      groups
                    </Text>
                  </View>
                  <ChevronRight
                    size={24}
                    color={colors.primary}
                    strokeWidth={2}
                  />
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.quizRetakeButton}
                onPress={() => navigation.navigate("PersonalityQuiz")}
              >
                <View
                  style={[
                    styles.quizRetakeGlass,
                    {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.04)"
                        : "rgba(255, 255, 255, 0.85)",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.10)"
                        : "rgba(0, 0, 0, 0.08)",
                    },
                  ]}
                >
                  <RefreshCw size={20} color={colors.text} strokeWidth={2} />
                  <Text style={[styles.quizRetakeText, { color: colors.text }]}>
                    Retake Personality Quiz
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* THEME TOGGLE SECTION */}
            <View
              style={[
                styles.themeCard,
                {
                  backgroundColor: isDark
                    ? "rgba(255, 255, 255, 0.04)"
                    : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark
                    ? "rgba(255, 255, 255, 0.10)"
                    : "rgba(0, 0, 0, 0.08)",
                },
              ]}
            >
              <View
                style={[
                  styles.themeIconCircle,
                  {
                    backgroundColor: isDark
                      ? `${colors.primary}20`
                      : `${colors.primary}15`,
                  },
                ]}
              >
                {isDark ? (
                  <Moon size={24} color={colors.primary} strokeWidth={1.8} />
                ) : (
                  <Sun size={24} color={colors.primary} strokeWidth={1.8} />
                )}
              </View>
              <View style={styles.themeInfo}>
                <Text style={[styles.themeTitle, { color: colors.text }]}>
                  {isDark ? "Dark Mode" : "Light Mode"}
                </Text>
                <Text
                  style={[styles.themeSubtitle, { color: colors.textSecondary }]}
                >
                  {isDark ? "Easier on the eyes" : "Bright and clear"}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: "#E5E7EB", true: colors.primary }}
                thumbColor={isDark ? "#FFFFFF" : "#F3F4F6"}
              />
            </View>

            {/* Personality Results */}
            {profile.personality &&
              Object.keys(profile.personality).length > 0 && (
                <View
                  style={[
                    styles.personalityCard,
                    {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.04)"
                        : "rgba(255, 255, 255, 0.85)",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.10)"
                        : "rgba(0, 0, 0, 0.08)",
                    },
                  ]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Personality
                  </Text>
                  {Object.entries(profile.personality).map(([trait, score]) => (
                    <View key={trait} style={styles.traitRow}>
                      <Text style={[styles.traitName, { color: colors.text }]}>
                        {trait.charAt(0).toUpperCase() + trait.slice(1)}
                      </Text>
                      <View style={styles.traitBarContainer}>
                        <View
                          style={[
                            styles.traitBar,
                            { backgroundColor: `${colors.border}` },
                          ]}
                        >
                          <View
                            style={[
                              styles.traitFill,
                              {
                                width: `${score}%`,
                                backgroundColor: colors.primary,
                              },
                            ]}
                          />
                        </View>
                        <Text
                          style={[styles.traitScore, { color: colors.primary }]}
                        >
                          {score}%
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

            {/* Logout Button */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => setShowLogoutModal(true)}
            >
              <View style={styles.logoutGlass}>
                <LogOut size={20} color="#EF4444" strokeWidth={2} />
                <Text style={styles.logoutButtonText}>Logout</Text>
              </View>
            </TouchableOpacity>

            {/* Delete Account - Subtle link at bottom */}
            <TouchableOpacity
              style={styles.deleteAccountLink}
              onPress={() => setShowDeleteModal(true)}
            >
              <Text style={[styles.deleteAccountText, { color: colors.textTertiary }]}>
                Delete Account
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    loadingText: { fontSize: 15 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    editButton: { fontSize: 15, fontWeight: "600" },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },

    // Avatar
    avatarGlass: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 2,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
      overflow: "hidden",
    },
    avatarEditContainer: { alignItems: "center", marginBottom: 28 },
    avatarEditText: { fontSize: 13, fontWeight: "600" },

    // Profile Header
    profileHeader: { alignItems: "center", marginBottom: 24 },
    profileName: {
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 6,
      letterSpacing: -0.5,
    },
    profileEmail: { fontSize: 13, marginBottom: 12 },
    roleBadge: { borderRadius: 10, overflow: "hidden" },
    roleBadgeAdmin: {
      backgroundColor: "rgba(255, 215, 0, 0.15)",
      borderWidth: 1,
      borderColor: "rgba(255, 215, 0, 0.3)",
      paddingVertical: 6,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 10,
    },
    roleBadgeTextAdmin: {
      fontSize: 12,
      fontWeight: "600",
      color: "#FFD700",
      letterSpacing: 0.3,
    },
    roleBadgeHost: {
      backgroundColor: "rgba(52, 199, 89, 0.15)",
      borderWidth: 1,
      borderColor: "rgba(52, 199, 89, 0.3)",
      paddingVertical: 6,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 10,
    },
    roleBadgeTextHost: {
      fontSize: 12,
      fontWeight: "600",
      color: "#34C759",
      letterSpacing: 0.3,
    },

    // Bio
    bioCard: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 18,
      marginBottom: 20,
    },
    bioText: { fontSize: 14, lineHeight: 22, textAlign: "center" },

    // Info Cards
    infoSection: { gap: 12, marginBottom: 20 },
    infoCard: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
    },
    infoIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    infoContent: { flex: 1 },
    infoLabel: { fontSize: 12, marginBottom: 4 },
    infoValue: { fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },

    // Quiz Prompt
    quizPromptCard: { marginBottom: 20 },
    quizPromptGlass: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 20,
      flexDirection: "row",
      alignItems: "center",
    },
    quizIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    quizPromptContent: { flex: 1 },
    quizPromptTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 4,
      letterSpacing: -0.2,
    },
    quizPromptText: { fontSize: 13, lineHeight: 19 },
    quizRetakeButton: { marginBottom: 20 },
    quizRetakeGlass: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    quizRetakeText: { fontSize: 15, fontWeight: "600", letterSpacing: -0.1 },

    // Theme Card
    themeCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 20,
    },
    themeIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    themeInfo: { flex: 1 },
    themeTitle: {
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 4,
      letterSpacing: -0.2,
    },
    themeSubtitle: { fontSize: 13 },

    // Personality Card
    personalityCard: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 18,
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 16,
      letterSpacing: -0.2,
    },
    traitRow: { marginBottom: 14 },
    traitName: {
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 8,
      letterSpacing: -0.1,
    },
    traitBarContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
    traitBar: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
    traitFill: { height: "100%", borderRadius: 4 },
    traitScore: {
      fontSize: 13,
      fontWeight: "600",
      width: 40,
      textAlign: "right",
    },

    // Logout
    logoutButton: { marginBottom: 32 },
    deleteAccountLink: {
      alignItems: "center",
      paddingVertical: 16,
      marginBottom: 20,
    },
    deleteAccountText: {
      fontSize: 14,
      fontWeight: "500",
    },
    logoutGlass: {
      backgroundColor: "rgba(239, 68, 68, 0.15)",
      borderWidth: 1,
      borderColor: "rgba(239, 68, 68, 0.3)",
      borderRadius: 16,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    logoutButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: "#EF4444",
      letterSpacing: -0.1,
    },

    // Edit Mode
    formSection: { gap: 16, marginBottom: 24 },
    inputGroup: { gap: 8 },
    inputLabel: { fontSize: 13, fontWeight: "600", letterSpacing: -0.1 },
    input: {
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      borderRadius: 12,
    },
    textArea: { minHeight: 100, textAlignVertical: "top" },
    charCount: { fontSize: 11, textAlign: "right" },
    inputRow: { flexDirection: "row" },
    formActions: { flexDirection: "row", gap: 12 },
    cancelButton: { flex: 1 },
    saveButton: { flex: 1 },
    actionButtonGlass: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    cancelButtonText: { fontSize: 15, fontWeight: "600" },
    saveButtonText: { fontSize: 15, fontWeight: "600" },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalContent: {
      width: "100%",
      maxWidth: 400,
      borderRadius: 20,
      overflow: "hidden",
    },
    modalGlass: { borderWidth: 1, padding: 28, alignItems: "center" },
    modalIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 8,
      letterSpacing: -0.3,
    },
    modalText: { fontSize: 14, textAlign: "center", marginBottom: 24 },
    modalButtons: { flexDirection: "row", gap: 12, width: "100%" },
    modalCancelButton: { flex: 1 },
    modalLogoutButton: { flex: 1 },
    modalButtonGlass: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    modalCancelText: { fontSize: 15, fontWeight: "600" },
    modalLogoutGlass: {
      backgroundColor: "rgba(239, 68, 68, 0.2)",
      borderWidth: 1,
      borderColor: "rgba(239, 68, 68, 0.4)",
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    modalLogoutText: { fontSize: 15, fontWeight: "600", color: "#EF4444" },
  });
}
