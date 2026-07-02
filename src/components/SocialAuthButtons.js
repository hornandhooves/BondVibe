/**
 * "Continue with Google / Apple" buttons for the login & signup screens.
 * Apple uses the official AppleAuthenticationButton (App Store requirement) and
 * only shows on iOS 13+. On success the app's auth listener routes the user.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTheme } from "../contexts/ThemeContext";
import {
  signInWithGoogle,
  signInWithApple,
  isAppleAvailable,
} from "../services/socialAuth";

export default function SocialAuthButtons() {
  const { colors, isDark } = useTheme();
  const [busy, setBusy] = useState(null); // "google" | "apple" | null
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    isAppleAvailable()
      .then(setAppleReady)
      .catch(() => {});
  }, []);

  const run = async (which, fn) => {
    setBusy(which);
    try {
      await fn();
      // The onAuthStateChanged listener in AppNavigator routes on success.
    } catch (e) {
      const msg = e?.message || "";
      const cancelled =
        /cancel/i.test(msg) ||
        e?.code === "ERR_REQUEST_CANCELED" ||
        e?.code === "12501" || // Google: user cancelled
        e?.code === "-5"; // Google: in progress/cancelled
      if (!cancelled) Alert.alert("Sign-in failed", msg || "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Text style={[styles.or, { color: colors.textTertiary }]}>or</Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

      <TouchableOpacity
        style={[styles.googleBtn, { borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
        onPress={() => run("google", signInWithGoogle)}
        disabled={!!busy}
        activeOpacity={0.85}
      >
        {busy === "google" ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <Text style={styles.googleG}>G</Text>
            <Text style={[styles.googleText, { color: colors.text }]}>
              Continue with Google
            </Text>
          </>
        )}
      </TouchableOpacity>

      {Platform.OS === "ios" && appleReady && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            isDark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={12}
          style={styles.appleBtn}
          onPress={() => run("apple", signInWithApple)}
        />
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { marginTop: 8 },
    dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 16 },
    line: { flex: 1, height: StyleSheet.hairlineWidth },
    or: { fontSize: 13, fontWeight: "600" },
    googleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 14,
      minHeight: 50,
      marginBottom: 12,
    },
    googleG: { fontSize: 18, fontWeight: "900", color: "#4285F4" },
    googleText: { fontSize: 16, fontWeight: "700" },
    appleBtn: { width: "100%", height: 50 },
  });
}
