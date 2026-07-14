import React, { useState, useMemo } from "react";
import Icon from "../components/Icon";
import { Eye, EyeOff } from "lucide-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import KeyboardAccessory from "../components/KeyboardAccessory";
import SuccessModal from "../components/SuccessModal";
import SocialAuthButtons from "../components/SocialAuthButtons";
import BondVibeLogo from "../components/BondVibeLogo";

// BUG 12.1: the static header (logo + title + subtitle) is hoisted to module
// scope and memoized so typing the email/password no longer re-renders it — the
// BondVibeLogo stops re-rasterizing ("blinking") on every keystroke.
const LoginHeader = React.memo(function LoginHeader({ colors, isDark, t, styles }) {
  return (
    <View style={styles.header}>
      {/* New Echo Logo - adapts to theme */}
      <View style={styles.logoContainer}>
        <BondVibeLogo size={80} variant="adaptive" isDark={isDark} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>Kinlo</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {t("welcome.tagline")}
      </Text>
    </View>
  );
});

export default function LoginScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorModal, setErrorModal] = useState({
    visible: false,
    title: "",
    message: "",
    showSignup: false,
  });

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorModal({
        visible: true,
        title: t("auth.login.errors.missingInfoTitle"),
        message: t("auth.login.errors.missingInfoMsg"),
        showSignup: false,
      });
      return;
    }

    // Dismiss keyboard
    Keyboard.dismiss();

    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      let user = userCredential.user;

      // Reload user to get fresh emailVerified status
      console.log("🔄 Reloading user to get fresh emailVerified status...");
      await user.reload();

      console.log("✅ Login successful:", user.uid);
      console.log(
        "📧 Email verified in Auth (after reload):",
        user.emailVerified,
      );

      // Sync emailVerified from Firebase Auth to Firestore
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();

          if (userData.emailVerified !== user.emailVerified) {
            console.log(
              "🔄 Syncing emailVerified to Firestore:",
              user.emailVerified,
            );
            await updateDoc(userDocRef, {
              emailVerified: user.emailVerified,
            });
            console.log("✅ Firestore emailVerified updated");
          }
        }
      } catch (syncError) {
        console.error(
          "⚠️ Error syncing emailVerified to Firestore:",
          syncError,
        );
      }

      setLoading(false);
    } catch (error) {
      console.log("Login error:", error);
      console.log("Error code:", error.code);

      setLoading(false);

      if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password"
      ) {
        setErrorModal({
          visible: true,
          title: t("auth.login.errors.loginFailedTitle"),
          message: t("auth.login.errors.loginFailedMsg"),
          showSignup: true,
        });
      } else if (error.code === "auth/invalid-email") {
        setErrorModal({
          visible: true,
          title: t("auth.login.errors.invalidEmailTitle"),
          message: t("auth.login.errors.invalidEmailMsg"),
          showSignup: false,
        });
      } else if (error.code === "auth/too-many-requests") {
        setErrorModal({
          visible: true,
          title: t("auth.login.errors.tooManyTitle"),
          message: t("auth.login.errors.tooManyMsg"),
          showSignup: false,
        });
      } else {
        setErrorModal({
          visible: true,
          title: t("auth.login.errors.loginFailedTitle"),
          message: error.message,
          showSignup: false,
        });
      }
      return;
    }
  };

  const handleCancel = () => {
    console.log("❌ Cancel clicked - closing modal");
    setErrorModal({ ...errorModal, visible: false });
  };

  const handleSignupClick = () => {
    console.log("✅ Sign Up clicked - navigating");
    setErrorModal({ ...errorModal, visible: false });
    setTimeout(() => navigation.navigate("Signup"), 100);
  };

  const handleResetPassword = async () => {
    console.log("🔑 Reset Password clicked");
    setErrorModal({ ...errorModal, visible: false });

    if (!email.trim()) {
      setErrorModal({
        visible: true,
        title: t("auth.login.errors.emailRequiredTitle"),
        message: t("auth.login.errors.emailRequiredMsg"),
        showSignup: false,
      });
      return;
    }

    try {
      // Branded reset email via our Cloud Function (links to app.kinlo.org).
      await httpsCallable(getFunctions(), "sendPasswordResetEmail")({ email: email.trim() });
      setErrorModal({
        visible: true,
        title: t("auth.login.errors.resetSentTitle"),
        message: t("auth.login.errors.resetSentMsg"),
        showSignup: false,
      });
    } catch (error) {
      console.error("Reset password error:", error);
      if (error.code === "auth/user-not-found") {
        setErrorModal({
          visible: true,
          title: t("auth.login.errors.emailNotFoundTitle"),
          message: t("auth.login.errors.emailNotFoundMsg"),
          showSignup: false,
        });
      } else {
        setErrorModal({
          visible: true,
          title: t("auth.login.errors.genericErrorTitle"),
          message: t("auth.login.errors.genericErrorMsg"),
          showSignup: false,
        });
      }
    }
  };

  const handleSimpleModalClose = () => {
    console.log("✅ Modal closed");
    setErrorModal({ ...errorModal, visible: false });
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />

        {/* accessible={false}: keyboard-dismiss wrapper must not collapse its
            children into one a11y element (blocks VoiceOver and E2E drivers). */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LoginHeader colors={colors} isDark={isDark} t={t} styles={styles} />

            <View style={styles.form}>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Icon
                  name="mail"
                  size={18}
                  color={colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="login-email"
                  style={[styles.input, { color: colors.text }]}
                  placeholder={t("auth.emailPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Icon
                  name="lock"
                  size={18}
                  color={colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="login-password"
                  style={[styles.input, { color: colors.text }]}
                  placeholder={t("auth.passwordPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={colors.textTertiary} />
                  ) : (
                    <Eye size={20} color={colors.textTertiary} />
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.loginButton}
                onPress={handleLogin}
                disabled={loading}
              >
                <View
                  style={[
                    styles.loginGlass,
                    {
                      backgroundColor: `${colors.primary}33`,
                      borderColor: `${colors.primary}66`,
                    },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.loginText, { color: colors.primary }]}>
                      {t("auth.login.logIn")}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              <SocialAuthButtons />

              <View style={styles.divider}>
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: colors.border },
                  ]}
                />
                <Text
                  style={[styles.dividerText, { color: colors.textTertiary }]}
                >
                  {t("auth.or")}
                </Text>
                <View
                  style={[
                    styles.dividerLine,
                    { backgroundColor: colors.border },
                  ]}
                />
              </View>

              <TouchableOpacity
                style={styles.signupButton}
                onPress={() => navigation.navigate("Signup")}
              >
                <View
                  style={[
                    styles.signupGlass,
                    {
                      backgroundColor: colors.surfaceGlass,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.signupText, { color: colors.text }]}>
                    {t("auth.login.noAccount")}
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>
                      {t("auth.login.signUp")}
                    </Text>
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={handleResetPassword}
              >
                <Text
                  style={[
                    styles.forgotPasswordText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t("auth.login.forgotPassword")}
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>
                    {t("auth.login.reset")}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Extra padding for keyboard */}
            <View style={{ height: 100 }} />
          </ScrollView>
        </TouchableWithoutFeedback>

        {/* Modal con dos botones para "Account Not Found" */}
        {errorModal.showSignup && (
          <Modal
            visible={errorModal.visible}
            transparent={true}
            animationType="fade"
            onRequestClose={handleCancel}
          >
            <View style={styles.modalOverlay}>
              <TouchableOpacity
                style={styles.modalBackdrop}
                activeOpacity={1}
                onPress={handleCancel}
              />
              <View
                style={[
                  styles.modalContent,
                  { backgroundColor: colors.surface },
                ]}
              >
                <View style={styles.modalIconTile}>
                  <Icon name="errorCircle" size={36} color={colors.error} />
                </View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {errorModal.title}
                </Text>
                <Text
                  style={[styles.modalMessage, { color: colors.textSecondary }]}
                >
                  {errorModal.message}
                </Text>
                <View style={styles.modalButtonsColumn}>
                  <TouchableOpacity
                    style={styles.modalFullButton}
                    onPress={handleSignupClick}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.modalButtonGlass,
                        {
                          backgroundColor: `${colors.primary}33`,
                          borderColor: `${colors.primary}66`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalButtonText,
                          { color: colors.primary },
                        ]}
                      >
                        {t("auth.login.createAccount")}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalFullButton}
                    onPress={handleResetPassword}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.modalButtonGlass,
                        {
                          backgroundColor: colors.surfaceGlass,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.modalButtonText, { color: colors.text }]}
                      >
                        {t("auth.login.resetPassword")}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalFullButton}
                    onPress={handleCancel}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.modalLinkText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {t("common.cancel")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <KeyboardAccessory />
          </Modal>
        )}

        {/* Modal simple para otros errores */}
        {!errorModal.showSignup && (
          <SuccessModal
            visible={errorModal.visible}
            onClose={handleSimpleModalClose}
            title={errorModal.title}
            message={errorModal.message}
            icon="errorCircle"
            tone="error"
          />
        )}
      </GradientBackground>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 120,
      paddingBottom: 40,
    },
    header: { alignItems: "center", marginBottom: 48 },
    logoContainer: {
      marginBottom: 16,
    },
    title: {
      fontSize: 32,
      fontWeight: "700",
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    subtitle: { fontSize: 15, textAlign: "center" },
    form: { width: "100%", maxWidth: 400, alignSelf: "center" },
    inputWrapper: {
      borderWidth: 1,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    inputIcon: { marginRight: 12 },
    eyeButton: { padding: 8, marginLeft: 4 },
    input: { flex: 1, fontSize: 16, paddingVertical: 16 },
    loginButton: { borderRadius: 16, overflow: "hidden", marginBottom: 20 },
    loginGlass: { borderWidth: 1, paddingVertical: 16, alignItems: "center" },
    loginText: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
    divider: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
    dividerLine: { flex: 1, height: 1 },
    dividerText: { marginHorizontal: 16, fontSize: 14 },
    signupButton: { borderRadius: 16, overflow: "hidden" },
    signupGlass: { borderWidth: 1, paddingVertical: 16, alignItems: "center" },
    signupText: { fontSize: 15 },

    // Modal
    modalOverlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.6)",
    },
    modalBackdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalContent: {
      width: "90%",
      maxWidth: 400,
      borderRadius: 24,
      padding: 32,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.3,
      shadowRadius: 30,
      elevation: 20,
    },
    modalIconTile: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 12,
      textAlign: "center",
      letterSpacing: -0.4,
    },
    modalMessage: {
      fontSize: 15,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 28,
    },
    modalButtons: { flexDirection: "row", gap: 12, width: "100%" },
    modalButtonsColumn: { width: "100%", gap: 12 },
    modalFullButton: { width: "100%" },
    modalLinkText: {
      fontSize: 15,
      fontWeight: "500",
      textAlign: "center",
      paddingVertical: 8,
    },
    forgotPassword: { alignItems: "center", marginTop: 16, marginBottom: 8 },
    forgotPasswordText: { fontSize: 14, fontWeight: "600" },
    orText: { textAlign: "center", fontSize: 14, marginVertical: 12 },
    modalButton: { flex: 1, borderRadius: 16, overflow: "hidden" },
    modalButtonGlass: {
      borderWidth: 1,
      paddingVertical: 14,
      alignItems: "center",
    },
    modalButtonText: { fontSize: 16, fontWeight: "700" },
  });
}
