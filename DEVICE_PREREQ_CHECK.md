# Prerequisite (a) — confirm the device runs the post-#26 client

DEPLOY_SEQUENCE step (a). Run this on the test device BEFORE merging #30 and
deploying rules. Nothing here deploys or migrates.

## Why this gate exists

Deploying `firestore.rules` from `main` hardens host onboarding: `role` and
`hostConfig` become non-client-writable, in the same shot as the `plans` rule.

- The **post-#26 client** activates hosting through the `activateHost` /
  `deferHostType` Cloud Functions (Admin SDK, which bypasses rules). It keeps
  working after the hardening.
- A **pre-#26 client** wrote `role:'host'` straight to `users/{uid}`. The
  hardened rule rejects that, so on an old build nobody could become a host.

So: confirm the device is on the new client first. Verified in the branch code —
`HostTypeSelectionScreen.js:70,87` call the callables, and there is no client
write of `role`/`hostConfig` anywhere in the real flow (the only `role:'host'`
write left is `adminService.makeUserHost`, which has zero call sites and is
admin-gated regardless).

## Callables — confirmed ACTIVE (2026-07-17, kinlo-app-dev)

```
activateHost    ACTIVE   2026-07-17T03:08:04Z
deferHostType   ACTIVE   2026-07-17T03:08:03Z
```
`assignPlanManually` is NOT deployed yet — it ships in step (c). Not needed for
this prerequisite.

## 1. Which bundle is the device running?

Any ONE of these proves post-#26 (they only exist after #26):

- **RequestHost screen** shows tapable chips ("What kind of community?" + a
  one-line tagline, "Step 1 of 2"), NOT three 500-char essay boxes
  (whyHost/experience/eventIdeas). This is the clearest visual tell.
- After choosing a host type you land on **"Your community is live"**
  (HostLive) for free, or the **review-status timeline** (HostStatus) for paid.
  Neither screen exists pre-#26.
- Crash-logger stamps `appVersion` (crashLogger.js:27) — but version is 1.0.0
  in both, so it does NOT distinguish. Use the screens, not the version.

If the device shows the OLD RequestHost (three essays) → it's a stale bundle.
Fix without a native rebuild (this is all JS, OTA-able):
```bash
eas update --branch preview --platform ios --message "post-#26 client"
# then fully close and reopen the app twice (expo-updates applies on next launch)
```
Re-check the RequestHost screen.

## 2. Activate hosting (Free) and confirm the callable path

1. From a non-host account: Profile → become a host → RequestHost (chips) →
   submit → HostTypeSelection.
2. Pick **Start free** → tap through.
3. Expect to land on **"Your community is live"** (HostLive).
4. In Firestore, `users/{uid}` should now have `role: "host"` and a `hostConfig`
   with `type: "free"`, `payoutsIntent: null`, `canCreatePaidEvents: false`.

**Important — you can't tell who wrote it by looking at the doc.** The current
(un-hardened) rules let the client write `role` too, so a successful write here
does NOT by itself prove the callable path. Two ways to actually prove it:

- **Behavioural (device, quick):** the post-#26 UI simply has no code path that
  writes `role` directly — verified above — so if the new RequestHost/HostLive
  screens are what you're seeing, activation went through the callable. The
  screen identity IS the proof.
- **Definitive (emulator, if you want certainty before touching prod):** load
  the **hardened** `firestore.rules` into the Firestore emulator and confirm a
  direct client `updateDoc({role:'host'})` is DENIED while the `activateHost`
  callable still succeeds. `firebase.json` already has the emulator config and
  `scripts/e2e-rules.js` is the harness. This reproduces exactly what step (c)
  will enforce, with zero risk to prod.

## 3. If activation fails on the device

- **Old bundle** (old RequestHost) → the `eas update` above, reopen twice.
- **Callable error** (permission-denied / unauthenticated) → check you're signed
  in and that `activateHost` is ACTIVE (it is, per above). A pre-#26 bundle
  wouldn't even call it — it'd try a direct write, which succeeds TODAY (rules
  not yet hardened), which is exactly the state we're trying to leave behind.
  That's the tell: if hosting activates but the screens are the old ones, the
  device is on the old client and needs the OTA update before deploy.

## Green light

Proceed to (b) merge #30 only once: the device shows the NEW RequestHost/HostLive
screens AND a free activation succeeds. That confirms the client uses the callable
path, so the rules hardening in (c) won't strand anyone.
