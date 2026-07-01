/**
 * Zero-cost crash/error reporting into Firestore (reuses your existing Firebase
 * — no third party, no native module). Captures unhandled JS errors globally
 * and React render errors (via ErrorBoundary). Writes to the `crashes`
 * collection (write-only for users; admins read it in the Firebase console).
 *
 * Note: catches JS crashes (the ones behind most "white screens"), not low-level
 * native crashes. Works in Expo Go, dev client and production builds.
 */
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { db, auth } from "./firebase";

let installed = false;

export async function logCrash(error, context = {}) {
  try {
    await addDoc(collection(db, "crashes"), {
      message: String(error?.message || error || "Unknown error").slice(0, 1000),
      stack: String(error?.stack || "").slice(0, 4000),
      fatal: !!context.fatal,
      source: context.source || "js",
      screen: context.screen || null,
      userId: auth.currentUser?.uid || null,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version || null,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // The logger must never throw.
  }
}

export function installCrashLogger() {
  if (installed) return;
  installed = true;

  const g = global;
  // Unhandled JS exceptions (RN global handler) — the ones that crash the app.
  if (g.ErrorUtils && typeof g.ErrorUtils.getGlobalHandler === "function") {
    const prev = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((error, isFatal) => {
      logCrash(error, { fatal: isFatal, source: "global" });
      if (typeof prev === "function") prev(error, isFatal);
    });
  }
}
