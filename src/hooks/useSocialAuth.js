import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import {
  signInWithGoogle,
  signInWithApple,
  isAppleAvailable,
} from "../services/socialAuth";

/**
 * Google/Apple sign-in logic shared by SocialAuthButtons and any
 * custom-styled variant (e.g. LoginScreen's own buttons) — one source of
 * truth for busy state, Apple availability, and cancel/error handling.
 */
export default function useSocialAuth() {
  const { t } = useTranslation();
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
      if (cancelled) return;
      // Apple Sign-In is unreliable on the iOS Simulator: it fails with error
      // 1000 ("unknown reason") even when correctly configured. Guide the tester
      // to a real device instead of surfacing Apple's cryptic message.
      const appleUnknown =
        which === "apple" &&
        (e?.code === "ERR_REQUEST_UNKNOWN" || /unknown reason/i.test(msg));
      if (appleUnknown) {
        Alert.alert(
          t("socialAuthButtons.appleUnavailableTitle"),
          t("socialAuthButtons.appleUnavailableMessage")
        );
        return;
      }
      Alert.alert(t("socialAuthButtons.signInFailedTitle"), msg || t("socialAuthButtons.tryAgain"));
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    appleReady,
    runGoogle: () => run("google", signInWithGoogle),
    runApple: () => run("apple", signInWithApple),
  };
}
