/**
 * App Check — native attestation bridged into the Firebase **web** JS SDK.
 *
 * Why the bridge (docs/APP_CHECK_SETUP.md): the app talks to Firebase through the
 * web SDK (`firebase`), whose only built-in App Check providers are reCAPTCHA —
 * web-only, and unable to attest under React Native. So attestation runs through
 * `@react-native-firebase/app-check` (App Attest on iOS, Play Integrity on
 * Android) and we hand the resulting token to the web SDK via a CustomProvider.
 * That way every existing `httpsCallable` / Firestore call carries the token
 * without rewriting any call site.
 *
 * Deliberately NOT imported from src/services/firebase.js: that module is pulled
 * into jest via a `firebase` mock, and importing the native RNFirebase module
 * there would break the suite. This is called once from App.js instead.
 *
 * Enforcement stays OFF server-side until tokens are confirmed flowing — see
 * step 3/4 of the doc. Registering a provider is safe on its own: an unverified
 * token simply isn't enforced yet.
 */
import { getApp as getWebApp } from "firebase/app";
import { CustomProvider, initializeAppCheck as initWebAppCheck } from "firebase/app-check";

let nativeReady = null; // Promise<AppCheck> — the native instance, started lazily
let registered = false;

/** Start (once) the native attestation provider. */
function ensureNative() {
  if (nativeReady) return nativeReady;
  nativeReady = (async () => {
    // Required lazily so a JS-only context (tests, web) never loads the native
    // module just by importing this file.
    const { getApp } = require("@react-native-firebase/app");
    const appCheckNs = require("@react-native-firebase/app-check").default;
    const { initializeAppCheck } = require("@react-native-firebase/app-check");

    const provider = appCheckNs().newReactNativeFirebaseAppCheckProvider();
    provider.configure({
      // Debug providers in dev: App Attest can't attest on a Simulator and Play
      // Integrity needs a Play-installed build, so a debug token (registered in
      // the Firebase console) is the only way dev builds get a token.
      apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback" },
      android: { provider: __DEV__ ? "debug" : "playIntegrity" },
      isTokenAutoRefreshEnabled: true,
    });
    return initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true });
  })().catch((e) => {
    // Never let attestation break the app: with enforcement off, a missing token
    // is harmless. Reset so a later call can retry.
    console.warn("App Check: native init failed —", e?.message);
    nativeReady = null;
    throw e;
  });
  return nativeReady;
}

/**
 * The web SDK needs { token, expireTimeMillis }; RNFirebase only returns { token }.
 * App Check tokens are JWTs, so read the real `exp`. If it can't be parsed, claim
 * a short window instead of guessing long — the web SDK then re-asks sooner and
 * RNFirebase answers from its native cache, rather than us shipping a token we
 * wrongly believe is still valid.
 * @param {string} token JWT
 * @returns {number} epoch ms
 */
function expiryFromJwt(token) {
  const FALLBACK_MS = 60 * 1000;
  try {
    const payload = token.split(".")[1];
    if (!payload) return Date.now() + FALLBACK_MS;
    const json = JSON.parse(
      // base64url → base64, then decode (atob is global on Hermes/RN 0.74+)
      // eslint-disable-next-line no-undef
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof json.exp === "number" ? json.exp * 1000 : Date.now() + FALLBACK_MS;
  } catch {
    return Date.now() + FALLBACK_MS;
  }
}

/**
 * Register App Check on the web SDK app. Idempotent; call once, early (App.js),
 * before anything issues an httpsCallable.
 * @returns {boolean} whether the provider was registered
 */
export function initAppCheck() {
  if (registered) return true;
  try {
    initWebAppCheck(getWebApp(), {
      provider: new CustomProvider({
        getToken: async () => {
          const instance = await ensureNative();
          const { getToken } = require("@react-native-firebase/app-check");
          const { token } = await getToken(instance, false);
          return { token, expireTimeMillis: expiryFromJwt(token) };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
    registered = true;
    // Warm the native provider so the first real call isn't paying for init.
    ensureNative().catch(() => {});
    return true;
  } catch (e) {
    // A failed registration must not take the app down — enforcement is off.
    console.warn("App Check: web registration failed —", e?.message);
    return false;
  }
}
