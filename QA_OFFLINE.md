# QA — Offline auth + FEATURED (device pass)

Real device required (simulator airplane-mode is unreliable). Needs an already
**onboarded** account (reached MainTabs once online). Check items as you go.

## 🔴 P1 — Offline behavior (the reason for the device pass)

### A) Onboarded user, cold start with no network
- [ ] Open online → reach MainTabs (this writes the route-cache).
- [ ] Fully kill the app (swipe from multitask).
- [ ] Airplane mode ON → open the app.
  - [ ] Lands directly on **MainTabs**. Never Welcome/Login, never signed out, never stuck on the loading screen.
- [ ] Airplane mode OFF.
  - [ ] Stays on MainTabs; data loads; no flicker back to onboarding.

### B) Deleted / orphaned account
- [ ] Delete the account's Firestore user doc (Firebase console), **online**, open app → kicked to Login with "Account Issue" modal.
- [ ] Same account, **airplane mode** at launch → stays (not signed out offline). Restore network → signs out to Login.
  - (If the account was onboarded before deletion it may show MainTabs briefly then self-correct on reconnect — expected.)

### C) Never-onboarded user, offline
- [ ] New account that never finished onboarding, airplane mode → waits (no crash, no sign-out).

## 🟠 P2 — New-user signup flow (regression check)
- [ ] Sign up a new account → verification email arrives → tap link → web page **"Open Kinlo"** opens the app (`kinlo://`).
- [ ] Enter password → **Sign In** → navigates (not "does nothing").
- [ ] Onboarding advances: **Legal → Profile → @handle → AI opt-in → MainTabs**, each step advancing on completion (Legal "Continue" doesn't hang).

## 🟡 P3 — ChooseHandle timeout (BUG 35.1)
- [ ] At the @handle step, flaky/no network on "Claim": after ~15s the spinner stops, the button re-enables, a retry alert appears; input is locked while claiming.
- [ ] Normal network → claims and advances.

## 🟢 P4 — FEATURED carousel (BUG 37)
Needs a promoted (featured) event with a **past** date (e.g. promote yesterday's event for 14 days).
- [ ] Home: the past-dated featured event is **gone** from the FEATURED carousel.
- [ ] An event happening **today** still shows.
- [ ] No valid featured events → the FEATURED section is hidden (zero-state shown, no empty band).

## ⚪ Deep links (already live via Hosting — confirm)
- [ ] Email verification "Open Kinlo" opens the app.
- [ ] Password-reset page "Open" button opens the app.
- [ ] Finishing Stripe host onboarding → return page reopens the app.

---
**Minimum before OTA:** A, B, and P2. Those cover the real risk in this batch.

_After a client-only change reaches TestFlight via `eas update --branch production --platform ios`; fully close & reopen the app (once or twice) to pick up the OTA._
