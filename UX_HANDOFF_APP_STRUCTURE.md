# Kinlo — App Structure Handoff (for UX/UI Expert)

> Purpose of this document: give a UX/UI specialist a complete map of the app —
> every screen, every feature, what each contains, how they connect — so they can
> help us restructure the information architecture and navigation into the best
> possible experience. It ends with **open questions** and **considerations** we
> need their input on.
>
> Prepared: 2026-07-04 · Branch: `main` · ~65 screens, 31 services, 35 components.

---

## 1. What Kinlo is

Kinlo is a **community + events** mobile app (Expo / React Native, iOS-first).
Local hosts create experiences (events); attendees discover, pay for, and join
them. On top of events there is a **social layer** (follow / feed / posts / DMs),
a privacy-first **Community Matching** feature (meet people who were at the same
event), a **membership** system (hosts sell class packs / passes), and a
**vehicle rental** marketplace. Monetization is via platform fees + two
subscriptions (Kinlo Pro for hosts, Kinlo Plus for attendees).

**Stack:** Expo SDK / React Native · Firebase (Auth, Firestore, Storage, Cloud
Functions) · Stripe Connect + Mercado Pago for payments · Lucide icons.

**Design language today:** two themes — **WARMTH** (Clean / light, the default;
purple `#7C3AED` accent) and **AURORA** (dark). A central `<Icon>` component
(Lucide) is the icon convention. `ProfileScreen` is the current visual reference
(section labels 11px uppercase, grouped cards, 2×2 tool grid, pill buttons).

---

## 2. User roles

| Role | How they get it | What they can do |
|------|-----------------|------------------|
| **Attendee** (`role: user`) | Default on signup | Discover/join events, social layer, matching, memberships, rentals |
| **Free host** (`role: host`, `hostConfig.type: free`) | Request → admin approves → picks "free" | Create free events + host tools (no payments) |
| **Paid host** (`role: host`, `hostConfig.type: paid` + Stripe active) | Same, picks "paid" + connects Stripe | Paid events, sell memberships, rent out fleet, Kinlo Pro |
| **Admin** (`role: admin`) | Manual | Approve host requests, moderation, tune pricing |

Subscriptions cut across roles: **Kinlo Pro** (host, unlocks Community Matching +
AI tools) and **Kinlo Plus** (attendee, unlocks unlimited matching likes).

---

## 3. ⚠️ Current navigation model — the #1 thing to review

**There is NO bottom tab bar, no drawer, no persistent navigation.** The entire
app is a **single flat stack** (`createNativeStackNavigator`) with ~65 routes.
The user enters at `Home` and everything is reached by tapping buttons/cards that
`navigate()` deeper into the stack.

**Consequence — several major features have weak or NO entry point:**

| Screen | Reachable from | Problem |
|--------|----------------|---------|
| `Feed` (social feed) | **nothing** | The whole Instagram-style feed is currently unreachable in-app |
| `Notifications` | **nothing** | No bell/entry found |
| `MyEvents` (attendee's joined events) | **nothing** | Orphaned |
| `Conversations` | **nothing** | Orphaned |
| `Connect` (people at an event) | only `EventDetail` | Buried |
| `RentalHub` | only `EventDetail`, `MyRentals` | Buried; unrelated to a specific event |
| Community Matching entry | via event flow / `MatchingEntryCard` | Only in event context |

`HomeScreen` today only links to: **SearchEvents, EventDetail, Profile,
AdminDashboard**. This is the core IA problem we want help solving: **how should
these features surface** (tab bar? hub? contextual?).

**Onboarding gate** (runs in `AppNavigator` on auth state, sequential):
`Login/Signup → EmailVerification → Legal (accept terms) → ProfileSetup →
HostTypeSelection (if approved host) → Home`.

---

## 4. Feature domains & their screens

### 4.1 Auth & Onboarding
| Screen | Contains |
|--------|----------|
| `WelcomeScreen` | Intro / entry splash |
| `LoginScreen` | Email+password, Google, Apple sign-in; password visibility toggle; reset password |
| `SignupScreen` | Create account (email, password + confirm) |
| `LegalScreen` | Accept terms/privacy before proceeding |
| `EmailVerificationScreen` | Prompt to verify email |
| `ProfileSetupScreen` | Full name, avatar, city, phone, over-18 |
| `RequestHostScreen` | Apply to become a host (motivation, experience, event ideas) |
| `HostTypeSelectionScreen` | After approval: choose Free / Paid (Stripe or Mercado Pago) host |

### 4.2 Discovery & Events (attendee side)
| Screen | Contains |
|--------|----------|
| `HomeScreen` | Greeting, "rate your experiences", quick actions, featured events, browse by community/category |
| `SearchEventsScreen` | Search + filters (language, event type, date, price) |
| `EventDetailScreen` | Event info, host, attendees ("friends going"), checkout entry, chat, Connect, matching opt-in, carpool |
| `HowToAttendScreen` | Explainer on attending / paying |
| `MyEventsScreen` | Events the attendee has joined *(no entry point today)* |
| `EventCheckInScreen` | Attendee's QR check-in code (`bvchk:{eventId}:{userId}`) |
| `EventChatScreen` | Event group chat (text, polls, carpool offers) |

### 4.3 Events (host side)
| Screen | Contains |
|--------|----------|
| `CreateEventScreen` | Create event: details, category, place (Google Places), date/recurrence, price, images, Pro features |
| `EditEventScreen` | Edit an existing event |
| `EventRosterScreen` | Attendee roster for an event |
| `CheckInScannerScreen` | Host scans attendee QR codes to check them in |
| `PromoteEventScreen` | Pay to feature/promote an event (platform keeps 100% of fee) |

### 4.4 Profile & Personality
| Screen | Contains |
|--------|----------|
| `ProfileScreen` | Own profile: avatar/edit, stats, verified-host badge, Kinlo Pro banner, **Host Tools 2×2 grid** (Payments, Plans, Analytics, Groups, My Fleet), Personality (Big Five), Settings (memberships, appearance/theme, safety center, log out, delete account) |
| `UserProfileScreen` | Public view of any user: avatar, name, city, followers/following, Follow button, their posts |
| `PersonalityQuizScreen` / `PersonalityResultsScreen` / `PersonalityTestScreen` | Big Five personality quiz + results (feeds matching compatibility) |

### 4.5 Social layer (Instagram-style)
| Screen | Contains |
|--------|----------|
| `FeedScreen` | Posts from people you follow + yourself; empty-state suggests people; entry to compose + DMs *(no entry point today)* |
| `CreatePostScreen` | Compose post (text + photos) |
| `PostDetailScreen` | A post with its comment thread |
| `FollowListScreen` | Followers / following list |
| `DMListScreen` / `DMChatScreen` | 1:1 direct-message inbox + thread |
| `ConversationsScreen` | Conversations list *(no entry point today)* |
| `ConnectScreen` | People at a given event → tap to profile |
| `ChatScreen` | Generic chat screen (legacy?) |

### 4.6 Community Matching (privacy-first, Kinlo Pro/Plus) — flow A1→E4
Post-event, opt-in, consent-gated attendee matching, ranked by Big Five.
| Screen | Stage | Contains |
|--------|-------|----------|
| `MatchOptInScreen` | A1 | Invite to opt in (opens after event) |
| `MatchConsentScreen` | A2 | 4 consent points before a match profile exists |
| `MatchProfileScreen` | A3/A4 | Bio, interests, what you're looking for, icebreaker, visibility |
| `MatchingLockedScreen` | B2 | Countdown + blurred teaser until window opens |
| `MatchGridScreen` | C1 | Grid of checked-in attendees, ranked by compatibility |
| `MatchPersonScreen` | C2 | Someone's profile + Like/Pass + safety actions |
| `MatchChatScreen` | — | 1:1 chat between matched attendees (if host enabled) |
| `PeopleYouMetScreen` | D1 | Post-close retention: your matches, back into chat |
| `HostMatchingControlsScreen` | D2 | Host configures match types, window, messaging, cap (Pro) |
| `HostMatchAnalyticsScreen` | D3 | Aggregate-only analytics |
| `MatchVisibilityScreen` | D4 | Change visibility / delete matching data / leave |
| `PlusPaywallScreen` → `PlusCheckoutScreen` → `PlusActivatedScreen` | C4/E3/E4 | Attendee hits like-cap → upgrade to Kinlo Plus |
| `ProUpsellScreen` → `ProCheckoutScreen` | E1/E2 | Non-Pro host enabling matching → upgrade to Kinlo Pro |

### 4.7 Host business tools
| Screen | Contains |
|--------|----------|
| `StripeConnectScreen` | Connect/refresh Stripe payout account |
| `HostAnalyticsScreen` → `AnalyticsDetailScreen` | Revenue, members, per-event tiles |
| `FinanceScreen` | Finance trends, revenue per event |
| `HostCRMScreen` | Attendees across events; flags "at risk" (broke streak) vs "regulars" |
| `RatingsOverviewScreen` → `RatingDetailScreen` | Host reviews + AI coaching insights (Pro) |
| `HostGroupsScreen` → `GroupChatScreen` / `GroupManageScreen` | WhatsApp-style persistent groups for frequent attendees (+ polls via `PollVotesScreen`) |

### 4.8 Memberships (host sells passes / class packs)
| Screen | Contains |
|--------|----------|
| `MembershipPlansScreen` | Host CRUD of membership plans (credits/validity/price) — **now gated to hosts who can receive payments** |
| `HostMembershipsScreen` | Public list of a host's plans |
| `MembershipSaleScreen` / `MembershipCheckoutScreen` | Buy a membership |
| `MyMembershipsScreen` | Attendee's active memberships |

### 4.9 Rentals marketplace (vehicles / scooters — "model A")
| Screen | Contains |
|--------|----------|
| `RentalHubScreen` | Browse available vehicles by city/type (no map by design) |
| `VehicleDetailScreen` | Vehicle info, price, availability |
| `RentalCheckoutScreen` | Reserve + deposit (Stripe); writes booked date range |
| `ActiveRentalScreen` | Active rental (timer, return) |
| `MyRentalsScreen` | Renter's rentals |
| `MyFleetScreen` | Host's fleet: publish/manage vehicles, status (available/rented/maintenance) |
| `PublishVehicleScreen` | Add a vehicle to the fleet |
| `VehicleBookingsScreen` | Owner's reservation tracker (which vehicle booked which dates) |

### 4.10 Subscriptions / paywalls
| Screen | Contains |
|--------|----------|
| `KinloProScreen` | Kinlo Pro marketing/benefits (host) |
| `ProUpsellScreen` / `ProCheckoutScreen` | Pro upsell + Stripe checkout |
| `PlusPaywallScreen` / `PlusCheckoutScreen` / `PlusActivatedScreen` | Plus paywall + checkout + success (attendee) |

### 4.11 Safety, moderation & admin
| Screen | Contains |
|--------|----------|
| `SafetyCenterScreen` | SOS (call 911), report a user, contact safety team, safety tips |
| `ReportScreen` | Report a user/event with reason + details |
| `NotificationsScreen` | In-app notifications *(no entry point today)* |
| `AdminDashboardScreen` | Approve host requests, moderation, pricing knobs |

---

## 5. Monetization summary

- **Event fees** — attendee pays event price + Kinlo service fee (Stripe Connect / Mercado Pago).
- **Promotions** — hosts pay to feature events (platform keeps 100%).
- **Memberships** — hosts sell passes; Kinlo takes commission.
- **Rentals** — hosts rent vehicles; Kinlo takes commission.
- **Kinlo Pro** (host subscription) — Community Matching, AI review coaching, analytics.
- **Kinlo Plus** (attendee subscription) — unlimited matching likes.

---

## 6. Known UX rough edges (found while building)

1. **No persistent navigation** (§3) — biggest issue.
2. **Orphaned screens** — Feed, Notifications, MyEvents, Conversations have no in-app entry.
3. **Overloaded ProfileScreen** — it's the de-facto hub (host tools, personality, settings, safety) because there's nowhere else.
4. **Feature-rich but flat** — 65 screens with no grouping the user can perceive.
5. **Two payment processors** (Stripe + Mercado Pago) — flows differ by host.
6. **Mixed legacy styling** — a few old screens (Report, older ones) predate the theme system and were recently migrated; consistency is still in progress.
7. **Conditional visibility** — many entries appear only for certain roles/states (paid host, Pro, checked-in), which can make the app feel different per user.

---

## 7. Questions for you (UX/UI expert)

**Information architecture & navigation**
1. Should we introduce a **bottom tab bar**? If so, what are the primary tabs? (Candidates: Home/Discover, Feed/Social, Matching, Chats, Profile — but that's 5+ and we also have Rentals, Memberships, Host tools.)
2. How do we reconcile **two audiences** (attendees vs hosts) in one nav — a mode switch, a "host dashboard" section, or role-adaptive tabs?
3. Where should **secondary marketplaces** (Rentals, Memberships) live — a tab, a "Services" hub, or contextual only?

**Feature surfacing**
4. The **social layer** (Feed/Posts/DMs) is currently unreachable — is it a core pillar (its own tab) or a supporting feature? 
5. **Community Matching** is event-scoped today. Should there be a global matching entry, or keep it strictly per-event?
6. **Notifications** — dedicated screen + bell in a global header, or fold into a tab?

**Onboarding & roles**
7. The host path (request → approve → type selection → Stripe) is long. How much should a new user see up front vs. progressive disclosure?
8. Should attendees see host/Pro features at all (aspirational upsell) or be hidden until relevant?

**Profile**
9. `ProfileScreen` is overloaded. Split into Profile (public identity) vs. Settings vs. Host Dashboard?

**Visual system**
10. Keep the dual WARMTH/AURORA theme? Is the current ProfileScreen visual language the right north star to standardize on?
11. Any component-level system you'd want (spacing scale, type ramp, button variants) before we scale the redesign?

---

## 8. Considerations / constraints

- **iOS-first**, Expo managed workflow. Some native capabilities (maps) intentionally omitted for now (rentals has no map by design).
- **Firestore-driven**: most screens react to live data; empty/loading/error states matter.
- **Privacy is a hard requirement** for Community Matching (consent-gated, opt-in, aggregate-only host analytics) — any redesign must preserve the consent flow.
- **Monetization gates** must stay legible: users shouldn't hit a paywall without understanding why (e.g., matching like-cap → Plus).
- **Central `<Icon>` + theme tokens** already exist — a redesign can lean on them rather than starting the design system from zero.
- We can restructure navigation without touching business logic — screens are mostly self-contained and registered in one place (`src/navigation/AppNavigator.js`).

---

## 9. Where to look in code (for reference)

- Navigation & onboarding gate: `src/navigation/AppNavigator.js`
- Design tokens / themes: `src/constants/theme-tokens.js`, `src/contexts/ThemeContext.js`
- Icon convention: `src/components/Icon.js`
- Reference screen (current visual language): `src/screens/ProfileScreen.js`
- Feature logic: `src/services/*.js` (each file headers its purpose)
