import React, { useState, useMemo } from "react";
import Icon from "../components/Icon";
import { Eye, EyeOff } from "lucide-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import KeyboardAccessory from "../components/KeyboardAccessory";
import SuccessModal from "../components/SuccessModal";
import Button from "../components/Button";
import GoogleIcon from "../components/GoogleIcon";
import AppleIcon from "../components/AppleIcon";
import useSocialAuth from "../hooks/useSocialAuth";
import { FONTS, RADII, ELEVATION, WORDMARK_FONT } from "../constants/theme-tokens";

// BUG 12.1: the static header (logo + wordmark + tagline) is hoisted to its
// own memoized component so typing the email/password doesn't re-render it.
const LoginHeader = React.memo(function LoginHeader({ t, styles }) {
  return (
    <View style={styles.header}>
      <Image
        source={require('../../assets/kinlo-logo-icon.png')}
        style={styles.logoImage}
        resizeMode="contain"
      />
      <Text style={styles.wordmark}>KINLO</Text>
      <Text style={styles.tagline}>{t("welcome.tagline")}.</Text>
    </View>
  );
});

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
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
  const { busy, appleReady, runGoogle, runApple } = useSocialAuth();

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
      <View style={styles.container}>
        <StatusBar style="dark" />

        {/* accessible={false}: keyboard-dismiss wrapper must not collapse its
            children into one a11y element (blocks VoiceOver and E2E drivers). */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LoginHeader t={t} styles={styles} />

            <View style={styles.form}>
              <Text style={styles.fieldLabel}>{t("auth.emailPlaceholder")}</Text>
              <View style={styles.inputWrapper}>
                <Icon
                  name="mail"
                  size={18}
                  color={colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="login-email"
                  style={styles.input}
                  placeholder={t("auth.emailExample")}
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.fieldLabel}>{t("auth.passwordPlaceholder")}</Text>
              <View style={styles.inputWrapper}>
                <Icon
                  name="lock"
                  size={18}
                  color={colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="login-password"
                  style={styles.input}
                  placeholder={t("auth.enterPassword")}
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
                onPress={handleResetPassword}
                style={styles.forgotRow}
              >
                <Text style={styles.forgotLink}>
                  {t("auth.login.forgotPasswordLink")}
                </Text>
              </TouchableOpacity>

              <Button
                label={t("auth.login.logIn")}
                onPress={handleLogin}
                loading={loading}
                fullWidth
                size="lg"
                style={styles.loginButton}
              />

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>
                  {t("socialAuthButtons.orContinueWith")}
                </Text>
                <View style={styles.dividerLine} />
              </View>

              <Button
                label={t("socialAuthButtons.continueWithGoogle")}
                onPress={runGoogle}
                loading={busy === "google"}
                disabled={!!busy}
                color={colors.surface}
                textColor={colors.text}
                fullWidth
                size="lg"
                icon={<GoogleIcon size={18} />}
                style={styles.socialButton}
              />

              {Platform.OS === "ios" && appleReady && (
                <Button
                  label={t("socialAuthButtons.continueWithApple")}
                  onPress={runApple}
                  loading={busy === "apple"}
                  disabled={!!busy}
                  color={colors.surface}
                  textColor={colors.text}
                  fullWidth
                  size="lg"
                  icon={<AppleIcon size={18} color={colors.text} />}
                  style={styles.socialButton}
                />
              )}

              <TouchableOpacity
                onPress={() => navigation.navigate("Signup")}
                style={styles.signupRow}
              >
                <Text style={styles.signupText}>
                  {t("auth.login.noAccount")}
                  <Text style={styles.signupLink}>{t("auth.login.signUp")}</Text>
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
                  <Button
                    label={t("auth.login.createAccount")}
                    onPress={handleSignupClick}
                    fullWidth
                    size="lg"
                  />
                  <Button
                    label={t("auth.login.resetPassword")}
                    onPress={handleResetPassword}
                    variant="secondary"
                    fullWidth
                    size="lg"
                  />
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
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 130,
      paddingBottom: 40,
    },
    header: { alignItems: "center", marginBottom: 40 },
    logoImage: { width: 112, height: 112, marginBottom: 12 },
    wordmark: {
      fontFamily: WORDMARK_FONT,
      fontSize: 34,
      color: colors.text,
      letterSpacing: 6,
      // RN's letterSpacing pads *after* every character, including the last —
      // the layout box is one letterSpacing unit wider than the visible ink,
      // all on the right, which pulls the centered text left of the (unpadded)
      // logo image above it. Shifting the box right by letterSpacing re-centers
      // the ink (a flex-centered child's content shifts right by marginLeft/2).
      marginLeft: 6,
    },
    tagline: {
      fontFamily: FONTS.heroSans,
      fontSize: 11,
      color: colors.primary,
      letterSpacing: 2.5,
      marginLeft: 2.5,
      marginTop: 2,
    },
    form: { width: "100%", maxWidth: 400, alignSelf: "center" },
    fieldLabel: {
      fontFamily: FONTS.bodySemibold,
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    inputWrapper: {
      backgroundColor: colors.sunken,
      borderRadius: RADII.input,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    inputIcon: { marginRight: 10 },
    eyeButton: { padding: 8, marginLeft: 4 },
    input: {
      flex: 1,
      fontFamily: FONTS.body,
      fontSize: 16,
      color: colors.text,
      paddingVertical: 16,
    },
    forgotRow: { alignItems: "flex-end", marginBottom: 24 },
    forgotLink: {
      fontFamily: FONTS.body,
      fontSize: 13,
      color: colors.accent,
    },
    loginButton: { marginBottom: 24 },
    divider: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderStrong },
    dividerText: {
      fontFamily: FONTS.body,
      fontSize: 13,
      color: colors.textTertiary,
      marginHorizontal: 12,
    },
    socialButton: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      marginBottom: 12,
    },
    signupRow: { alignItems: "center", marginTop: 4 },
    signupText: {
      fontFamily: FONTS.body,
      fontSize: 14,
      color: colors.textTertiary,
    },
    signupLink: {
      fontFamily: FONTS.body,
      color: colors.accent,
    },

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
      ...ELEVATION.modal,
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
      fontFamily: FONTS.bodyBold,
      fontSize: 24,
      marginBottom: 12,
      textAlign: "center",
      letterSpacing: -0.4,
    },
    modalMessage: {
      fontFamily: FONTS.body,
      fontSize: 15,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 28,
    },
    modalButtonsColumn: { width: "100%", gap: 12 },
    modalFullButton: { width: "100%" },
    modalLinkText: {
      fontFamily: FONTS.bodyMedium,
      fontSize: 15,
      textAlign: "center",
      paddingVertical: 8,
    },
  });
}
