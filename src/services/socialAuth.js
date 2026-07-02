/**
 * Google + Apple sign-in via Firebase Auth.
 *
 * CONFIG REQUIRED (fill these in — see the setup notes shared with this change):
 *   1. Firebase console → Authentication → enable the Google and Apple providers.
 *   2. app.json → expo.extra:
 *        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID   (OAuth "Web" client ID)
 *        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID   (OAuth "iOS" client ID)
 *      and app.json → expo.plugins → @react-native-google-signin/google-signin
 *      → { iosUrlScheme: "com.googleusercontent.apps.<reversed-iOS-client-id>" }.
 *   3. app.json → expo.ios.usesAppleSignIn: true (already set) + enable
 *      "Sign in with Apple" on the Apple Developer App ID.
 * A new native build is needed (both are native modules).
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

const extra = Constants.expoConfig?.extra || {};
const GOOGLE_WEB_CLIENT_ID = extra.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = extra.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let googleConfigured = false;
const configureGoogle = () => {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
  googleConfigured = true;
};

/**
 * Create the Firestore user doc on first social sign-in (mirrors email signup).
 * Social providers verify the email, so emailVerified is true; the app routes a
 * user with profileCompleted:false to ProfileSetup, and legalAccepted:false to
 * the Legal screen first.
 */
const ensureUserDoc = async (user, fields = {}) => {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email || null,
      fullName: user.displayName || fields.fullName || "",
      createdAt: new Date().toISOString(),
      profileCompleted: false,
      emailVerified: true,
      legalAccepted: false,
      role: "user",
      ...fields,
    });
  }
};

/** Sign in (or up) with Google. Returns the Firebase user. */
export const signInWithGoogle = async () => {
  configureGoogle();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  const idToken = result?.idToken || result?.data?.idToken;
  if (!idToken) throw new Error("No Google ID token returned.");
  const credential = GoogleAuthProvider.credential(idToken);
  const { user } = await signInWithCredential(auth, credential);
  await ensureUserDoc(user);
  return user;
};

/** Whether "Sign in with Apple" is available (iOS 13+ only). */
export const isAppleAvailable = async () =>
  Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync());

/** Sign in (or up) with Apple. Returns the Firebase user. */
export const signInWithApple = async () => {
  // Secure nonce: the hashed nonce goes to Apple, the raw nonce to Firebase.
  const rawNonce =
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );
  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  const { identityToken, fullName } = appleCredential;
  if (!identityToken) throw new Error("No Apple identity token returned.");
  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({ idToken: identityToken, rawNonce });
  const { user } = await signInWithCredential(auth, credential);
  // Apple only returns the name on the FIRST authorization — capture it then.
  const name = fullName?.givenName
    ? `${fullName.givenName} ${fullName.familyName || ""}`.trim()
    : "";
  await ensureUserDoc(user, name ? { fullName: name } : {});
  return user;
};
