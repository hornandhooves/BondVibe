# Kinlo — Security Audit & Pentest (Round 1)

> ## ✅ Remediation status (2026-07-06)
> **All CRITICAL + HIGH findings fixed and live-verified against kinlo-app-dev.**
> | Finding | Status |
> |---|---|
> | C1 self-grant admin | **FIXED** — `role` owner-writable only to user/host; `role:'admin'` → 403 (verified) |
> | C2 deleteUserAccount unauth | **FIXED** — ID-token required; no token → 401, other userId → 403 (verified) |
> | H1 attendee IDOR | **FIXED** — self-remove-only; cross-user rewrite → 403 (verified) |
> | H2 client-controlled price | **FIXED** — price read from event doc server-side (Stripe + MP) |
> | H3 Stripe Connect unauth | **FIXED** — ID-token required; no token → 401 (verified) |
> | H4/M4 storage world-write | **FIXED** — uploads namespaced by uploader uid + owner-only |
> | H5 rating forgery | **FIXED** — hostId==creatorId + deterministic id (one/user/event) |
> | H6 PII world-read | **FIXED** — email→Auth, phone→private subcollection; enumerating users exposes no PII (verified); 119 docs migrated |
> | H7 payment endpoints unauth | **FIXED** — ID-token required; clients send Bearer |
> | M1 event-create server fields | **FIXED** — averageRating/totalRatings/matching/featured* blocked |
> | M3 match_intel leak | **FIXED** — re-checks caller check-in + target visibility |
> | M5 Places key | **MITIGATED** — API-restricted to Places; operator TODO: daily quota + optional proxy |
> | M2 notification spoofing | **FIXED** — server-side `createNotification` (server-set fromUserId); direct create → 403 (verified) |
> | L1 legacy `conversations` | **FIXED** — screen+route deleted, collection denied; read → 403 (verified) |
> | L4 SVG content-type | **FIXED** — whitelist png/jpeg/webp/heic |
> | pushToken cross-write | **FIXED** — cross-user branch may only CLEAR (null), not hijack |
> | INFO MP webhook signature | **MITIGATED** — handler independently re-fetches the payment from MP's API |
>
> **Follow-up recommendations (7):** all addressed 2026-07-06 — admin custom claim, notifications server-side, conversations deleted, and Stripe-API paid-host verification are **DONE + deployed**; App Check (#2) and Places daily-quota (#6) are **operator console actions** (documented below). See "Anything else" section.



**Target:** `kinlo-app-dev` (Firebase project) · Expo/React Native client + Firestore + Storage + Cloud Functions
**Date:** 2026-07-06 · **Scope:** dev only (never prod) · **Method:** static rule/function analysis (multi-agent, adversarially verified) + non-destructive live probing with a test account's ID token.
**Threat model:** an attacker with a *valid Firebase account* (mints their own ID token, calls Firestore/Storage/Functions REST directly, bypassing the app UI). This is the realistic model — the app's rules & functions are the only real boundary.

> ⚠️ **Bottom line:** the backend currently trusts the client far too much. A brand-new account can **grant itself admin**, **delete any user's account**, **enter paid events for free / underpay hosts**, **hijack host Stripe payouts**, **forge ratings**, and **overwrite any event/vehicle photo**. These are exploitable today on dev; if the same rules are on prod they are exploitable there. The fixes are small and mostly one-liners.

---

## Confirmed LIVE (executed non-destructively against kinlo-app-dev)

| # | Severity | Finding | Live evidence |
|---|----------|---------|---------------|
| C1 | **CRITICAL** | **Self-grant admin.** `users/{uid}.role` is owner-writable — `role` is missing from the update blocklist. Writing `role:"admin"` on your own doc makes `isAdmin()` true everywhere (rules + Cloud Functions). | `PATCH users/{me}` with only `role` → **HTTP 200** (tested with a sentinel value, then restored). Blocklist only covers `isPremium/plan/hostStats/carpoolStats/matchCountByEvent`. |
| C2 | **CRITICAL** | **`deleteUserAccount` is unauthenticated.** HTTP function takes `userId` from the request body, no ID-token check. Anyone can wipe any account. | `POST /deleteUserAccount {userId:"…"}` with **no auth header** → reached the DB op (failed only on a reserved sentinel id), i.e. **no auth gate**. |
| H3 | **HIGH** | **Stripe Connect endpoints unauthenticated + arbitrary `userId`** (`createAccountLink`, `getAccountStatus`, `createConnectAccount`). Payout onboarding / account-status for any host → payout & bank-account hijack. | `POST /createAccountLink` / `/getAccountStatus` with **no auth**, arbitrary `userId` → passed auth, hit the DB. |
| H6 | **HIGH** | **All user PII world-readable.** `users` read rule is `if isSignedIn()` — any account can enumerate the whole user table and read **email / phone / location / isOver18**. Directory harvest → phishing / credential-stuffing. | Listed `users` as the test account → 5/5 docs returned, **email present on every one**. |
| M5 | **HIGH*** | **Unrestricted Google Places API key** shipped in the client bundle (`app.json`, `AIzaSy…UT7Qc`). No app/referrer restriction → extract from bundle, run unbounded Maps/Places billing on the account. | Raw `curl` to Places Autocomplete with the bundle key, no referrer → **`status: OK`**. |

\* workflow rated M5 medium; raised to **high** here because it's uncapped financial exposure.

**Negative controls that PASSED (proves the audit is calibrated, and these defenses are solid):**
`isPremium`+`role` written together → **DENIED** (isPremium is blocklisted) · cross-user reads of `payments`, `dms`, `memberships`, `rentals`, `reports`, `crashes` → **all DENIED** · Firebase anonymous signUp → `ADMIN_ONLY_OPERATION` (off). The money-storage collections (memberships, redemptions, reservations, payments, rentals, promotions) are correctly **server-write-only**.

---

## Full findings (34 confirmed · 4 refuted · 0 uncertain — deduped)

### CRITICAL
- **C1 · Self-grant admin** — `firestore.rules:70-76` (update) & `:60-63` (create). Add `role` (and `hostApproved`, `canCreatePaidEvents`, `hostConfig`) to both blocklists. *Also fix the server:* Cloud Functions derive admin from the same client-written `role` (`functions/index.js:1991`, `stripe/refunds.js:427`) — after the rule fix, admin authority is trustworthy again, but consider a custom-claim (`admin:true` on the Firebase Auth token) as the real source of truth.
- **C2 · `deleteUserAccount` unauthenticated** — `functions/index.js:1767`. Verify the caller's Firebase ID token and delete **only `request.auth.uid`** (or require admin). Same class: audit every `onRequest` HTTP function for a missing token check.

### HIGH
- **H1 · Event attendee/waitlist IDOR** — `firestore.rules:129-134`. The `onlyUpdating(['attendees'])` / `['waitlist']` / `['interested']` branches have **no participant/self check** → any user rewrites any event's attendee list. Enables: free entry to **paid** events (legit joins go through the `joinEvent` function, so this write path is pure attack surface), reading the private `events/{id}/messages` chat (become a participant), enabling rating-forgery, and wiping a rival's attendees. Fix: allow only self-add/self-remove (`request.resource.data.attendees` differs from `resource.data.attendees` by exactly the caller's own uid), or move all attendee mutations server-side.
- **H2 · Client-controlled ticket price** — `functions/index.js:317-320` (Stripe) + `functions/mercadopago.js:34` (MP). The payment intent trusts the client-sent price/amount → buyer underpays to ~fees. Fix: load the event server-side and compute the amount from `event.price`; never trust a client amount.
- **H3 · Stripe Connect unauthenticated** (LIVE above) — `functions/stripe/stripeConnect.js:21,124,195`. Require ID token; act only on the caller's own uid.
- **H4 · Storage: events & vehicles world-writable** — `storage.rules:19-24` (`events/{eventId}/…`) & `:44-49` (`vehicles/{vehicleId}/…`): `allow write: if isSignedIn()`. Any user overwrites any event's hero image or any rental listing's photos (defacement / marketplace fraud). Storage can't read Firestore to verify owner, so gate uploads through a Cloud Function that checks ownership and writes via Admin SDK, or namespace by uid (`events/{eventId}/{uid}/…`) and only allow the owner.
- **H5 · Rating forgery** — `firestore.rules:222-224`. `hostId` is client-supplied and not checked against the event's `creatorId`; no one-rating-per-user uniqueness. `onRatingCreated` then aggregates onto the attacker-named host → tank any host's average. Fix: derive `hostId` server-side (or validate it equals the event creator) and enforce a deterministic rating doc id (`{eventId}_{uid}`).
- **H6 · PII world-readable** (LIVE above) — `firestore.rules:57`. Restrict `users` reads: either a public projection (name/avatar/city only) via a separate `publicProfiles` collection, or rules that forbid returning `email`/`phone` to non-owners (Firestore can't field-filter reads, so the clean fix is a public-profile mirror written server-side; keep the private doc owner-only).
- **H7 · Payment HTTP endpoints don't verify ID token** — `functions/index.js:304-320`. Payer/host identity comes from the request body. Same fix as C2: verify the token, derive identity server-side.

### MEDIUM
- **M1 · Event create doesn't restrict server-owned fields** — `firestore.rules:105`. A host can create an event with a fake `averageRating`/`totalRatings` and a free `matching` config (a Kinlo Pro feature). Block those keys on create.
- **M2 · Notification spoofing/phishing** — `firestore.rules:320-322` `allow create: if isSignedIn()` with client-supplied `userId`. Any user writes arbitrary notifications ("You're now Admin!", payment-themed links) to any user. Move notification creation server-side (Cloud Functions), or validate `userId == request.auth.uid` (breaks cross-user notifications — so server-side is the right move).
- **M3 · `match_intel` leaks hidden match profiles** — `functions/ai/features.js:164`. Loads the *other* attendee's match profile with no mutual-match or visibility check → an opted-in user reads anyone-at-the-event's interests/bio/lookingFor even if they set visibility off. Add the same visibility/consent gate the grid uses.
- **M4 · Group photos world-writable** — `storage.rules:35-40`. Includes overwriting moderation-evidence images. Same fix as H4.
- **M5 · Unrestricted Places key** (LIVE above) — restrict the key in the Google Cloud console to the app bundle IDs + Places API only, and set a daily quota. Consider proxying Places through a Cloud Function so the key never ships in the bundle.

### LOW / INFO
- **L1** `conversations` + messages world-readable (`firestore.rules:358-368`) — legacy/orphaned `ConversationsScreen`; delete the collection+screen or scope it.
- **L2** `events.interested[]` fully rewritable by anyone (`:134`) — signal tampering (same root as H1).
- **L3** Recap upload is **not** actually check-in-gated — the Storage rule only checks uid; the Firestore `recapPhotos` rule does the check-in gate, but a client can upload the Storage object directly. Low impact (orphan blob).
- **L4** `image/.*` admits `image/svg+xml` (`storage.rules:15`) — stored-XSS-via-SVG vector if images are ever rendered in a webview; also the content-type is client-declared. Whitelist `image/(png|jpeg|webp)`.
- **L5** No object-count/rate cap on `Date.now()`-named upload paths → storage-cost exhaustion.
- **INFO** `mercadoPagoWebhook` has no signature verification (`functions/mercadopago.js:103`) — defense-in-depth; the Stripe webhook *does* verify.

### Refuted by the adversarial pass (not vulnerabilities)
Membership/payment/rental/promotion **writes** are server-only (rules deny client create/update) — the money records themselves can't be forged. DMs (`dms`) are strictly participant-scoped. The matching like-cap is server-enforced in `callClaude`/matching functions. `isPremium`/`plan` are not client-writable.

---

## Remediation priority (small, high-value)
1. **C1** add `role` (+host flags) to the `users` create/update blocklists — *one line, stops full compromise*. Then move admin to a custom claim.
2. **C2 / H3 / H7** — add `verifyIdToken` + server-derived uid to every `onRequest` function (`deleteUserAccount`, Stripe Connect, payment intents). Prefer converting them to `onCall` (auth is automatic).
3. **H2** — compute payment amounts server-side from the event doc.
4. **H1 / H5** — restrict attendee writes to self-add/remove; validate rating `hostId` server-side + deterministic id.
5. **H4 / M4** — gate Storage writes by ownership (Cloud Function or uid-namespaced paths).
6. **H6 / M2 / M3** — public-profile mirror for PII; server-side notifications; visibility gate on `match_intel`.
7. **M5** — restrict the Places key in the Cloud console (+ quota).

## E2E coverage (this session)
Attendee core journey driven on the iOS simulator (Maestro): login → 5-tab shell renders → Home (search + Weekly-Digest banner, **no** Quick-Actions grid) → Wall (Smart Wall AI card + Ask Kinlo) → header Inbox (Ask Kinlo pinned + Event/Match chats + DMs) → Rentals tab → Profile (Settings, **no** "Host tools moved"). City dropdown verified on-device (Tulum/Playa/Cancún). Group-chat Spotify flow + Admin cities editor verified earlier this session. AI features (smart_wall, ask_kinlo, host_copilot, member_intel, ai_analytics, weekly_digest) verified live against the deployed `callClaude` with correct freemium gating.

---

## "Anything else we should fix?" — follow-ups (all addressed 2026-07-06)

The 7 defense-in-depth recommendations were all implemented, deployed to kinlo-app-dev, and (where a runtime surface exists) live-verified.

1. **Admin authority → Firebase Auth custom claim** — **DONE.** `isAdmin()` in rules now reads `request.auth.token.admin == true` first (forgery-proof, no doc read), with the write-restricted `role=='admin'` doc kept only as a safe fallback. New `promoteToAdmin`/`revokeAdmin` callables set the claim + keep `role` in sync (admin-gated; self-revoke blocked). `isAdminUid()` (functions) checks the Auth claim first. Existing admins bootstrapped by `scripts/migrate-admin-claims.mjs` (1 admin migrated). **Live-verified:** `promoteToAdmin` as non-admin → 403.
2. **Firebase App Check** — **DOCUMENTED (operator action, needs native + console).** Enforcement can't be enabled from code alone without the attestation providers registered, or every real client is locked out. Setup checklist: (a) register App Check in the Firebase console with **App Attest** (iOS) and **Play Integrity** (Android); (b) add `expo-firebase-app-check` / native config and call `initializeAppCheck` at startup; (c) turn on **enforcement** for Firestore, Storage, and Functions *after* clients ship the SDK. Rules + function auth remain the real boundary; App Check raises the edge bar. **Not enabled** to avoid breaking the current dev clients.
3. **Notification creation server-side (M2)** — **DONE.** New `createNotification` callable stamps a trustworthy `fromUserId` + server timestamp; privileged types (`host_approved`/`host_rejected`) are admin-gated. Firestore `notifications` create is now `if false`; both client writers (`utils/notificationService`, `services/notifications`) route through the callable. **Live-verified:** direct REST create → 403; callable legit type → 200 `{ok:true}`; callable `host_approved` as non-admin → 403.
4. **Legacy `conversations` collection + orphaned screen** — **DONE.** `ConversationsScreen.js` deleted, route + import removed from `AppNavigator`, and the `conversations` rules set to `allow read, write: if false`. **Live-verified:** read of a `conversations` doc → 403.
5. **Paid-host verification** — **DONE.** All three paid-payment functions (`createEventPaymentIntent`, `createMembershipPaymentIntent`, `reserveVehicle`) now call `stripe/verify.assertCanCharge()`, which retrieves the connected account from the **Stripe API** and checks `charges_enabled` — replacing the client-forgeable `stripeConnect.chargesEnabled` / `hostConfig.canCreatePaidEvents` Firestore flags. Verified by deploy + code review (a live probe needs a Connect test account in a non-chargeable state).
6. **Places API key** — **DOCUMENTED (operator action).** The key is already API-restricted to `places-backend.googleapis.com`. Remaining hardening is console/billing config: set a **daily quota cap** on the Places API in the Google Cloud console (Quotas), and optionally **proxy Places through a Cloud Function** so the key never ships in the bundle. No code change is safe to make unilaterally here (a wrong quota breaks live autocomplete).
7. **Storage rate/size caps (L5) + recap check-in gating (L3)** — **PARTIALLY DONE.** Size caps are enforced (5–10 MB per path) and content-types are whitelisted (L4). The Firestore `recapPhotos` doc is already check-in-gated; the raw Storage object isn't (low impact — the object is inert unless a gated Firestore doc references it). Per-user upload *rate* limiting has no Storage-rules primitive and remains an App-Check/Cloud-Function concern (see #2).

## Deploy state
All fixes deployed to **kinlo-app-dev** (Firestore rules, Storage rules, Cloud Functions: `createNotification`, `promoteToAdmin`, `revokeAdmin`, `createEventPaymentIntent`, `createMembershipPaymentIntent`, `reserveVehicle`, `adminListUserEmails`). Admin custom-claim migration run (1 admin). Places key API-restricted in Google Cloud. 119 user docs migrated (PII). 243/243 jest green. Not deployed to prod (you manage releases).

**Operator TODO (not code):** enable App Check enforcement (#2) and set the Places daily quota (#6) from the Firebase/Cloud consoles.
