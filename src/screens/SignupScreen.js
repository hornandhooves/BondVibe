import React, { useState } from "react";
import Icon from "../components/Icon";
import { Eye, EyeOff } from "lucide-react-native";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAuthContext } from "../contexts/AuthContext";
import SuccessModal from "../components/SuccessModal";
import BondVibeLogo from "../components/BondVibeLogo";

export default function SignupScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { setSignupInProgress } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Validate password strength
  const validatePassword = (pwd) => {
    const errors = [];
    if (pwd.length < 8) errors.push("at least 8 characters");
    if (!/[A-Z]/.test(pwd)) errors.push("one uppercase letter");
    if (!/[a-z]/.test(pwd)) errors.push("one lowercase letter");
    if (!/[0-9]/.test(pwd)) errors.push("one number");
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd))
      errors.push("one special character");
    return errors;
  };

  const handleSignup = async () => {
    console.log("📝 Starting signup process...");

    if (!email || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      Alert.alert(
        "Weak Password",
        "Password must have: " + passwordErrors.join(", "),
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
        const actionCodeSettings = {
          url: "https://bondvibe-dev.web.app",
          handleCodeInApp: false,
        };
        await sendEmailVerification(user, actionCodeSettings);
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
          "Email Already Registered",
          "This email is already registered. Please log in instead.",
        );
      } else if (error.code === "auth/invalid-email") {
        Alert.alert("Invalid Email", "Please enter a valid email address.");
      } else if (error.code === "auth/weak-password") {
        Alert.alert(
          "Weak Password",
          "Password should be at least 6 characters.",
        );
      } else {
        Alert.alert("Signup Failed", error.message);
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
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="back" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.titleSection}>
              {/* New Echo Logo - adapts to theme */}
              <View style={styles.logoContainer}>
                <BondVibeLogo size={72} variant="adaptive" isDark={isDark} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                Create Account
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Join Kinlo and start connecting
              </Text>
            </View>

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
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Email"
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
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Create a password"
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

              {/* Password Requirements */}
              <View style={styles.passwordRequirements}>
                <View style={styles.requirementRow}>
                  <View style={styles.requirementIcon}>
                    <Icon
                      name={password.length >= 8 ? "check" : "circle"}
                      size={14}
                      color={
                        password.length >= 8
                          ? colors.success
                          : colors.textTertiary
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.requirementText,
                      {
                        color:
                          password.length >= 8
                            ? colors.success
                            : colors.textTertiary,
                      },
                    ]}
                  >
                    At least 8 characters
                  </Text>
                </View>
                <View style={styles.requirementRow}>
                  <View style={styles.requirementIcon}>
                    <Icon
                      name={/[A-Z]/.test(password) ? "check" : "circle"}
                      size={14}
                      color={
                        /[A-Z]/.test(password)
                          ? colors.success
                          : colors.textTertiary
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.requirementText,
                      {
                        color: /[A-Z]/.test(password)
                          ? colors.success
                          : colors.textTertiary,
                      },
                    ]}
                  >
                    One uppercase letter
                  </Text>
                </View>
                <View style={styles.requirementRow}>
                  <View style={styles.requirementIcon}>
                    <Icon
                      name={/[a-z]/.test(password) ? "check" : "circle"}
                      size={14}
                      color={
                        /[a-z]/.test(password)
                          ? colors.success
                          : colors.textTertiary
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.requirementText,
                      {
                        color: /[a-z]/.test(password)
                          ? colors.success
                          : colors.textTertiary,
                      },
                    ]}
                  >
                    One lowercase letter
                  </Text>
                </View>
                <View style={styles.requirementRow}>
                  <View style={styles.requirementIcon}>
                    <Icon
                      name={/[0-9]/.test(password) ? "check" : "circle"}
                      size={14}
                      color={
                        /[0-9]/.test(password)
                          ? colors.success
                          : colors.textTertiary
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.requirementText,
                      {
                        color: /[0-9]/.test(password)
                          ? colors.success
                          : colors.textTertiary,
                      },
                    ]}
                  >
                    One number
                  </Text>
                </View>
                <View style={styles.requirementRow}>
                  <View style={styles.requirementIcon}>
                    <Icon
                      name={
                        /[!@#$%^&*(),.?":{}|<>]/.test(password)
                          ? "check"
                          : "circle"
                      }
                      size={14}
                      color={
                        /[!@#$%^&*(),.?":{}|<>]/.test(password)
                          ? colors.success
                          : colors.textTertiary
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.requirementText,
                      {
                        color: /[!@#$%^&*(),.?":{}|<>]/.test(password)
                          ? colors.success
                          : colors.textTertiary,
                      },
                    ]}
                  >
                    One special character (!@#$%...)
                  </Text>
                </View>
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
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Confirm Password"
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

              <TouchableOpacity
                style={styles.signupButton}
                onPress={handleSignup}
                disabled={loading}
              >
                <View
                  style={[
                    styles.signupGlass,
                    {
                      backgroundColor: `${colors.primary}33`,
                      borderColor: `${colors.primary}66`,
                      opacity: loading ? 0.7 : 1,
                    },
                  ]}
                >
                  {loading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text
                        style={[
                          styles.signupText,
                          { color: colors.primary, marginLeft: 12 },
                        ]}
                      >
                        Creating account...
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[styles.signupText, { color: colors.primary }]}
                    >
                      Sign Up
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              <SocialAuthButtons />

              <TouchableOpacity
                style={styles.loginLink}
                onPress={() => navigation.navigate("Login")}
              >
                <Text
                  style={[
                    styles.loginLinkText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Already have an account?{" "}
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>
                    Log In
                  </Text>
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
          title="Verify Your Email"
          message="We've sent a verification link to your email. Please check your inbox (and spam folder) and click the link to verify your account before logging in."
          icon="mail"
          tone="brand"
        />
      </GradientBackground>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20 },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    titleSection: { alignItems: "center", marginBottom: 48 },
    logoContainer: {
      marginBottom: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: "700",
      marginBottom: 8,
      letterSpacing: -0.4,
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
    signupButton: {
      borderRadius: 16,
      overflow: "hidden",
      marginTop: 8,
      marginBottom: 20,
    },
    signupGlass: { borderWidth: 1, paddingVertical: 16, alignItems: "center" },
    loadingRow: { flexDirection: "row", alignItems: "center" },
    signupText: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
    passwordRequirements: {
      marginBottom: 16,
      paddingHorizontal: 4,
    },
    requirementRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    requirementIcon: {
      marginRight: 8,
      width: 16,
    },
    requirementText: {
      fontSize: 12,
    },
    loginLink: { alignItems: "center", paddingVertical: 12 },
    loginLinkText: { fontSize: 15 },
  });
}
