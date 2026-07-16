import Icon from "../components/Icon";
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { doc, updateDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import GradientBackground from "../components/GradientBackground";
import {
  TERMS_OF_SERVICE,
  PRIVACY_POLICY,
  PRIVACY_POLICY_ES,
} from "../utils/legalContent";

// Bump when the legal documents change materially — recorded on acceptance.
const LEGAL_VERSION = "2026-07-07";
import LegalDocumentModal from "../components/LegalDocumentModal";


export default function LegalScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  // Mexican users see the LFPDPPP Spanish Aviso de Privacidad.
  const privacyContent = String(i18n.language || "").startsWith("es")
    ? PRIVACY_POLICY_ES
    : PRIVACY_POLICY;
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const handleGoBack = async () => {
    console.log("← Back button clicked - signing out");
    try {
      await signOut(auth);
      console.log("✅ Signed out - AppNavigator will redirect to Login");
    } catch (error) {
      console.error("❌ Error signing out:", error);
    }
  };

  const handleContinue = async () => {
    console.log("🔘 Continue clicked");
    console.log("📋 Terms accepted:", termsAccepted);
    console.log("🔒 Privacy accepted:", privacyAccepted);

    if (!termsAccepted || !privacyAccepted) {
      console.log("❌ Not all terms accepted");
      Alert.alert(
        t("legal.alerts.acceptTitle"),
        t("legal.alerts.acceptMsg")
      );
      return;
    }

    setLoading(true);
    console.log("⏳ Starting legal acceptance update...");

    try {
      const user = auth.currentUser;
      if (!user) {
        console.log("❌ No user found");
        Alert.alert(t("legal.alerts.errorTitle"), t("legal.alerts.noUserMsg"));
        setLoading(false);
        return;
      }

      console.log("👤 Updating legal acceptance for user:", user.uid);

      await updateDoc(doc(db, "users", user.uid), {
        legalAccepted: true,
        legalAcceptedAt: new Date().toISOString(),
        legalVersion: LEGAL_VERSION,
        legalLanguage: i18n.language || "en",
      });

      console.log("✅ Legal acceptance updated successfully");
      console.log(
        "🔄 AppNavigator will automatically navigate to ProfileSetup"
      );

      setLoading(false);
      // No navigation.replace() - AppNavigator handles it automatically
    } catch (error) {
      console.error("❌ Error updating legal acceptance:", error);
      Alert.alert(t("legal.alerts.errorTitle"), t("legal.alerts.saveFailedMsg"));
      setLoading(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header con botón de regreso */}
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.heroIconTile}>
            <Icon name="clipboard" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("legal.title")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("legal.subtitle")}
          </Text>
        </View>

        <View style={styles.agreements}>
          {/* Terms of Service */}
          <TouchableOpacity
            style={[
              styles.agreementCard,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: termsAccepted ? colors.primary : colors.border,
                borderWidth: termsAccepted ? 2 : 1,
              },
            ]}
            onPress={() => {
              console.log("📝 Terms checkbox clicked");
              setTermsAccepted(!termsAccepted);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.checkbox}>
              <View
                style={[
                  styles.checkboxInner,
                  {
                    backgroundColor: termsAccepted
                      ? colors.primary
                      : "transparent",
                    borderColor: termsAccepted ? colors.primary : colors.border,
                  },
                ]}
              >
                {termsAccepted && (
                  <Icon name="check" size={16} color={colors.onPrimary} />
                )}
              </View>
            </View>
            <View style={styles.agreementText}>
              <Text style={[styles.agreementTitle, { color: colors.text }]}>
                {t("legal.termsTitle")}
              </Text>
              <Text
                style={[
                  styles.agreementSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                {t("legal.termsAgree")}
              </Text>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  console.log("📖 Opening Terms modal");
                  setShowTermsModal(true);
                }}
                style={styles.readLink}
              >
                <Text style={[styles.readLinkText, { color: colors.primary }]}>
                  {t("legal.readTerms")}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          {/* Privacy Policy */}
          <TouchableOpacity
            style={[
              styles.agreementCard,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: privacyAccepted ? colors.primary : colors.border,
                borderWidth: privacyAccepted ? 2 : 1,
              },
            ]}
            onPress={() => {
              console.log("🔒 Privacy checkbox clicked");
              setPrivacyAccepted(!privacyAccepted);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.checkbox}>
              <View
                style={[
                  styles.checkboxInner,
                  {
                    backgroundColor: privacyAccepted
                      ? colors.primary
                      : "transparent",
                    borderColor: privacyAccepted
                      ? colors.primary
                      : colors.border,
                  },
                ]}
              >
                {privacyAccepted && (
                  <Icon name="check" size={16} color={colors.onPrimary} />
                )}
              </View>
            </View>
            <View style={styles.agreementText}>
              <Text style={[styles.agreementTitle, { color: colors.text }]}>
                {t("legal.privacyTitle")}
              </Text>
              <Text
                style={[
                  styles.agreementSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                {t("legal.privacyAgree")}
              </Text>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  console.log("📖 Opening Privacy modal");
                  setShowPrivacyModal(true);
                }}
                style={styles.readLink}
              >
                <Text style={[styles.readLinkText, { color: colors.primary }]}>
                  {t("legal.readPrivacy")}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.continueButton,
            {
              opacity: termsAccepted && privacyAccepted ? 1 : 0.5,
            },
          ]}
          onPress={handleContinue}
          disabled={!termsAccepted || !privacyAccepted || loading}
        >
          <View
            style={[
              styles.continueGlass,
              {
                backgroundColor: `${colors.primary}33`,
                borderColor: `${colors.primary}66`,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.continueText, { color: colors.primary }]}>
                {t("legal.continue")}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Modals for displaying documents */}
      <LegalDocumentModal
        visible={showTermsModal}
        onClose={() => {
          console.log("📖 Closing Terms modal");
          setShowTermsModal(false);
        }}
        title={t("legal.termsTitle")}
        content={TERMS_OF_SERVICE}
      />

      <LegalDocumentModal
        visible={showPrivacyModal}
        onClose={() => {
          console.log("📖 Closing Privacy modal");
          setShowPrivacyModal(false);
        }}
        title={privacyContent === PRIVACY_POLICY_ES ? t("legal.avisoTitle") : t("legal.privacyTitle")}
        content={privacyContent}
      />
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    topHeader: {
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    backButton: {
      width: 44,
      height: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    backButtonText: { fontSize: 28 },
    scrollView: { flex: 1 },
    content: { padding: 24, paddingTop: 20 },
    header: { alignItems: "center", marginBottom: 48 },
    heroIconTile: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 32,
      fontWeight: "700",
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    subtitle: { fontSize: 15, textAlign: "center" },
    agreements: { gap: 16, marginBottom: 32 },
    agreementCard: {
      borderRadius: 20,
      padding: 20,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    checkbox: { marginRight: 16, marginTop: 2 },
    checkboxInner: {
      width: 28,
      height: 28,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    agreementText: { flex: 1 },
    agreementTitle: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
    agreementSubtitle: { fontSize: 14, marginBottom: 8 },
    readLink: { paddingVertical: 4 },
    readLinkText: { fontSize: 14, fontWeight: "600" },
    continueButton: { borderRadius: 16, overflow: "hidden", marginTop: 16 },
    continueGlass: {
      borderWidth: 1,
      paddingVertical: 18,
      alignItems: "center",
    },
    continueText: { fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
  });
}
