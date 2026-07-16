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
import { useTranslation } from "react-i18next";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import ListRow from "../components/ListRow";
import SectionHeader from "../components/SectionHeader";
import LanguageSelector from "../components/LanguageSelector";
import { nativeName } from "../i18n/languages";
import { TYPE, SPACING, RADII, ELEVATION } from "../constants/theme-tokens";

export default function SettingsScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const [langOpen, setLangOpen] = useState(false);
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
        "https://us-central1-kinlo-app-dev.cloudfunctions.net/deleteUserAccount",
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
      Alert.alert(t("settings.errors.deleteErrorTitle"), t("settings.errors.deleteErrorPrefix") + error.message);
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
            <Text style={[TYPE.titleLg, { color: colors.text }]}>{t("settings.logOut")}</Text>
            <Text style={[TYPE.body, styles.modalBody, { color: colors.textSecondary }]}>
              {t("settings.logoutModal.confirm")}
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.sunken, borderColor: colors.border }]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={[TYPE.label, { color: colors.text }]}>{t("settings.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={performLogout}
              >
                <Text style={[TYPE.label, { color: colors.error }]}>{t("settings.logOut")}</Text>
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
            <Text style={[TYPE.titleLg, { color: colors.text }]}>{t("settings.deleteAccount")}</Text>
            <Text style={[TYPE.body, styles.modalBody, { color: colors.textSecondary }]}>
              {t("settings.deleteModal.warning")}
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.sunken, borderColor: colors.border }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                <Text style={[TYPE.label, { color: colors.text }]}>{t("settings.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={performDeleteAccount}
                disabled={deleting}
              >
                <Text style={[TYPE.label, { color: colors.error }]}>
                  {deleting ? t("settings.deleteModal.deleting") : t("settings.deleteModal.delete")}
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
        <Text style={[TYPE.titleLg, { color: colors.text }]}>{t("settings.title")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionHeader title={t("settings.preferences")} style={{ marginTop: 0 }} />
        <View style={card}>
          <ListRow
            icon="globe"
            title={t("settings.language")}
            onPress={() => setLangOpen(true)}
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
                  {nativeName(i18n.language)}
                </Text>
                <Icon name="forward" size={18} color={colors.textTertiary} />
              </View>
            }
          />
          <ListRow
            icon="ai"
            title={t("settings.kinloAI")}
            subtitle={t("settings.kinloAISub")}
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
            icon="heart"
            title={t("matchmaking.settings.title")}
            subtitle={t("matchmaking.curated.title")}
            onPress={() => navigation.navigate("MatchmakingSettings")}
            right={<Icon name="forward" size={18} color={colors.textTertiary} />}
          />
          <ListRow
            icon={isDark ? "moon" : "sun"}
            title={t("settings.appearance")}
            subtitle={isDark ? t("settings.auroraTheme") : t("settings.cleanTheme")}
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

        <SectionHeader title={t("settings.account")} />
        <View style={card}>
          <ListRow
            icon="pro"
            title={t("settings.subscriptions")}
            subtitle={t("settings.subscriptionsSub")}
            onPress={() => navigation.navigate("BondVibePro")}
          />
          <ListRow
            icon="privacy"
            title={t("settings.safetyCenter")}
            subtitle={t("settings.safetyCenterSub")}
            onPress={() => navigation.navigate("SafetyCenter")}
            divider={false}
          />
        </View>

        <TouchableOpacity style={styles.logoutRow} onPress={() => setShowLogoutModal(true)}>
          <Icon name="logout" size={18} color={colors.error} />
          <Text style={[TYPE.label, { color: colors.error }]}>{t("settings.logOut")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteRow} onPress={() => setShowDeleteModal(true)}>
          <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{t("settings.deleteAccount")}</Text>
        </TouchableOpacity>
      </ScrollView>

      <LanguageSelector visible={langOpen} onClose={() => setLangOpen(false)} />
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
