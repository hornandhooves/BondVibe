# 08 · App Bug Fixes — Round 4 (reviewed against DuarTchock/Kinlo@main)

> App-wide QA pass after round-3. Each bug is mapped to the **real file/screen** in the repo. Build in the priority order below, **one commit per fix**, pausing after each block for review. English UI + comments. Use theme tokens (`src/contexts/ThemeContext` / `theme-tokens.js`) — no hardcoded colors. AI via existing `callClaude`. Pro-gating stays in `src/config/entitlements.js`. **After each fix run the app and confirm the specific screen in the screenshot behaves as described.**

Legend: 🔴 P0 blocker · 🟠 P1 · 🟡 P2 polish.

---

## 🔴 P0 — these block core flows

### BUG 15 — QR check-in only works inside an event
**Observed:** `Events → This event → Check-in scanner` and `Your Business → Check-in` both fail — scanning shows an error ("attendee doesn't belong to this event" / an orange message) **even though no event is selected**. The ONLY scanner that works is the one opened from *inside* a specific event (green success).
**Root cause:** the standalone scanner routes (`CheckInScanner` from Manage, and the hub `Check-in`) have **no event/session context**, so the validation can't match the attendee to an event.
**Do:**
1. The standalone scanner must **require a target first**: open a small picker — "Which event/class/session are you checking people into?" (host's upcoming/active items). Once chosen, it uses the exact same validated path as the in-event scanner (which works).
2. Alternatively support **member/business check-in** (not event-bound): scanning a member's Kinlo QR pass marks attendance against the business + deducts a membership credit (this is the hub `Check-in` intent). Decide by entry point: hub `Check-in` = business/member mode; Manage/event scanner = event mode.
3. Unify on the working scanner component; kill the divergent code path that throws the false "doesn't belong" error.
**Accept:** every scanner entry point produces the green success + records attendance; no false-negative error; membership credit deducts once (idempotent).

### BUG 13 — Messaging & notifications: one inbox, real push, badges
**Observed:** attendee never receives push (host does); the bell shows **no unread badge**; the header has **two icons** (chat → Messages, bell → Notifications). Screens: Home/Events header (`src/components/AppHeader.js`), `NotificationsScreen.js`, `MessagesScreen`.
**Do:**
1. **Collapse to ONE header icon → Messages** (remove the bell in `AppHeader.js`). Notifications become a **section inside Messages**, a peer of the existing **Event chats · Match chats · Community chats** — add a **"Notifications"** row/tab there. Keep `NotificationsScreen` as the destination of that row (don't rebuild it), just re-parent the entry.
2. **Unread badge** on the single Messages icon = unread chats + unread notifications combined. Wire it to the same unread index already used for the Home bell badge (`hostGroupService` references a `userId+read` index; reuse it) so it updates live.
3. **Attendee push:** verify the Expo push token is **registered for attendees**, not just hosts — check the token-registration call runs for every signed-in user (likely gated behind a host/admin branch or a permission prompt that never fires for attendees). Confirm the CF that sends (see `functions/notifications/*`, `functions/index.js` icon:"bell") targets attendee tokens. Test end-to-end: attendee joins event → host posts in group → attendee gets push + in-app + badge.
4. **Full messaging audit:** delivered vs sent, read receipts (blue ✓✓ already in `GroupChatScreen.js`), typing indicator, unread counts per thread, mark-as-read on open. Make these consistent across event/match/community/DM threads.
**Accept:** one Messages icon with a live badge; Notifications is a section inside Messages; attendees receive push+in-app; read/delivered/typing all work.

### BUG 12 — Screen jumps while typing (keyboard handling)
**Observed (video):** typing in the **event group chat** and the **login email** field makes the screen jump; the **login password** field does NOT jump. So the working field has the right setup and the others don't.
**Do:** apply the SAME keyboard handling the password field uses to the email field and the chat composer. Standardize `KeyboardAvoidingView` (`behavior={Platform.OS==='ios'?'padding':'height'}` + correct `keyboardVerticalOffset`) and stop re-mounting the input on each keystroke (a state/`key` change on the `TextInput`'s ancestor causes the jump). Check `GroupChatScreen.js` and the login screen.
**Accept:** no vertical jump on focus/keystroke in chat or login; composer stays pinned above the keyboard.

### BUG 1 — Every price in MXN (kill the ambiguous "$")
**Observed:** user reads "Kinlo Pro" as USD. **Backend is already MXN** (`functions/stripe/pricing.js`, `mercadopago.js`, `functions/index.js` all `currency:"mxn"`; `configService` pro=199/plus=129 MXN; `CreateEventScreen` writes `currency:"MXN"`). The problem is **display**: bare `$` reads as USD.
**Do:** make currency explicit **everywhere a price shows** — render `MX$199` or `$199 MXN`, never a lone `$199`. Fix `ProUpsellScreen.js`, `SubscriptionCheckoutView.js`, `ProCheckoutScreen`/`PlusCheckoutScreen`, `CreateEventScreen` price input (prefix `MX$`), `FinanceScreen` (`money()`), event detail price, membership/package prices, two-tier Local/General. Add a tiny `formatMXN(amount)` helper and use it. Confirm no code path charges USD (App Store IAP tier, if any, must be the MXN price).
**Accept:** every amount in the app reads unambiguously as MXN.

---

## 🟠 P1 — host business & event flows

### BUG 2 — Manage: rename "This event" → "Quick access", trim it
**Screen:** `ManageScreen.js` (Events tab, Hosting toggle).
**Do:** rename the **"This event"** section to **"Quick access"**. It should contain only **Create event** (move the big Create-event card down into this section) + **Hosted events**. **Remove Ratings** from here (it lives in Your Business — see BUG 17/round-2). Remove the standalone **Check-in scanner** row too (reachable inside each event and from the hub) — "only hosted events makes sense" per the user. 
**Accept:** Manage = the "Your Business" entry card + a "Quick access" section with Create event + Hosted events. No Ratings, no orphan scanner.

### BUG 17 — Business hub: scope control → "Choose event", inside Dashboard
**Screen:** `BusinessHubScreen.js` (screenshot 1:14).
**Do:** rename the scope segment **"This event"** → **"Choose event"**, and **move the whole `Whole business / Choose event` control OUT of the hub top and INTO the Dashboard section** (it's an analytics scope, so it belongs with the dashboard, not floating above every row). Keep the `BusinessScopeContext` behavior.
**Accept:** the hub top is just the business header; the scope switch lives in Dashboard and reads "Whole business / Choose event".

### BUG 3 — Create Event venue shows the address, not the venue name
**Screen:** `CreateEventScreen.js` venue field + the "Search venue" Google Places sheet (screenshots 12:51).
**Observed:** after picking "Estudio VIVO" the field fills with the full street address.
**Do:** when a Places result is chosen, store BOTH but **display the venue name** (`structured_formatting.main_text` / `name`) in the field; keep the full `formatted_address` + coords in the event doc for the map/deep-link. Free-text ("Use '…'") stays as typed.
**Accept:** the field shows "Estudio VIVO"; the address is still saved for maps.

### BUG 4 — Event length: 0 hours counts as 1 hour
**Screen:** `DurationWheelModal.js` (screenshot 12:53 — wheel on "0 hours / 5 min" but header preview reads "1h 5m").
**Root cause:** `formatDuration` is correct; the mismatch means `total` isn't reading the committed spinner value. On iOS, `total = dateToMinutes(iosDate)` where `iosDate` comes from the native countdown `onChange`. The 0-hour case is being read as 60 min — verify the native `onChange` Date is actually applied (not the seeded 180/3h default) and that `dateToMinutes` isn't inheriting an hour from the `2000,0,1` base date.
**Do:** derive `total` directly from the latest `onChange` value; ensure selecting 0 h / 5 m yields `total===5`. Add unit tests to `formatDuration` + the total computation: `5→"5 min"`, `65→"1h 5m"`, `0h5m→5`, `120→"2 hours"`. Enforce `Math.max(5,total)` (already there) but do NOT floor hours to 1.
**Accept:** "0 hours 5 min" shows "5 min" in the preview and saves `durationMinutes:5`.

### BUG 6 — Agenda: conflict + out-of-hours warnings, bottom padding
**Screen:** `AgendaScreen.js` + `CreateEventScreen` (instructor binding from round-3).
**Do:**
1. **Conflict check:** when creating/placing an event/class/session for an instructor, if it overlaps something already on **that instructor's** agenda, show a **warning** ("Camila already has 'Salsa L1' 8:30–9:30 — book anyway?") — warn, allow override.
2. **Out-of-hours warning:** if the slot falls outside the instructor's configured **working hours**, warn ("Outside Camila's working hours Mon–Sat 07:00–20:00 — continue?").
3. **Scroll bottom padding:** add `contentContainerStyle={{ paddingBottom: 96 }}` (or safe-area + tab bar height) so the last event near the end of the day stays fully visible above the tab bar / FAB.
**Accept:** conflicts and out-of-hours both warn (non-blocking); the last agenda item is never clipped.

### BUG 7 — Agenda Day grid overlaps the instructor filter
**Screen:** `AgendaScreen.js` Day view (screenshot 12:57 — the `All / You` chips and the `Event·Class·Private·Blocked` legend overlap the `07:00` grid).
**Do:** the timeline grid starts too high. Give the instructor-chips row + legend their own fixed header block and start the scrollable grid **below** it (add top margin/`paddingTop` equal to that header's height, or move the grid into a sibling below the header rather than overlapping). The "Full day" chip must not collide with the legend either.
**Accept:** chips + legend sit in a clean header; `07:00` and every row start below them; no overlap.

### BUG 5 + BUG 10 — Local/General membership exclusivity & purchase gating
**Screens:** membership creation (`MembershipPlans`/`MembershipsScreen` / hub Memberships), Members CRM (`BusinessMembers`), event/checkout membership purchase (event detail → "Memberships / Plans available", screenshot 1:01).
**Model (from round-2/round-3):** a member has `pricingTier: 'local' | 'general'` **per host** (a user can be Local for host A and General for host B — store it on the host's member record, `members/{bizId}/people/{memberId}.pricingTier`, NOT on the global user). Default **general**.
**Do:**
1. **Creating a membership/plan:** add an **audience** selector — **Local only · General only · Everyone (both)** (default Everyone). Persist `audience` on the plan.
2. **Purchase gating:** a plan with `audience:'local'` is **purchasable only if the buyer is tagged `local` by that host**. In the CRM Members list, the host toggles a member Local/General (already specced) — that unlock is what exposes local-only plans + local prices to that member.
3. **Checkout (event/membership):** the "buy membership" option appears **only** when the host has validated the buyer as local (for local-only plans) — otherwise hide it and charge the **General** price. Default everyone to **general** until the host flips them to **local** in the Members list.
4. Joining the host's community + being tagged local is the path that activates local pricing (per the user's flow).
**Accept:** host picks membership audience; local-only plans are invisible/blocked for general members; a member tagged Local by a host gets local prices + local-only plans for THAT host only.

### BUG 8 — Cancellation policy: host-cancel = host eats the fees
**Screens:** event detail Cancellation Policy text (screenshot 1:01) + the refund Cloud Function (`functions/index.js` / `functions/stripe/*`).
**Current text:** "If host cancels: 100% refund (minus fees)".
**Do:** change BOTH the copy and the refund logic: **if the host cancels the event, the attendee receives a 100% refund INCLUDING the app fee and the Stripe fee — the host absorbs those fees.** (Attendee-initiated cancellations keep the tiered "minus fees" policy.) Update i18n strings (en/es + all locales) and the refund computation so a host-cancel refunds gross, and the platform recovers/holds the fees from the host's balance/payout.
**Accept:** host-cancel → attendee sees "100% refund, including all fees" and is refunded gross; fees are charged to the host.

### BUG 9 — Translate: pick the target language, don't offer when already there
**Screen:** event detail "About" (screenshot 1:01 — "Translate to English" shown on English text).
**Do:** detect the source language of the content; if it already matches the user's language, **hide** the translate button. When shown, tapping opens a **language selector** (the app's supported languages from `04_I18N_SPEC`) instead of hardcoding "English". Respect the free-tier limit (1/mo → Plus) already specced.
**Accept:** no translate button on same-language content; tapping translate lets the user choose the target language.

---

## 🟡 P1/P2 — matching, profile, chat, car pool, dark mode

### BUG 11 — Match profile validation & visibility options
**Screen:** `matching` "Your match profile" (screenshot 1:06).
**Do:** (1) **Require at least one** "What are you looking for?" option before Save (block + inline hint). (2) In **"Who can see you?"** remove **"Hidden for now"** and **"Organizer only"** — leave `Everyone at the event · Same gender only · Opposite gender only`.
**Accept:** can't save with zero "looking for"; only the three visibility options remain.

### BUG 23 — Profile stats route to the right places
**Screen:** Profile (Hosting) (screenshot 12:46).
**Do:** (1) **Events** stat → the host's **hosted (past) events**, not followers. (2) **Rating** stat → the host's **reviews + rating detail** (reuse `RatingsOverview`). (3) **Members** stat → the **names of the host's community members** (people in their community groups). (4) **Add a "Followers"** entry to see who follows the host.
**Accept:** each stat deep-links to the correct list; Followers exists separately from Members.

### BUG 14 — Tap any user name → open their profile
**Screens:** event attendee list, and **any** list that shows a user name (rosters, members, chat participants, matches).
**Do:** make the name/avatar row a touchable that navigates to that user's public profile (a shared `UserProfileScreen` route by `uid`). Apply app-wide, not just one list.
**Accept:** tapping a person's name anywhere opens their profile.

### BUG 21 — Event chats: filter chats with / without messages
**Screen:** Messages → **Event chats**, currently `Upcoming / Past` (screenshot 1:19).
**Do:** add a filter for **"With messages" / "Without messages"** (alongside or under Upcoming/Past) so a host can find silent groups and send an activation message. Compute from each thread's message count / lastMessage.
**Accept:** host can filter to groups with no messages yet and message them.

### BUG 22 — Community chats: create + invite by code / email / phone
**Screen:** Messages → **Community chats**.
**Do:** (1) give the host a **"Create community chat"** action that also **generates a join code** to share with attendees. (2) The host can **search users by email or phone** to add them. (3) The invitee gets a **notification in Messages** (ties to BUG 13) and **accepts/declines** joining the host's community. This is the answer to "where does the host get the code" — it's created here, per community.
**Accept:** host creates a community + code, invites by code/email/phone; invitee accepts/declines from Messages; accepted members appear in the community (and CRM).

### BUG 19 — Car pool pickup = a real place on the map
**Screen:** group chat → "Offer a ride" sheet, **Pickup area** field (screenshot 1:17).
**Do:** replace the free-text "Pickup area" with a **place picker** (reuse the same Google Places "Search venue" sheet from Create Event). Store name + address + coords. The posted car-pool card's pickup becomes a **"Tap to open in maps"** location (like the location cards already in that chat).
**Accept:** driver searches/picks a pickup point; riders tap it to open Google Maps / the maps app.

### BUG 20 — Car pool: cancel, reject, reopen
**Screen:** car-pool card + "Offer a ride" flow (screenshots 1:17).
**Do:** after a rider is approved: (1) **both** driver and rider can **cancel** their part (rider leaves the seat; driver cancels the ride → notify riders). (2) driver can **reject/remove** an already-listed rider. (3) driver can **reopen** a car pool marked Closed/Full to **edit** the offer (seats, pickup, time). Update the card states (Open / Full / Closed / Cancelled) + notify affected riders (BUG 13 channels).
**Accept:** driver and riders can back out; driver can remove riders and reopen/edit a closed pool; everyone affected is notified.

### BUG 18 — Dark mode: white bar under the status bar on every screen (except Settings)
**Screens:** all top-level screens (screenshots 1:16 Profile, others). Only Settings is correct.
**Root cause:** `src/components/AppHeader.js` sets the header `backgroundColor:"transparent"` over `insets.top`, so the safe-area/status-bar strip shows the underlying (white) surface instead of the themed background. Settings uses a different wrapper that themes that area.
**Do:** ensure the **top safe-area inset area uses `colors.background`** on every screen — either set the screen container/`SafeAreaView` background to `colors.background` and let content extend under the status bar, or give `AppHeader`'s top padding block `backgroundColor: colors.background` instead of transparent. Match whatever Settings does (it's correct). Verify across Home, Wall, Events, Rentals, Profile, event detail, hub, agenda in dark mode.
**Accept:** no white strip at the top in dark mode on any screen; the status-bar area matches the screen background.

---

## Suggested commit order
P0 first: **15 (QR) → 13 (messaging/push) → 12 (keyboard) → 1 (MXN)**. 
Then host: **2, 17, 3, 4, 6, 7, 5+10, 8, 9**. 
Then the rest: **11, 23, 14, 21, 22, 19, 20, 18**.

## Global acceptance
All 22 screenshots/videos resolved; no regressions in round-1/2/3 work; EN/ES parity for every new/changed string; app boots clean; jest green.
