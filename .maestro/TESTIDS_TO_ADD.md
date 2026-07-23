# testIDs to add for the Maestro E2E flows

These flows were authored against the **actual** screens in `origin/main`. Every
`testID` a flow references that does **not** already exist in the app is listed
below, grouped by flow, with the exact file/component to add it to. Reused
existing testIDs (e.g. `tab-events`, `header-messages`, `discover-bar`,
`manage-create-event`, `inbox-find-people`, `send-button`, `profile-mode-*`,
`profile-back`) are **not** listed here.

Convention observed in the app: kebab-case string literals
(`testID="manage-create-event"`) or templated (`testID={\`tick-${...}\`}`).
For list rows, add an **index-based** id (`\`...-${index}\``) and the flow taps
`...-0`.

---

## ⚠️ Stale ids in the EXISTING flows (fix separately)

While matching real labels I found the current `.maestro/*.yaml` reference three
ids that **do not exist anywhere in the code**. These flows are passing by luck,
skipping (optional), or silently failing on those steps:

| Stale id (used by) | Reality in code | Fix |
|---|---|---|
| `header-notifications` (`e2e-attendee.yaml`, `p0-smoke-tabs.yaml`) | AppHeader has only `header-messages`; notifications are nested **inside** the Messages/Inbox hub (`InboxScreen` → "Notifications" row). Code comment: "BUG 13". | Either add a dedicated bell with `testID="header-notifications"` to `src/components/AppHeader.js`, or update those flows to go `header-messages` → tap "Notifications". |
| `mode-hosting` / `mode-attending` (`p0-smoke-tabs.yaml`) | The single mode control is on **ProfileScreen** with ids `profile-mode-hosting` / `profile-mode-attending` (rendered only when `canHostView`). | Update those flows to switch mode via `header-profile` → `profile-mode-hosting`/`-attending` → `profile-back` (as the new flows here do). |
| `tab-rentals`, `tab-profile` (`e2e-attendee.yaml`) | Tab ids are generated as `tab-${route.name.replace("Tab","").toLowerCase()}` → **`tab-home`, `tab-wall`, `tab-events`, `tab-services`, `tab-business`**. The 4th tab is Services (Marketplace), not Rentals; Profile is a pushed Stack screen reached via `header-profile`, not a tab. | Use the real ids; there is no Rentals/Profile tab. |

My new flows deliberately use only the real ids above.

---

## e2e-create-event.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `create-event-title` | `src/screens/CreateEventScreen.js` — Title `<TextInput>` (~L1130) | Event title field |
| `create-event-desc` | `src/screens/CreateEventScreen.js` — Description `<TextInput>` (~L1160) | Event description field |
| `create-event-max-people` | `src/screens/CreateEventScreen.js` — Max People `<TextInput>` (~L1667) | Capacity field |
| `create-event-submit` | `src/screens/CreateEventScreen.js` — Create `<TouchableOpacity>` (~L1782) | Publish / "Create Event" CTA |

Venue is intentionally driven by text (the shared `PlaceAutocomplete` modal:
tap the "Search a place…" trigger → type → tap the "Use "…"" free-text row).
Optional hardening: forward a `testID` prop through
`src/components/PlaceAutocomplete.js` (e.g. `create-event-venue-field` on the
trigger `TouchableOpacity` ~L181) so the field can be tapped by id.

## e2e-join-event.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `event-search-result` | `src/screens/SearchEventsScreen.js` — local `EventCard` `<TouchableOpacity>` (~L358) | An event result card (flow taps the first). Add the same id to `src/components/EventCard.js` (~L26) if you want it reused everywhere. |
| `checkout-card-field` *(paid variant)* | `src/screens/payment/CheckoutScreen.js` — Stripe `<CardField>` (~L420) | Inline card input (see note below) |
| `checkout-pay-button` *(paid variant)* | `src/screens/payment/CheckoutScreen.js` — Pay `<TouchableOpacity>` (~L448) | Confirm-payment CTA |

**Stripe reality check:** the checkout is **not** a system webview. It uses
Stripe's inline native `<CardField>` (`@stripe/stripe-react-native`), whose
number placeholder is already `4242 4242 4242 4242`. Maestro cannot reliably
fill the fused native CardField by id/text, so the paid path is documented (not
executed) up to the Checkout screen; the 4242 test card would be typed into the
CardField there.

## e2e-wall-post-follow.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `wall-compose-fab` | `src/screens/FeedScreen.js` — the "+" `<TouchableOpacity>` in the header (~L280) | Opens CreatePost |
| `create-post-input` | `src/screens/CreatePostScreen.js` — body `<TextInput>` (~L171) | Post composer text field |
| `create-post-submit` | `src/screens/CreatePostScreen.js` — Post `<TouchableOpacity>` (~L121) | Publish post |
| `user-search-result` | `src/components/UserSearchField.js` — result row `<TouchableOpacity>` (~L64) | First search result (index-based `user-search-result-${index}` recommended) |
| `profile-follow-btn` | `src/screens/UserProfileScreen.js` — Follow `<TouchableOpacity>` (~L180) | Follow/Unfollow toggle (avoids the ambiguous "Follow"/"Following" text) |

## e2e-dm-send.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `inbox-dm-row-0` | `src/screens/InboxScreen.js` — DM `renderItem` `<TouchableOpacity>` (~L244) | First DM thread row. Add index-based `\`inbox-dm-row-${index}\``. |
| `dm-composer-input` | `src/screens/DMChatScreen.js` — message `<TextInput>` (~L116) | DM text field |
| `dm-send-button` | `src/screens/DMChatScreen.js` — send `<TouchableOpacity>` (~L124) | DM send button (DMChat has no `send-button`; only GroupChat does) |

## e2e-notifications.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `inbox-notifications-row` | `src/screens/InboxScreen.js` — Notifications `<ListRow>` (~L209). `ListRow` already accepts a `testID` prop — just pass it. | Notifications entry (flow currently taps the "Notifications" text; id makes it robust) |
| `notification-card-0` | `src/screens/NotificationsScreen.js` — `NotificationCard` `<TouchableOpacity>` (~L403) | A notification item. Add index-based `\`notification-card-${index}\``. |

The "open one" step is `optional` because the list may be empty
("You're all caught up!").

## e2e-carpool.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `event-chat-row-0` | `src/screens/EventChatsScreen.js` — `renderItem` `<TouchableOpacity>` (~L200) | First event-chat row (index-based `\`event-chat-row-${index}\``) |

The carpool "Request a seat" button is tapped by text
(`carpoolCard.requestSeat`) inside `src/components/CarpoolCard.js`.

## e2e-chat-poll.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `event-chat-row-0` | `src/screens/EventChatsScreen.js` (~L200) | Shared with e2e-carpool |
| `event-chat-poll-btn` | `src/screens/EventChatScreen.js` — host-only chart `<TouchableOpacity>` (~L963) | Opens the poll composer |
| `poll-question-input` | `src/screens/EventChatScreen.js` — poll modal question `<TextInput>` (~L1022) | Poll question |
| `poll-option-0`, `poll-option-1` | `src/screens/EventChatScreen.js` — option `<TextInput>` map (~L1030) | Poll options (index-based `\`poll-option-${i}\``) |
| `poll-create-submit` | `src/screens/EventChatScreen.js` — "Create poll" `<TouchableOpacity>` (~L1066) | Submit poll |

Voting is done by tapping the option's own text on the rendered `PollCard`.
(`GroupChatScreen` has the identical host-only poll flow — the same ids can be
mirrored there: it's `setPollVisible` chart icon ~L368 + poll modal ~L419.)

---

## Seed data each flow needs

| Flow | Seed required |
|---|---|
| `e2e-create-event` | Host-capable, verified account. No pre-seeded content (it creates the event). |
| `e2e-join-event` | At least one **FREE, upcoming, un-joined** event discoverable in Search. Paid variant (documented) needs a seeded **PAID** event. |
| `e2e-wall-post-follow` | At least one **other user** findable via Find people (matches @handle or name). |
| `e2e-dm-send` | At least one **existing 1:1 DM thread** for the test user (the header path only *opens* threads; a brand-new DM starts from ConnectScreen / a match, not the inbox). |
| `e2e-notifications` | Optional: ≥1 notification, otherwise the "open one" step is skipped. |
| `e2e-carpool` | An event chat the user can open that already contains a **carpool offered by another user** with a free seat (you can't request a seat on your own ride). Seed by offering a ride from a 2nd account. |
| `e2e-chat-poll` | The test user must be the **HOST** of the event whose chat is opened (poll button is host-only). Easiest: run `e2e-create-event` first, then open that event's chat. |

## Notes / limitations

- No journey was fully un-authorable — all 7 exist in code. The **carpool** and
  **poll** creators live inside the **event chat** (message cards), not on
  EventDetail; the flows reflect that.
- Poll creation is **host-only** in both EventChat and GroupChat, so
  `e2e-chat-poll` targets a hosted event's chat.
- `e2e-join-event` executes the **free** path end-to-end and documents the
  **paid** path up to the Stripe `CardField` (inline native component, not a
  webview).

<!-- ===================================================================== -->
<!-- BATCH 2 — money + auth journeys (APPENDED; batch 1 above is unchanged) -->
<!-- ===================================================================== -->

# Batch 2 — money + auth flows

Four new flows: `e2e-email-gate`, `e2e-rental-pay`, `e2e-service-pay`,
`e2e-membership-redeem`. Same convention as batch 1 (kebab-case literals;
index-based ids for list rows, flow taps `…-0`). Reused existing ids
(`tab-home`, `tab-events`, `tab-services`, `header-profile`, `profile-mode-*`,
`profile-back`, `discover-bar`, `event-search-result`, `login-email`,
`login-password`) are **not** relisted.

## ⚠️ e2e-email-gate — the polished EmailGate UI (Diseño 1) does NOT exist yet

**Read this before relying on the flow.** There is currently **no** in-app,
per-action "EmailGate" (the sheet you'd show when an unverified user taps
Create event / Join / Pay). I grepped `src/` for `email_not_verified` /
`EmailGate` / any client catch of the callable error — **zero** hits. What
exists today is an **auth-boundary** gate only:

| Where | File / line | Behavior today |
|---|---|---|
| Signup | `src/screens/SignupScreen.js` ~L128 | Calls `signOut(auth)` right after account creation → a new user is never in the app unverified. |
| Login | `src/navigation/AppNavigator.js` ~L398 | Auth listener: `if (!user.emailVerified) { setShowVerificationModal(true); navigateToRoute("Login"); auth.signOut(); }` |
| Modal | `src/navigation/AppNavigator.js` ~L911 | `<SuccessModal title="Verify Your Email" …>` — hardcoded strings (no testID). |
| Server backstop | `functions/index.js` (createEvent ~L1261, joinEvent ~L2275, createEventPaymentIntent ~L2410, +~13 more) | Throws `permission-denied` / `"email_not_verified"` — never surfaced with a friendly UI because the login bounce keeps the user out. |

The flow therefore tests the gate that **actually exists** (unverified login is
bounced with the modal and never reaches `tab-home`) and **documents** the
"continue after verifying" half (needs an out-of-band email-link click).

**testIDs for a REAL EmailGate UI (only if/when Diseño 1 is built):**

| testID | File / component to add it to | Element |
|---|---|---|
| `email-gate-sheet` | new `src/components/EmailGate.js` (or `src/screens/EmailVerificationScreen.js`, currently a stub ~L7) | The in-app gate container shown on a gated action |
| `email-gate-resend` | same component | "Resend verification email" CTA |
| `email-gate-dismiss` | same component | Close / "I'll verify later" |
| `verify-email-modal` | `src/navigation/AppNavigator.js` ~L907 `<SuccessModal>` | Pass a `testID` so the login-bounce modal is assertable by id instead of the hardcoded "Verify Your Email" text |

Uses only existing `login-email` / `login-password`. **No** new testID is
required to run the flow as written.

## e2e-rental-pay.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `rental-vehicle-card-0` | `src/screens/RentalHubScreen.js` — vehicle `<TouchableOpacity>` in the `vehicles.map` (~L217) | A vehicle result card. Add index-based `` `rental-vehicle-card-${index}` `` (flow taps `-0`). |
| `rental-card-field` *(documented pay step)* | `src/screens/RentalCheckoutScreen.js` — Stripe `<CardField>` (~L157) | Inline native card input (can't be filled by Maestro — see note) |
| `rental-pay-button` *(documented pay step)* | `src/screens/RentalCheckoutScreen.js` — Pay `<TouchableOpacity>` (~L171) | "Pay …" / "Reserve for free" CTA |

The Rentals hub is reached by **text** (`marketplace.vertical.rentals` = "Rentals"
tile on `MarketplaceExploreScreen`, which `navigation.navigate("RentalHub")`),
and "Rent now" is tapped by text (`vehicleDetail.rentNow`) — no testID needed there.

## e2e-service-pay.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `service-listing-card-0` | `src/screens/MarketplaceExploreScreen.js` — listing `<TouchableOpacity>` in the `filtered.map` (~L189) | A marketplace listing card. Add index-based `` `service-listing-card-${index}` ``. |
| `service-date-field` *(optional hardening)* | `src/components/DateField.js` — forward a `testID` prop to the trigger `<TouchableOpacity>` (~L57), then pass it from `src/screens/ServiceCheckoutScreen.js` `<DateField>` (~L140) | The date picker field (its placeholder "Pick a date" collides with the section label of the same text) |
| `service-card-field` *(documented pay step)* | `src/screens/ServiceCheckoutScreen.js` — `<CardField>` (~L173) | Inline native card input |
| `service-pay-button` *(documented pay step)* | `src/screens/ServiceCheckoutScreen.js` — Pay `<TouchableOpacity>` (~L183) | "Confirm & pay …" CTA |

CTA "Book a slot" is tapped by text (`marketplace.detail.bookSlot`); time slots
are tapped by their own text ("10:00"). The native date **spinner**
(`DateTimePicker`) is environment-specific — tapping the field then "Done"
commits today's date; those steps are `optional` in the flow.

## e2e-membership-redeem.yaml

| testID | File / component to add it to | Element |
|---|---|---|
| `howtoattend-use-credit` | `src/screens/HowToAttendScreen.js` — the shared `Option` `<TouchableOpacity>` (~L111); pass a `testID` prop from the "Use 1 class credit" option (~L169) | Reserve-with-credit option (drives `reserveMembershipCredit`) |
| `howtoattend-get-membership` | same `Option` component, "Get a membership" instance (~L184) | Opens `HostMemberships` (buy path) |
| `hostmemberships-buy-0` *(documented buy step)* | `src/screens/HostMembershipsScreen.js` — Buy `<TouchableOpacity>` in `plans.map` (~L141) | "Buy" on a plan card → `MembershipCheckout`. Index-based `` `hostmemberships-buy-${index}` ``. |
| `membership-card-field` *(documented buy step)* | `src/screens/MembershipCheckoutScreen.js` — `<CardField>` (~L156) | Inline native card input |
| `membership-pay-button` *(documented buy step)* | `src/screens/MembershipCheckoutScreen.js` — Pay `<TouchableOpacity>` (~L168) | "Pay …" CTA |

The HowToAttend options render text today, so the flow taps by text with the new
ids as the primary (optional) selector. Reuses `event-search-result`.

**Host-only, NOT authorable from the attendee session:**
`redeemMembershipCredit(reservationId)` (`src/services/membershipService.js`
~L342) is called by the **host** at check-in — so the redeem step is documented,
not executed. `reserveMembershipCredit` (~L327) is the user-drivable half and is
executed by this flow.

---

## Seed data — batch 2

| Flow | Seed required |
|---|---|
| `e2e-email-gate` | A real **UNVERIFIED** account (created, email link never clicked); pass `KINLO_UNVERIFIED_EMAIL` / `KINLO_UNVERIFIED_PASSWORD` via `-e`. Verified continuation is documented (needs the out-of-band email click). |
| `e2e-rental-pay` | ≥1 **available** vehicle with **`pricePerDayCentavos > 0`** discoverable in the Rentals hub (a paid vehicle is required for the Stripe `CardField` to render; a free vehicle skips the card). |
| `e2e-service-pay` | ≥1 **paid, slot-based** marketplace listing (`bookingMode !== "quote"`, `priceCents > 0`, **no** `planPackageId`) as the **first** Services card, so the CTA is "Book a slot" and checkout shows the `CardField`. |
| `e2e-membership-redeem` | A host selling an **active** class-credit plan; the test user **holds an active membership** (credits remaining) with that host; an upcoming event by that host with `acceptsMembership !== false`, discoverable as the first search result. Without the held membership, HowToAttend shows "Get a membership" (documented buy branch) instead of "Use 1 class credit". |

## Notes / limitations — batch 2

- **No screen was fabricated.** Every screen referenced exists in `origin/main`
  (RentalHub, VehicleDetail, RentalCheckout, MarketplaceExplore, ServiceDetail,
  ServiceCheckout, HowToAttend, HostMemberships, MembershipCheckout, plus the
  Login/Signup/AppNavigator auth gate).
- **What could NOT be fully executed (documented instead):**
  - Every Stripe charge — the checkout uses the **inline native `<CardField>`**
    (`@stripe/stripe-react-native`), which Maestro can't reliably fill. All three
    pay flows drive **up to** the Checkout screen and document the 4242 step,
    identical to batch 1's `e2e-join-event` paid path.
  - `e2e-email-gate`'s "continue after verifying" — needs an out-of-band email
    link click; and the polished per-action EmailGate UI (Diseño 1) is **not
    built** (see the ⚠️ section above).
  - `e2e-membership-redeem`'s **buy** (Stripe card) and **host-side redeem**
    (`redeemMembershipCredit` is host-only) — documented. The executed heart is
    `reserveMembershipCredit` via "Use 1 class credit".
- **`Checkout` header collisions:** Event, Rental, and Membership checkouts all
  use the title "Checkout". The flows disambiguate with a unique in-body string
  (e.g. rental asserts "Charged now") rather than the shared header title.
