import React, { useState } from "react";
import Icon from "../components/Icon";
import { Eye, EyeOff } from "lucide-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import {
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import LanguagePill from "../components/LanguagePill";
import Button from "../components/Button";
import GoogleIcon from "../components/GoogleIcon";
import useSocialAuth from "../hooks/useSocialAuth";
import { useAuthContext } from "../contexts/AuthContext";
import SuccessModal from "../components/SuccessModal";
import { FONTS, RADII } from "../constants/theme-tokens";

// Single source of truth for both the live checklist and validatePassword —
// used to be two independently-hand-written copies of the same 5 regexes.
const PASSWORD_REQUIREMENTS = [
  { key: "minLength", test: (pwd) => pwd.length >= 8 },
  { key: "uppercase", test: (pwd) => /[A-Z]/.test(pwd) },
  { key: "lowercase", test: (pwd) => /[a-z]/.test(pwd) },
  { key: "number", test: (pwd) => /[0-9]/.test(pwd) },
  { key: "special", test: (pwd) => /[!@#$%^&*(),.?":{}|<>]/.test(pwd) },
];

export default function SignupScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { setSignupInProgress } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { busy, appleReady, runGoogle, runApple } = useSocialAuth();

  const validatePassword = (pwd) =>
    PASSWORD_REQUIREMENTS.filter((r) => !r.test(pwd)).map((r) =>
      t(`auth.signup.requirements.${r.key}`).toLowerCase()
    );

  const handleSignup = async () => {
    console.log("📝 Starting signup process...");

    if (!email || !password || !confirmPassword) {
      Alert.alert(t("auth.signup.errors.missingInfoTitle"), t("auth.signup.errors.missingInfoMsg"));
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t("auth.signup.errors.passwordMismatchTitle"), t("auth.signup.errors.passwordMismatchMsg"));
      return;
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      Alert.alert(
        t("auth.signup.errors.weakPasswordTitle"),
        t("auth.signup.errors.weakPasswordMsgPrefix") + passwordErrors.join(", "),
      );
      return;
    }

    // Dismiss keyboard
    Keyboard.dismiss();

    setLoading(true);
    setSignupInProgress(true);

    try {
      // 1. Crear cuenta de Firebase Auth
      console.log("📤 Creating user account...");
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;
      console.log("✅ User account created:", user.uid);

      // 2. Crear documento en Firestore
      console.log("📄 Creating Firestore document...");
      await setDoc(doc(db, "users", user.uid), {
        createdAt: new Date().toISOString(),
        profileCompleted: false,
        emailVerified: false,
        legalAccepted: false,
        role: "user",
      });
      console.log("✅ Firestore document created");

      // 3. Enviar email de verificación
      console.log("📧 Sending verification email...");
      try {
        console.log(
          "📧 BEFORE sendEmailVerification - user:",
          user.uid,
          user.email,
        );
        // Branded verification email via our Cloud Function (links to app.kinlo.org).
        await httpsCallable(getFunctions(), "sendVerificationEmail")();
        console.log("✅ Verification email sent");
      } catch (emailError) {
        console.error("❌ sendEmailVerification FAILED:");
        console.error("Error code:", emailError.code);
        console.error("Error message:", emailError.message);
      }

      // 4. SignOut para forzar re-autenticación después de verificar email
      console.log("🚪 Signing out user...");
      await signOut(auth);
      console.log("✅ User signed out");

      // 5. Mostrar success modal
      setLoading(false);
      setSignupInProgress(false);
      setShowSuccess(true);
      console.log("🎉 Signup complete - user must verify email");
    } catch (error) {
      console.error("❌ Signup error:", error.code, error.message);
      setLoading(false);
      setSignupInProgress(false);

      if (error.code === "auth/email-already-in-use") {
        Alert.alert(
          t("auth.signup.errors.emailInUseTitle"),
          t("auth.signup.errors.emailInUseMsg"),
        );
      } else if (error.code === "auth/invalid-email") {
        Alert.alert(t("auth.signup.errors.invalidEmailTitle"), t("auth.signup.errors.invalidEmailMsg"));
      } else if (error.code === "auth/weak-password") {
        Alert.alert(
          t("auth.signup.errors.weakPasswordTitle"),
          t("auth.signup.errors.weakPasswordShort"),
        );
      } else {
        Alert.alert(t("auth.signup.errors.genericErrorTitle"), error.message);
      }
    }
  };

  const handleModalClose = () => {
    console.log("👋 Closing modal and navigating to Login");
    setShowSuccess(false);
    setTimeout(() => {
      navigation.replace("Login");
    }, 300);
  };

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <View style={styles.container}>
        <StatusBar style="dark" />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="back" size={24} color={colors.text} />
          </TouchableOpacity>
          <LanguagePill />
        </View>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.titleSection}>
              <Image
                source={require('../../assets/kinlo-logo-icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.title}>{t("auth.signup.title")}</Text>
              <Text style={styles.subtitle}>{t("auth.signup.subtitle")}</Text>
            </View>

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

              <Text style={styles.fieldLabel}>{t("auth.signup.createPasswordPlaceholder")}</Text>
              <View style={styles.inputWrapper}>
                <Icon
                  name="lock"
                  size={18}
                  color={colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t("auth.signup.createPasswordPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
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

              {/* Password requirements — live checklist */}
              <View style={styles.requirements}>
                {PASSWORD_REQUIREMENTS.map((req) => {
                  const met = req.test(password);
                  return (
                    <View key={req.key} style={styles.requirementRow}>
                      <View
                        style={[
                          styles.requirementDot,
                          met
                            ? { backgroundColor: colors.success }
                            : { borderWidth: 1.5, borderColor: colors.borderStrong },
                        ]}
                      >
                        {met && <Icon name="check" size={10} color="#FFFFFF" />}
                      </View>
                      <Text
                        style={[
                          styles.requirementText,
                          { color: met ? colors.success : colors.textTertiary },
                        ]}
                      >
                        {t(`auth.signup.requirements.${req.key}`)}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>{t("auth.signup.confirmPasswordPlaceholder")}</Text>
              <View style={styles.inputWrapper}>
                <Icon
                  name="lock"
                  size={18}
                  color={colors.textTertiary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t("auth.signup.confirmPasswordPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={colors.textTertiary} />
                  ) : (
                    <Eye size={20} color={colors.textTertiary} />
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.termsText}>
                {t("auth.signup.termsPrefix")}
                <Text style={styles.termsLink}>{t("auth.signup.termsOfService")}</Text>
                {t("auth.signup.termsAnd")}
                <Text style={styles.termsLink}>{t("auth.signup.privacyPolicy")}</Text>.
              </Text>

              <Button
                label={loading ? t("auth.signup.creatingAccount") : t("auth.signup.signUp")}
                onPress={handleSignup}
                loading={loading}
                fullWidth
                size="lg"
                style={styles.signupButton}
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
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
                  cornerRadius={12}
                  style={styles.appleButton}
                  onPress={runApple}
                />
              )}

              <TouchableOpacity
                style={styles.loginRow}
                onPress={() => navigation.navigate("Login")}
              >
                <Text style={styles.loginText}>
                  {t("auth.signup.haveAccount")}
                  <Text style={styles.loginLink}>{t("auth.signup.logIn")}</Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Extra padding for keyboard */}
            <View style={{ height: 50 }} />
          </ScrollView>
        </TouchableWithoutFeedback>

        <SuccessModal
          visible={showSuccess}
          onClose={handleModalClose}
          title={t("auth.signup.verifyModal.title")}
          message={t("auth.signup.verifyModal.message")}
          icon="mail"
          tone="brand"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 12,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    titleSection: { alignItems: "center", marginBottom: 32 },
    logoImage: { width: 64, height: 64, marginBottom: 12 },
    title: {
      fontFamily: FONTS.display,
      fontSize: 26,
      color: colors.text,
      marginBottom: 6,
    },
    subtitle: {
      fontFamily: FONTS.body,
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: "center",
    },
    form: { width: "100%", maxWidth: 400, alignSelf: "center" },
    fieldLabel: {
      fontFamily: FONTS.bodySemibold,
      fontSize: 14,
      color: colors.text,
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
    requirements: {
      marginBottom: 16,
      marginTop: -4,
      gap: 8,
    },
    requirementRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    requirementDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    requirementText: {
      fontFamily: FONTS.body,
      fontSize: 13,
    },
    termsText: {
      fontFamily: FONTS.body,
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 20,
    },
    termsLink: {
      fontFamily: FONTS.bodySemibold,
      color: colors.accent,
    },
    signupButton: { marginBottom: 24 },
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
    appleButton: { width: "100%", height: 48, marginBottom: 20 },
    loginRow: { alignItems: "center", marginTop: 4 },
    loginText: {
      fontFamily: FONTS.body,
      fontSize: 14,
      color: colors.textTertiary,
    },
    loginLink: {
      fontFamily: FONTS.bodyBold,
      color: colors.accent,
    },
  });
}
