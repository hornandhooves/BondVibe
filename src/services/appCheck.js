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
import * as Updates from "expo-updates";
import { getApp as getWebApp } from "firebase/app";
import { CustomProvider, initializeAppCheck as initWebAppCheck } from "firebase/app-check";

/**
 * Channels whose Android builds are actually installed FROM Google Play.
 *
 * This is the whole reason we don't key off `__DEV__`: Play Integrity attests
 * "this app came from Play". Our `preview` profile is an internally-distributed
 * APK — sideloaded, so Play reports UNRECOGNIZED_VERSION and the token never
 * verifies. Harmless while enforcement is off, but the day it's on, every
 * preview build would break. So Play Integrity runs ONLY where Play actually
 * distributes the app (eas.json: `production` = distribution "store"); every
 * other Android build uses the debug provider.
 *
 * If you ever ship `preview` through Play's internal testing track, add it here.
 */
export const PLAY_DISTRIBUTED_CHANNELS = ["production"];

/**
 * Which attestation provider each platform should use. Pure + exported so the
 * rule is unit-tested rather than buried in an init closure — picking wrong here
 * means either broken builds (Play Integrity on a sideloaded APK) or a weaker
 * guarantee (debug where real attestation was possible).
 *
 * @param {object} env { isDev: boolean, channel: string|null|undefined }
 * @returns {{apple: {provider: string}, android: {provider: string}}}
 */
export function pickProviders({ isDev, channel }) {
  const playDistributed = !isDev && PLAY_DISTRIBUTED_CHANNELS.includes(channel);
  return {
    // iOS attests on any real device signed by our team (dev, ad-hoc,
    // TestFlight). Only the Simulator can't — hence the isDev split.
    apple: { provider: isDev ? "debug" : "appAttestWithDeviceCheckFallback" },
    // Android only attests where Play actually distributes the app.
    android: { provider: playDistributed ? "playIntegrity" : "debug" },
  };
}

/** @returns {string|null} the EAS channel, or null when unavailable */
function currentChannel() {
  try {
    return Updates.channel || null; // '' in a local dev run
  } catch {
    return null;
  }
}

let nativeMods; // undefined = unprobed · null = unavailable · object = ready
let nativeReady = null; // Promise<AppCheck>
let registered = false;

/**
 * Probe the native modules ONCE. Returns null when the binary predates them —
 * which is a real, expected state, not just a dev accident:
 *   • Metro serving new JS onto an older simulator/dev build, and
 *   • an `eas update` OTA landing on a build without the native module.
 * In that case App Check must vanish completely rather than make every Firebase
 * call attempt a token it can never get. Cached so we warn once, not per call.
 * @returns {object|null}
 */
function loadNative() {
  if (nativeMods !== undefined) return nativeMods;
  try {
    // Required lazily so a JS-only context (tests, web) never loads native just
    // by importing this file.
    const { getApp } = require("@react-native-firebase/app");
    const mod = require("@react-native-firebase/app-check");
    const appCheckNs = mod?.default;
    const { initializeAppCheck, getToken } = mod || {};
    if (
      typeof getApp !== "function" ||
      typeof appCheckNs !== "function" ||
      typeof initializeAppCheck !== "function" ||
      typeof getToken !== "function"
    ) {
      throw new Error("RNFirebase App Check exports missing");
    }
    getApp(); // throws when the native RNFBAppModule isn't in the binary
    nativeMods = { getApp, appCheckNs, initializeAppCheck, getToken };
  } catch (e) {
    console.warn(
      "App Check: native module unavailable — attestation disabled for this build.",
      "Rebuild natively (expo run:ios / eas build) to enable it.",
      `(${e?.message})`
    );
    nativeMods = null;
  }
  return nativeMods;
}

/** Start (once) the native attestation provider. */
function ensureNative() {
  if (nativeReady) return nativeReady;
  const mods = loadNative();
  if (!mods) return Promise.reject(new Error("App Check native unavailable"));
  nativeReady = (async () => {
    const provider = mods.appCheckNs().newReactNativeFirebaseAppCheckProvider();
    const { apple, android } = pickProviders({
      isDev: __DEV__,
      channel: currentChannel(),
    });
    provider.configure({ apple, android, isTokenAutoRefreshEnabled: true });
    return mods.initializeAppCheck(mods.getApp(), {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  })().catch((e) => {
    // Never let attestation break the app: with enforcement off, a missing token
    // is harmless. Reset so a later call can retry a transient failure.
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
  // Probe FIRST. Without the native module there's no token to be had, so
  // registering the provider anyway would make the web SDK attempt (and log) a
  // failed App Check fetch on every auth/Firestore/callable call. Staying
  // unregistered is the honest degrade: no attestation, no noise, no overhead.
  const mods = loadNative();
  if (!mods) return false;
  try {
    initWebAppCheck(getWebApp(), {
      provider: new CustomProvider({
        getToken: async () => {
          const instance = await ensureNative();
          const { token } = await mods.getToken(instance, false);
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
