# Prompt for Claude Design — Redesign Kinlo into a world-class app

> Paste this whole document into Claude Design. It is self-contained: it includes
> the complete screen/feature map, the current problems, and exactly what we need
> you to deliver. Goal: make Kinlo **perfect** — coherent information
> architecture, effortless navigation, and a polished, consistent visual system.

---

## Your role & mission

You are **Claude Design**, acting as a **principal product designer + design-systems
lead**. Your mission is to take Kinlo — a feature-rich but structurally flat
events + community app — and redesign its **information architecture,
navigation, key flows, and visual system** into something best-in-class.

Work like a senior designer would:
- **Think in systems**, not screen-by-screen. Start from IA and navigation, then
  flows, then components, then pixels.
- **Diagnose before prescribing.** Call out what's wrong and *why* it hurts users.
- **Make opinionated recommendations** with rationale and trade-offs — don't just
  list options. We want your best judgment.
- **Ask targeted questions** when a decision genuinely depends on our intent
  (business priority, target user), but don't stall on things you can reason
  about. Default to a strong recommendation.
- **Produce concrete artifacts** we can act on: navigation trees, ASCII
  wireframes/layout specs, component inventories, a design-token/system proposal,
  and a prioritized rollout plan.

We are engineers, not designers. Treat us as the client. "Perfect" means: a new
user understands the app in seconds, every feature is discoverable, the visual
language is consistent, and monetization feels natural rather than intrusive.

---

## 1. What Kinlo is

A **community + events** mobile app (Expo / React Native, **iOS-first**). Local
hosts create experiences (events); attendees discover, pay for, and join them.
Layered on top:
- **Social layer** — follow / feed / posts / 1:1 DMs.
- **Community Matching** — privacy-first, opt-in, post-event "meet people who were
  there," ranked by a Big Five personality quiz (a paid feature).
- **Memberships** — hosts sell class packs / passes.
- **Rentals** — a vehicle (scooter) rental marketplace.

**Stack:** Firebase (Auth, Firestore, Storage, Cloud Functions) · Stripe Connect +
Mercado Pago payments · Lucide icons · ~65 screens.

**Roles:** Attendee · Free host · Paid host (Stripe-connected) · Admin. Two
subscriptions cut across roles: **Kinlo Pro** (host — unlocks Community Matching +
AI tools) and **Kinlo Plus** (attendee — unlimited matching likes).

**Current visual language:** two themes — **WARMTH** (Clean / light, default;
purple `#7C3AED` accent) and **AURORA** (dark). A central `<Icon>` (Lucide)
component. `ProfileScreen` is today's de-facto visual reference (section labels
11px uppercase, grouped cards, 2×2 tool grid, pill buttons). You may keep,
evolve, or replace this — tell us what's right.

---

## 2. ⚠️ The core problem — navigation & IA

**There is no bottom tab bar, no drawer, no persistent navigation.** The whole
app is a **single flat stack of ~65 screens**. The user lands on `Home` and
reaches everything by tapping deeper.

Direct consequences:
- **Orphaned screens with NO entry point:** the entire **social Feed**,
  **Notifications**, **MyEvents** (joined events), and **Conversations**.
- **Buried features:** "Connect" (people at an event) and the **Rentals hub** are
  only reachable from inside an event.
- `HomeScreen` links to just 4 destinations: SearchEvents, EventDetail, Profile,
  AdminDashboard.
- **`ProfileScreen` is overloaded** — it's the de-facto hub (host tools,
  personality, settings, safety) because there's nowhere else to put things.

**This is the #1 thing to fix.** How should ~10 feature domains surface for two
different audiences (attendees vs hosts) in a way that feels simple?

---

## 3. Complete screen & feature map

### Auth & Onboarding (sequential gate: Login → EmailVerify → Legal → ProfileSetup → HostTypeSelection → Home)
- **WelcomeScreen** — intro/splash.
- **LoginScreen** — email+password, Google, Apple; password visibility toggle; reset.
- **SignupScreen** — create account (email, password + confirm).
- **LegalScreen** — accept terms/privacy.
- **EmailVerificationScreen** — verify email prompt.
- **ProfileSetupScreen** — name, avatar, city, phone, over-18.
- **RequestHostScreen** — apply to host (motivation, experience, ideas).
- **HostTypeSelectionScreen** — choose Free / Paid (Stripe or Mercado Pago).

### Discovery & Events — attendee
- **HomeScreen** — greeting, "rate your experiences," quick actions, featured events, browse by community/category.
- **SearchEventsScreen** — search + filters (language, type, date, price).
- **EventDetailScreen** — event info, host, attendees, checkout, chat, Connect, matching opt-in, carpool.
- **HowToAttendScreen** — how to attend/pay explainer.
- **MyEventsScreen** — joined events *(orphaned)*.
- **EventCheckInScreen** — attendee's QR check-in code.
- **EventChatScreen** — event group chat (text, polls, carpool).

### Events — host
- **CreateEventScreen** — full create flow (details, category, place via Google Places, date/recurrence, price, images, Pro features).
- **EditEventScreen** — edit event.
- **EventRosterScreen** — attendee roster.
- **CheckInScannerScreen** — scan attendee QRs.
- **PromoteEventScreen** — pay to feature an event.

### Profile & Personality
- **ProfileScreen** — own profile + **Host Tools 2×2 grid** (Payments, Plans, Analytics, Groups, My Fleet) + Personality (Big Five) + Settings (memberships, theme, safety, log out, delete). *(Overloaded — likely split.)*
- **UserProfileScreen** — public profile: avatar, name, city, followers/following, Follow, posts.
- **PersonalityQuiz / Results / Test** — Big Five quiz feeding matching.

### Social layer (Instagram-style) *(mostly unreachable today)*
- **FeedScreen** — posts from people you follow + you; suggests people; entry to compose + DMs.
- **CreatePostScreen** — compose (text + photos).
- **PostDetailScreen** — post + comments.
- **FollowListScreen** — followers/following.
- **DMListScreen / DMChatScreen** — 1:1 inbox + thread.
- **ConversationsScreen** — conversations list *(orphaned)*.
- **ConnectScreen** — people at an event → profile.

### Community Matching (privacy-first, Pro/Plus) — flow A1→E4
Opt-in, consent-gated, ranked by Big Five. Opens **after** the event.
- **MatchOptIn (A1)** → **MatchConsent (A2)** → **MatchProfile (A3/A4)** →
  **MatchingLocked (B2, countdown+teaser)** → **MatchGrid (C1, ranked attendees)** →
  **MatchPerson (C2, Like/Pass+safety)** → **MatchChat** (if host enabled).
- **PeopleYouMet (D1)** — post-close, your matches back into chat.
- **HostMatchingControls (D2)** — host configures match types/window/cap (Pro).
- **HostMatchAnalytics (D3)** — aggregate-only.
- **MatchVisibility (D4)** — visibility / delete data / leave.
- Paywalls: attendee cap → **PlusPaywall (C4)** → **PlusCheckout (E3)** → **PlusActivated (E4)**; host → **ProUpsell (E1)** → **ProCheckout (E2)**.

### Host business tools
- **StripeConnectScreen** — connect/refresh payout account.
- **HostAnalyticsScreen → AnalyticsDetailScreen** — revenue, members, per-event tiles.
- **FinanceScreen** — finance trends, revenue per event.
- **HostCRMScreen** — attendees across events; flags "at risk" vs "regulars."
- **RatingsOverviewScreen → RatingDetailScreen** — reviews + AI coaching (Pro).
- **HostGroupsScreen → GroupChatScreen / GroupManageScreen** — persistent groups for frequent attendees (+ polls via PollVotesScreen).

### Memberships (host sells passes)
- **MembershipPlansScreen** — host CRUD of plans (credits/validity/price; gated to hosts who can receive payments).
- **HostMembershipsScreen** — public list of a host's plans.
- **MembershipSaleScreen / MembershipCheckoutScreen** — buy.
- **MyMembershipsScreen** — attendee's active memberships.

### Rentals marketplace ("model A," no map by design)
- **RentalHubScreen** — browse vehicles by city/type.
- **VehicleDetailScreen** — info, price, availability.
- **RentalCheckoutScreen** — reserve + deposit; writes booked date range.
- **ActiveRentalScreen** — active rental (timer, return).
- **MyRentalsScreen** — renter's rentals.
- **MyFleetScreen** — host fleet: publish/manage, status (available/rented/maintenance).
- **PublishVehicleScreen** — add a vehicle.
- **VehicleBookingsScreen** — owner reservation tracker.

### Subscriptions / paywalls
- **BondVibeProScreen** — Kinlo Pro benefits (host).
- **ProUpsell / ProCheckout** — Pro upsell + checkout.
- **PlusPaywall / PlusCheckout / PlusActivated** — Plus paywall + checkout + success.

### Safety, moderation & admin
- **SafetyCenterScreen** — SOS (call 911), report user, contact safety team, tips.
- **ReportScreen** — report user/event (reason + details).
- **NotificationsScreen** — in-app notifications *(orphaned)*.
- **AdminDashboardScreen** — approve hosts, moderation, pricing knobs.

---

## 4. What we need you to deliver

Please produce, in order (pause after #1–2 for our confirmation before going deep):

1. **Information Architecture proposal.**
   - A recommended top-level structure. Explicitly decide: **bottom tab bar?**
     If yes, name the tabs (aim for 4–5) and justify. Show the full **navigation
     tree** (ASCII).
   - How you resolve the **attendee vs host** duality (role-adaptive tabs? a
     "Host" section/mode? contextual surfacing?).
   - Where each orphaned/buried domain lands (Feed, Notifications, MyEvents,
     Conversations, Rentals, Memberships, Matching).

2. **Primary-flow redesigns** (wireframe-level, ASCII or structured layout specs):
   - First-run onboarding (incl. the long host path — progressive disclosure).
   - Home / discovery.
   - The `ProfileScreen` split (public Profile vs Settings vs Host Dashboard).
   - One social flow (Feed → Post → DM) and one Matching entry.

3. **Design system proposal.**
   - Whether to keep/evolve WARMTH + AURORA. Type ramp, spacing scale, color
     roles, elevation, button/badge/card variants, iconography guidance.
   - A short set of **reusable component specs** (e.g., ListRow, SectionHeader,
     StatCard, Paywall sheet) mapped to where they're used.

4. **Prioritized rollout plan** — what to fix first for the biggest UX win
   (P0/P1/P2), framed so engineers can execute incrementally.

Format: lead with your recommendation + rationale; use tables and ASCII
wireframes; keep it scannable. Where you make a judgment call, state the
trade-off in one line.

---

## 5. Non-negotiable constraints

- **iOS-first**, Expo managed workflow. No heavy native additions (e.g., maps are
  intentionally omitted; rentals has no map).
- **Privacy for Community Matching is a hard requirement** — it must stay opt-in,
  **consent-gated** (the A2 consent step cannot be skipped), and host analytics
  stay aggregate-only. Don't design flows that expose who liked/matched whom.
- **Monetization must stay legible** — users should never hit a paywall without
  understanding why (e.g., matching like-cap → Kinlo Plus). Upsells should feel
  earned, not nagging.
- **Two payment processors** (Stripe + Mercado Pago) exist; the host payout path
  differs — keep it from leaking complexity to attendees.
- **Reuse what exists** — there's already a central `<Icon>` (Lucide) and theme
  tokens; build on them rather than inventing a parallel system.
- **Empty / loading / error states matter** — the app is Firestore-driven and
  data is often sparse early; design for the zero state, not just the full one.
- Navigation is registered in **one place** (`src/navigation/AppNavigator.js`), so
  restructuring nav is low-risk and won't require touching business logic.

---

## 6. Definition of "perfect" (success criteria)

- A brand-new user grasps **what the app does and where to go** within seconds.
- **Every feature is discoverable** in ≤2 taps from a persistent nav.
- The **visual language is consistent** across all ~65 screens.
- **Attendees and hosts** each get a clean, uncluttered experience.
- **Monetization feels natural** and well-timed.
- Engineers can execute the redesign **incrementally** without rewriting logic.

---

## 7. Start here

Begin with **Deliverable #1 (Information Architecture)**. If any decision truly
depends on our business priority (e.g., "is the social feed a core pillar or a
supporting feature?"), ask us **before** finalizing the tree — but bring a
recommended default. Once we confirm the IA, proceed to the flow redesigns.
