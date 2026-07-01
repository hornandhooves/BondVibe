# BondVibe — Pre-production QA checklist

Goal: the **next EAS build is production-ready** (no crashes, no obvious bugs).
EAS builds are scarce — catch everything here first. You do **not** need an EAS
build to test: run the app on a local Simulator/emulator (free, unlimited).

---

## 0. Automated gates — all must be green before building

```bash
npm run lint           # ESLint: 0 crash-relevant errors (no-undef, hooks, jsx-no-undef)
npm test               # Jest: UI + smoke (all 41 screens render) + unit
npm run test:e2e       # Live E2E: rules + Cloud Functions + triggers (74 checks)
npx expo-doctor        # Config + native dependency versions (must be 18/18)
npx expo export --platform ios       # Bundles without error
npx expo export --platform android   # Bundles without error
```

Optional (needs JDK 21+): `npm run test:e2e:emulator` runs the E2E offline.

---

## 1. Run it locally (where most crashes appear)

```bash
npx expo run:ios        # builds + runs on the iOS Simulator (no EAS build used)
npx expo run:android    # Android emulator
# or a physical device with a dev client:  npx expo start --dev-client
```

Walk through every flow below on **both** iOS and Android. Watch the Metro
console for red-box errors / warnings.

---

## 2. Manual QA by area  (check each box)

### Auth & onboarding
- [ ] Sign up (new email) → email verification screen → verify → lands in app
- [ ] Log in / log out / log back in (push token clears on logout)
- [ ] Forgot password flow
- [ ] Personality test → results screen renders the radar + insights
- [ ] Profile setup (name, city, avatar) saves

### Discovery & events (attendee)
- [ ] Home: greeting, quick actions, categories, featured, notifications bell badge
- [ ] Explore: search by text, filter by community, From/To date filter (iOS spinner + Android dialog), language filter
- [ ] Open an event → details render, map/area, attendee count
- [ ] Join a **free** event (joinEvent) → appears in My Events; capacity respected
- [ ] Leave an event
- [ ] Keyboard "Done" bar appears + dismisses on every text input

### Payments (test mode — real device for cards)
- [ ] Paid event → Checkout → Stripe CardField → pay (4242 4242 4242 4242) → enrolled
- [ ] Mercado Pago host → "Continue with Mercado Pago" → sandbox checkout → enrolled via webhook
- [ ] Promote/feature an event (PromoteEventScreen)
- [ ] Membership purchase (MembershipCheckout) → credits appear in My Memberships

### Hosting
- [ ] Request to be a host → admin approves → host tools appear
- [ ] Create event (one-time + recurring via RecurrenceModal) — **verify the end-date picker works** (was dead code, now removed)
- [ ] Edit event, add/remove co-host (Pro)
- [ ] Host CRM, Analytics, Stripe Connect screen
- [ ] Membership plans: create, archive, reactivate — **archived plan must NOT break existing members' credits** (proven by `scripts/e2e-membership.js`)

### Groups (host)
- [ ] Create group (free = 1 group; 2nd shows "Go Pro" upsell)
- [ ] Add/remove members (GroupManage); invite by code + by email
- [ ] Group chat: send message, event invite card, poll
- [ ] Read receipts: ✓ sent → ✓✓ delivered → ✓✓ read (blue); badge clears on open

### Carpool (inside event chat)
- [ ] Driver offers a ride → card in chat
- [ ] Rider requests seat → driver notified
- [ ] Driver approves → rider notified; seats update

### Notifications
- [ ] Bell badge counts unread; tapping a notification deep-links correctly
- [ ] (Real device) push arrives for: group message, event chat, carpool, rating

### QR check-in (Pro, real device — camera)
- [ ] Attendee shows QR (EventDetail) → host scans (CheckInScanner) → checked in

### Pro
- [ ] "Go Pro" → Stripe subscription checkout → returns → isPremium flips → Pro features unlock
- [ ] AI: feedback insights, listing writer, review reply (needs Anthropic credits)
- [ ] Manage subscription → Stripe billing portal

### Admin (jcpuntoduarte only)
- [ ] Admin dashboard: user list, suspend/unsuspend, promote/remove roles
- [ ] Delete user, Reset password (share link)

### Safety / legal
- [ ] Report, Safety Center, Legal screens open

---

## 3. Real-device-only (won't work in Simulator / Expo Go)
- [ ] **Push notifications** delivery (needs the build on a physical device)
- [ ] **Camera** (QR check-in)
- [ ] **Stripe Apple Pay** (if enabled)
- [ ] Deep links: `bondvibe://join-group/CODE`, payment return pages

---

## 4. Config / secrets before the production build
- [ ] **Anthropic**: add billing/credits (AI returns "credit balance too low" otherwise)
- [ ] **Crash logs**: none needed — JS crashes land in the Firestore `crashes`
      collection (Firebase console). Free, no third party.
- [ ] **Stripe webhook**: endpoint listens to `payment_intent.succeeded`,
      `checkout.session.completed`, `customer.subscription.updated|deleted` (done)
- [ ] **Mercado Pago**: production account (currently sandbox)
- [ ] Switch Stripe to **live keys** for a real production release (currently `pk_test`)
- [ ] `joinEvent` **Deploy 2**: deploy the hardened attendees rule (see NOTES.md) *after* this build is adopted

---

## 5. Edge cases worth a manual pass
- [ ] Open a screen with no data (empty states render, no crash)
- [ ] Airplane mode / offline: graceful errors, no hard crash
- [ ] Slow network: spinners, no double-submit on pay/join
- [ ] Background → foreground (notification handler, token refresh)
- [ ] Small + large devices (layout), dark + light theme
