# App Check — pending setup (bundle with the next native build)

**Status:** deferred to the next native (TestFlight) build. It is *not* a launch
blocker — the public `sendPasswordResetEmail` callable is already guarded by
rate-limiting (per-email cooldown + per-IP 20/hr + global 300/hr backstop, in
`functions/authEmails.js`). App Check is **defense-in-depth** on top of that.

**Why it can't ship via OTA:** App Check attestation is native
(App Attest on iOS, Play Integrity on Android). The client uses the Firebase
**web JS SDK** (`firebase` ^12.7.0, see `src/services/firebase.js`), whose
built-in App Check providers are reCAPTCHA (web-only) and cannot attest under
React Native. So it needs a native module + a native build, and it can only be
**verified inside that build** (App Attest doesn't work on simulator without a
debug token; Play Integrity needs Play Console).

---

## 1. Firebase Console (prerequisites)
Firebase Console → project `kinlo-app-dev` → **App Check**:
- Register the **iOS app** (`com.kinlo.app`) with **App Attest** (needs the
  Apple Team ID; DeviceCheck as fallback for older iOS).
- Register the **Android app** (`com.kinlo.app`) with **Play Integrity** (link
  the Play Console app).
- Add **debug tokens** for the iOS Simulator and Android Emulator so dev builds
  can call functions during testing.
- Leave enforcement **OFF** for now (register only).

## 2. Client (native change — needs the build)
- Add `@react-native-firebase/app` + `@react-native-firebase/app-check` and their
  Expo config plugins to `app.json` (this is the native module that forces the
  build; not OTA-able).
- Initialize App Check early (before any `httpsCallable`), selecting the
  App Attest / Play Integrity providers per platform, debug provider in `__DEV__`.
- Bridge to the web SDK: wrap the web SDK's App Check `CustomProvider` so it reads
  the token from `@react-native-firebase/app-check` — that way the existing
  `getFunctions()` / `httpsCallable` calls in `SignupScreen.js` / `LoginScreen.js`
  carry the token without rewriting the auth/firestore/functions code.

## 3. Server (one-line flip — do LAST)
In `functions/authEmails.js`, add `enforceAppCheck: true` to the `onCall` options
of `sendPasswordResetEmail` (and consider the other public/onCall functions).
**Only after** step 2 ships and tokens are confirmed flowing — enforcing before
that returns `unauthenticated` and breaks the live reset flow.

## 4. Rollout order (safe)
1. Console: register providers + debug tokens (enforcement off).
2. Native build with the client integration → verify on a real device (App Attest)
   + simulator/emulator (debug token) that reset/verify still work.
3. Watch App Check **metrics** (verified vs unverified) in the Console for a bit
   with enforcement still OFF.
4. Once ~all live traffic is verified, flip `enforceAppCheck: true` server-side
   and redeploy. Keep the rate-limits — they stay as a second layer.

## Keep regardless
The rate-limiting in `sendPasswordResetEmail` stays even after App Check lands —
belt and suspenders on a public endpoint.
