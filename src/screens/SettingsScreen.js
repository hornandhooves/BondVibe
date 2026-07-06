/**
 * SettingsScreen — private settings, split out of the old ProfileScreen
 * "junk drawer" (spec §2.3): Kinlo AI opt-in, Appearance, Safety Center,
 * Subscriptions, Log out, Delete account. Account/notification preferences
 * arrive with later phases.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Switch,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useFocusEffect } from "@react-navigation/native";
import { auth, db } from "../services/firebase";
import { clearPushToken } from "../utils/messageService";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import ListRow from "../components/ListRow";
import SectionHeader from "../components/SectionHeader";
import { TYPE, SPACING, RADII, ELEVATION } from "../constants/theme-tokens";

export default function SettingsScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const [aiOptIn, setAiOptIn] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      getDoc(doc(db, "users", uid))
        .then((snap) => snap.exists() && setAiOptIn(snap.data().aiOptIn === true))
        .catch(() => {});
    }, [])
  );

  const toggleAI = async (value) => {
    setAiOptIn(value);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), { aiOptIn: value });
    } catch {
      setAiOptIn(!value);
    }
  };

  const performLogout = async () => {
    setShowLogoutModal(false);
    try {
      await clearPushToken(auth.currentUser?.uid);
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const performDeleteAccount = async () => {
    setDeleting(true);
    try {
      await AsyncStorage.setItem("@account_deleting", "true");
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(
        "https://us-central1-bondvibe-dev.cloudfunctions.net/deleteUserAccount",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          // Server deletes the token's own account; body userId is ignored.
          body: JSON.stringify({}),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to delete account");
      await signOut(auth);
    } catch (error) {
      console.error("Delete account error:", error);
      Alert.alert("Error", "Error deleting account: " + error.message);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const card = [
    styles.card,
    ELEVATION.card,
    { backgroundColor: colors.surface, borderColor: colors.border },
  ];

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* ── Logout Modal ── */}
      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="logout" size={32} color={colors.error} />
            <Text style={[TYPE.titleLg, { color: colors.text }]}>Log out</Text>
            <Text style={[TYPE.body, styles.modalBody, { color: colors.textSecondary }]}>
              Are you sure you want to log out?
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.sunken, borderColor: colors.border }]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={[TYPE.label, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={performLogout}
              >
                <Text style={[TYPE.label, { color: colors.error }]}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="delete" size={32} color={colors.error} />
            <Text style={[TYPE.titleLg, { color: colors.text }]}>Delete account</Text>
            <Text style={[TYPE.body, styles.modalBody, { color: colors.textSecondary }]}>
              This action is permanent and irreversible. All your data, events, and
              messages will be deleted.
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.sunken, borderColor: colors.border }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                <Text style={[TYPE.label, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={performDeleteAccount}
                disabled={deleting}
              >
                <Text style={[TYPE.label, { color: colors.error }]}>
                  {deleting ? "Deleting…" : "Delete"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[TYPE.titleLg, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionHeader title="Preferences" style={{ marginTop: 0 }} />
        <View style={card}>
          <ListRow
            icon="ai"
            title="Kinlo AI"
            subtitle="Personalized picks from your real activity"
            right={
              <Switch
                value={aiOptIn}
                onValueChange={toggleAI}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <ListRow
            icon={isDark ? "moon" : "sun"}
            title="Appearance"
            subtitle={isDark ? "Aurora theme" : "Clean theme"}
            right={
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            }
            divider={false}
          />
        </View>

        <SectionHeader title="Account" />
        <View style={card}>
          <ListRow
            icon="pro"
            title="Subscriptions"
            subtitle="Kinlo Pro · Kinlo Plus"
            onPress={() => navigation.navigate("BondVibePro")}
          />
          <ListRow
            icon="privacy"
            title="Safety center"
            subtitle="SOS, reports, safety tips"
            onPress={() => navigation.navigate("SafetyCenter")}
            divider={false}
          />
        </View>

        <TouchableOpacity style={styles.logoutRow} onPress={() => setShowLogoutModal(true)}>
          <Icon name="logout" size={18} color={colors.error} />
          <Text style={[TYPE.label, { color: colors.error }]}>Log out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteRow} onPress={() => setShowDeleteModal(true)}>
          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Delete account</Text>
        </TouchableOpacity>
      </ScrollView>
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.screen,
    paddingTop: 60,
    paddingBottom: SPACING.md,
  },
  content: { paddingBottom: SPACING.xxxl },
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    marginHorizontal: SPACING.screen,
    overflow: "hidden",
  },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    marginTop: SPACING.xxl,
    paddingVertical: SPACING.md,
  },
  deleteRow: { alignItems: "center", paddingVertical: SPACING.sm },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xxl,
  },
  modalCard: {
    width: "100%",
    borderRadius: RADII.cardLg,
    borderWidth: 1,
    padding: SPACING.xxl,
    alignItems: "center",
    gap: SPACING.md,
  },
  modalBody: { textAlign: "center" },
  modalBtns: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm },
  modalBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderRadius: RADII.tile,
    borderWidth: 1,
  },
  modalBtnDanger: {
    backgroundColor: "rgba(194,91,91,0.12)",
    borderColor: "rgba(194,91,91,0.3)",
  },
});
