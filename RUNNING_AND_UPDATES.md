# Kinlo — Running locally & shipping updates (OTA)

Practical cheat‑sheet for running the app on a simulator/emulator and pushing
changes without burning EAS build credits.

## Mental model (read this first)

| Change type | How it ships | Cost |
|---|---|---|
| **JS‑only** (screens, logic, styles, copy, most fixes) | `eas update` (OTA) | **Free** — no build |
| **Native** (new native lib, permission/plugin, SDK bump, app `version` bump) | `eas build` | 1 iOS build (of your monthly quota) |
| **Local testing** (simulator/emulator) | `npm run ios` / `npm run android` | **Free** — local build, never touches EAS |

OTA works on **iOS and Android** — a single `eas update` publishes bundles for
both. It only reaches a build **after** that build was made with `expo-updates`
embedded (already configured — see bottom).

This app can **not** run in Expo Go (it uses Stripe, Google Sign‑In, etc.). It
runs as a **dev client**, which `npm run ios`/`android` builds for you.

---

## 1. Run on a simulator / emulator

### First time (or after a native change)
Builds the dev client locally and launches it. Free — no EAS involved.

```bash
# iOS Simulator (macOS)
npm run ios            # = expo run:ios  (prebuild + build + launch + start bundler)

# Android emulator (start an emulator first, or plug in a device)
npm run android        # = expo run:android
```

### Day‑to‑day (JS changes only)
The dev client is already installed on the sim/emulator, so just start the
bundler and it connects — no rebuild needed:

```bash
npx expo start          # or: npm start
# press  i  → open on iOS Simulator
# press  a  → open on Android emulator
# press  r  → reload    press  m → dev menu
```

If it doesn't auto‑connect to the dev client, use:

```bash
npx expo start --dev-client
```

> You only need `npm run ios` / `npm run android` again when you change
> something **native** (add a native dependency, edit `plugins`/permissions in
> `app.json`, etc.). Pure JS edits just need `expo start` + reload.

---

## 2. Ship a JS update over‑the‑air (no build)

Once a build exists that was made **after** the OTA setup (see bottom), publish
JS‑only changes to testers instantly:

```bash
eas login                                   # once per machine

# Publish to a channel (matches eas.json build profiles):
eas update --branch production  -m "what changed"   # → production builds (TestFlight/store)
eas update --branch preview     -m "what changed"   # → preview builds
eas update --branch development -m "what changed"   # → dev-client builds
```

- Publishes for **iOS + Android** at once (add `--platform ios|android` to limit).
- Testers get the update **on next app launch** (it downloads in the background,
  applies on the following launch).
- Channel ↔ branch: our build profiles set `channel` = `development` / `preview`
  / `production` (see `eas.json`). Publishing to the branch of the same name is
  picked up by builds on that channel. First time, if a channel isn't linked to
  its branch yet:
  ```bash
  eas channel:edit production --branch production
  ```

Check what's live:
```bash
eas update:list --branch production
eas channel:view production
```

---

## 3. When you MUST make a new build (uses a build credit)

Do a build **only** when the change is native:

- Added/updated a **native** module (anything with iOS/Android native code).
- Changed `plugins`, permissions, `scheme`, icons/splash, entitlements.
- Bumped the app **`version`** in `app.json` (see runtimeVersion note below).

```bash
# Local (free) — good for simulator/emulator testing:
npm run ios
npm run android

# EAS (uses a build credit) — for TestFlight / Play internal:
eas build --profile production --platform ios
eas build --profile production --platform android
eas submit --profile production --platform ios      # upload to TestFlight
```

Optional pre‑build sanity gate (lint + tests + rules e2e + doctor + export):
```bash
npm run gates
```

---

## 4. runtimeVersion — why OTA sometimes needs a build

`app.json` uses `runtimeVersion.policy: "appVersion"`. An OTA update only
applies to a build whose **app version matches** the update's runtime version.

- Keep `version` the same → JS updates flow over OTA. ✅
- Bump `version` (e.g. `1.0.0` → `1.1.0`) → you **must** build once; updates
  then target the new version. This is the safety valve: JS that expects new
  native code can't land on an old build.

Rule of thumb: **bump `version` only when you also make a build.**

---

## OTA setup (already done — reference)

Configured so the **next** build is OTA‑enabled:

- `expo-updates` installed (SDK 54 compatible).
- `app.json`:
  ```json
  "runtimeVersion": { "policy": "appVersion" },
  "updates": { "url": "https://u.expo.dev/0cf2c3f2-26ad-4e9f-816f-b449085f9b10" }
  ```
- `eas.json`: `channel` on each build profile (`development` / `preview` / `production`).

Native wiring is regenerated automatically on `expo run:*` and `eas build`
(this project uses CNG — `ios/` and `android/` are generated, not committed).

## Notes / gotchas

- **Firebase is on `bondvibe-dev`.** The app config (`app.json → extra`) points
  to dev; backend deploys done via `firebase deploy` (rules/functions/hosting)
  are independent of builds and OTA.
- **First OTA‑enabled build:** OTA only reaches builds created **after** this
  setup. Your existing TestFlight builds (pre‑`expo-updates`) won't receive OTA
  until you ship one new build.
- **`eas update` ≠ `eas build`.** Only `eas build` consumes your monthly iOS
  build quota. `eas update` is free and unlimited.
