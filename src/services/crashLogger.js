/**
 * Zero-cost crash/error reporting into Firestore (reuses your existing
 * Firebase — no third party). Captures unhandled JS errors globally and
 * React render errors (via ErrorBoundary). Writes to the `crashes`
 * collection (write-only for users; admins read it in the Firebase console).
 *
 * Note: catches JS crashes (the ones behind most "white screens"), not low-level
 * native crashes. Works in Expo Go, dev client and production builds.
 *
 * KIN-182: appVersion/buildNumber come from expo-application (the native
 * binary), not app.json — see the comment at the writeDoc call below.
 */
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Platform } from "react-native";
import { nativeApplicationVersion, nativeBuildVersion } from "expo-application";
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
      // KIN-182: read from the native binary (expo-application), not
      // Constants.expoConfig?.version — that's app.json's static "version"
      // field, unrelated to which actual build produced this crash.
      // eas.json has appVersionSource:"remote" with autoIncrement, so the
      // real build number only ever exists on EAS/the installed binary.
      appVersion: nativeApplicationVersion || null,
      buildNumber: nativeBuildVersion || null,
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
