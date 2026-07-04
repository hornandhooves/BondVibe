# KINLO_REDESIGN_SPEC — world-class IA, flows, design system & AI integration

> **Audience:** Kinlo eng team + Claude Code (implementer). **App:** Kinlo (Expo/RN, iOS-first). Repo may be internally `bondvibe`; all user-facing copy is **Kinlo**.
> **How to use:** put this file in the repo root. Point the developer at it with:
> `Read KINLO_REDESIGN_SPEC.md and follow it. Implement in the order given, pausing after each deliverable for my review.`
> **Companion visual mockups (optional reference):** `Kinlo AI Features.dc.html`, `Kinlo AI Analytics & Integration.dc.html`, `Kinlo Profile Rediseño (Diff).dc.html`.

## Status of this document
| # | Deliverable | State |
|---|---|---|
| 1 | Information Architecture & navigation | ✅ Confirmed (5-tab, Host Mode, Rentals pillar) |
| 2 | Primary-flow redesigns (ASCII wireframes) | ✅ In this draft |
| 3 | Design system (evolve WARMTH/AURORA) | ✅ In this draft |
| 4 | Prioritized rollout (P0/P1/P2) | ✅ In this draft |
| + | Feature gating (Pro/Plus/Free) — §1.8 | ✅ config-driven, flip in one file |

Confirmed product decisions: **(a)** persistent bottom tab bar — **5 tabs locked**; **(b)** the social Feed is a **core pillar, fused with Smart Wall** into one "Wall" tab; **(c)** **Rentals is a pillar** with its own tab; **(d)** hosting is a **Host Mode** inside the one app (no second app); **(e)** messaging + notifications live in the header; **(f)** which features are **Pro / Plus / Free is a single config** (§1.8) — existing Pro features stay Pro, any new AI feature's tier flips by editing one line.

---

# Deliverable 1 · Information Architecture & Navigation

## 1.1 Diagnosis (why today hurts)
- **No persistent navigation.** ~65 screens in one flat stack; everything is reached by drilling from Home. A new user cannot form a mental model of the app.
- **Orphaned domains** (no entry point): Feed, Notifications, MyEvents, Conversations/DMs.
- **Buried domains:** Connect and Rentals only exist inside an event.
- **Profile is a junk drawer:** public profile + host tools + personality + settings + safety all in one screen.
- **Consequence:** features the business paid to build are invisible; discoverability, retention, and monetization all leak.

## 1.2 Recommendation — a **5-tab bar** with Rentals promoted (messaging → header)
Rentals is now a pillar, so it takes a tab. **iOS HIG caps the tab bar at 5** — a 6th item makes the bar cramped (~52pt targets on an iPhone SE) and native `UITabBar` collapses 5+ into a "More" tab. So to make **Rentals a full pillar without breaking the bar**, we move **messaging + notifications to persistent header icons** (the Instagram/Airbnb pattern) and keep five tabs.

| Tab | Icon (Lucide) | Owns | Solves |
|---|---|---|---|
| **Home** | `compass` | Discovery, search, featured, browse by community, Weekly Digest banner | Focused discovery |
| **Wall** | `layout-grid` | **Smart Wall** = AI-ranked social feed + posts + recaps; **Ask Kinlo** entry in header | Orphaned Feed fixed **and** AI integrated in one move |
| **Events** | `calendar` | MyEvents (joined + tickets + QR), event chats; **Host Mode → Manage** | Orphaned MyEvents fixed; host duality resolved here |
| **Rentals** | `bike` | Get Around marketplace: RentalHub > VehicleDetail > Checkout > ActiveRental | Rentals un-buried, promoted to pillar |
| **Profile** | `user` | Public profile, Personality, Settings, Safety, Switch to Hosting, MyMemberships, MyRentals | De-clutters the old hub |

**Persistent header chrome (all tabs, top-right):** **✉ Messages** (Inbox: DMs, match chats, event chats, Ask Kinlo pinned) + **🔔 Notifications** (activity). A contextual **`+`** appears where creation belongs (compose on Wall; Create Event in Host Mode; Publish Vehicle in Rentals host view).

**Trade-off calls (one line each):**
- *Messaging = header icon, not a tab* → in Kinlo, chats are mostly event/match-scoped and reached in context; a badged header ✉ keeps them 1 tap away while freeing the 5th slot for Rentals-as-pillar.
- *Matching gets no dedicated tab* → episodic (opens post-event); docks in Events + surfaced by notifications + a Wall card. Still ≤2 taps.
- *If you insist on 6 tabs* → doable with a custom RN tab bar, but expect cramped targets and an off-HIG feel on small iPhones; not recommended.

## 1.3 Attendee vs Host duality — **Host Mode** (header toggle, one app)
No second app, no second tab bar. Mechanism:

- **Approved hosts** see a **segmented toggle in the header: `[ Attending | Hosting ]`** (persists last choice in app context; survives relaunch).
- **Switching to Hosting** swaps the **Events tab** stack root: MyEvents → **Manage** (host dashboard), and the `+` becomes **Create Event**. Home's featured row shows host prompts; Rentals gains a **"Your fleet"** entry. Nothing else moves — muscle memory intact.
- **Switching back to Attending** restores the attendee stacks. Fully reversible, instant.
- **Non-hosts** see **no toggle**. Profile shows **"Switch to Hosting"** → host onboarding (`RequestHost → HostTypeSelection → StripeConnect / Mercado Pago`). After approval, the header toggle appears.
- Implementation: a `mode: 'attending' | 'hosting'` boolean in nav context; the Events (and Rentals-fleet) stacks read it to pick their root. Low-risk — one place in `AppNavigator.js`.

```
        ┌──────────────── same 5-tab bar ────────────────┐
ATTENDING:  Home   Wall   Events(mine)   Rentals   Profile
HOSTING:    Home   Wall   Manage(host)   Rentals▸  Profile
                              ▲ Events swaps root      ▲ +"Your fleet"
   header (all tabs):  [Attending|Hosting]   ✉ Messages(•)   🔔 Notifications(•)
```

## 1.4 Full navigation tree (ASCII)
```
Kinlo (authenticated)
├── [HEADER · all tabs] [Attending|Hosting toggle*]   ✉ Messages   🔔 Notifications
│      ├── Messages (Inbox): ★Ask Kinlo(pinned AI) · DMs > DM Chat · Match Chats · Event Chats
│      └── Notifications: activity (likes, follows, RSVPs, "matching is open")   *host only
├── [TAB] Home / Discover
│     ├── Search Events (filters: language/type/date/price)
│     ├── Event Detail ─> Checkout · Event Chat · Connect · Matching opt-in · Carpool · HowToAttend
│     ├── Browse by Community
│     └── Weekly Digest (AI) [banner/card, Mondays]
├── [TAB] Wall  ★ core pillar
│     ├── Smart Wall feed (AI-ranked, "Why you're seeing this")
│     ├── Post Detail > Comments · Create Post [+]
│     ├── Post-event Recaps (AI)
│     └── ⌕ Ask Kinlo (AI concierge)  [header entry + pinned in Messages]
├── [TAB] Events
│     ├── ATTENDING: MyEvents (upcoming/past) > Ticket/QR CheckIn > Event Chat
│     │     └── People You Met (post-event) ──> Matching flow
│     └── HOSTING = Manage
│           ├── Create Event [+]  (Host Copilot: "Draft with AI")
│           ├── Event Roster · CheckIn Scanner · Promote Event
│           ├── Analytics (AI Analytics) > Analytics Detail · Finance
│           ├── Members (Member Intelligence: pulse + win-back) · Host CRM
│           ├── Ratings (AI coaching, Pro) · Memberships (plans CRUD)
│           └── Groups > Group Chat / Manage / Polls
├── [TAB] Rentals  ★ pillar
│     ├── RentalHub (browse by city/type) > VehicleDetail > RentalCheckout > ActiveRental
│     ├── MyRentals (active/past)
│     └── HOSTING: Your Fleet > MyFleet · Publish Vehicle · Vehicle Bookings
├── [TAB] Profile
│     ├── Public Profile (avatar/city/followers/posts)  [= UserProfile for others]
│     ├── Personality (Quiz > Results)
│     ├── My Memberships
│     ├── Switch to Hosting ⇄ (RequestHost > HostTypeSelection > StripeConnect/MercadoPago)
│     ├── Settings (Kinlo AI toggle, Appearance) · Safety Center > Report
│     └── Subscriptions (Kinlo Pro / Kinlo Plus, manage)
├── Matching flow (event-scoped: from Event Detail / People You Met / notification)
│     └── A1 OptIn > A2 Consent > A3/A4 Profile > B2 Locked > C1 Grid > C2 Person
│           > Match Chat · Match Intelligence (AI: why-you-click + icebreakers + safety)
│           · Plus paywall (C4>E3>E4) · Host controls D2 · Host analytics D3 · Visibility D4
└── Admin (role-gated): Admin Dashboard (approve hosts, moderation, pricing)

Auth gate (pre-login, order unchanged): Welcome > Login > Signup > EmailVerification
      > Legal > ProfileSetup > [optional host path] > Home
```

## 1.5 Where every orphaned / buried domain lands
| Domain (today) | New home | Taps from nav |
|---|---|---|
| Feed (orphaned) | **Wall tab** (fused with Smart Wall) | 1 |
| Notifications (orphaned) | **Header bell** (persistent) | 1 |
| Conversations / DMs (orphaned) | **Header ✉ Messages** (Inbox) | 1 |
| MyEvents (orphaned) | **Events tab** | 1 |
| Rentals hub (buried) | **Rentals tab** (pillar) | 1 |
| Connect (buried in event) | Event Detail (kept) → rolls into **Matching** post-event | 2 |
| MyFleet / Publish (buried) | **Rentals → Your Fleet** (Host Mode) | 2 |
| Host tools (crammed in Profile) | **Host Mode → Manage** | 2 |
| Personality / Safety / Settings (crammed) | **Profile** sections | 1–2 |

## 1.6 Where the 7 AI features dock (organic integration)
| AI feature | Docks in | Entry |
|---|---|---|
| **Smart Wall** | Wall tab | *is* the tab's feed + "Why you're seeing this" per post |
| **Ask Kinlo** | Header ✉ Messages (pinned thread) + Wall header + Events "Plan my week" | ≤1 tap |
| **Host Copilot** | Host Mode → Create Event | "Draft with AI" button |
| **Member Intelligence** | Host Mode → Manage → Members | pulse card + win-back |
| **AI Analytics** | Host Mode → Manage → Analytics | "AI read your month" card |
| **Weekly Digest** | Home top card + push (Mondays); entry in Profile | banner |
| **Match Intelligence** | Matching flow → Match Person | "Why you two click" + icebreakers |

All AI gated behind the one-time **"Turn on Kinlo AI"** opt-in; attendee AI is opt-in, host AI is aggregate-only; loading + fallback states required (never fake output). Detailed specs live in `kinlo_ai_features/` — this redesign places them in the new IA.

## 1.7 Resolved decisions ✅
- **5-tab bar locked:** Home · Wall · Events · Rentals · Profile.
- **Messaging + Notifications = header icons** (✉ / 🔔), persistent on every tab.
- **Host Mode** = header `[Attending|Hosting]` toggle; swaps the Events tab into Manage. No second app.
- **Rentals = pillar** (own tab).

## 1.8 Feature gating — Pro / Plus / Free from ONE config
Requirement: it must be trivial to change which features are Pro. All gating lives in a single file; existing Pro features stay Pro; any new AI feature's tier flips by editing one line.

```js
// src/config/entitlements.js  ← the ONLY place to decide what is Pro / Plus / Free
export const FEATURES = {
  // key                      tier      audience      on
  community_matching_host:  { tier:'pro',  audience:'host',     on:true }, // existing → stays Pro
  ratings_ai_coaching:      { tier:'pro',  audience:'host',     on:true }, // existing → stays Pro
  matching_unlimited_likes: { tier:'plus', audience:'attendee', on:true }, // existing → Kinlo Plus
  // ── new AI features · FREEMIUM: full AI = Plus/Pro, but a free "taste" prevents churn ──
  smart_wall:               { tier:'plus', audience:'attendee', on:true, freeTaste:'ranked feed works; "why you\'re seeing this" on 3 posts/day' },
  ask_kinlo:                { tier:'plus', audience:'attendee', on:true, freeTaste:'3 questions / week' },
  weekly_digest:            { tier:'plus', audience:'attendee', on:true, freeTaste:'monthly instead of weekly' },
  match_intel:              { tier:'plus', audience:'attendee', on:true, freeTaste:'see the rationale; icebreakers locked' },
  host_copilot:             { tier:'pro',  audience:'host',     on:true, freeTaste:'1 AI draft, then Pro' },
  member_intel:             { tier:'pro',  audience:'host',     on:true }, // Pro only
  ai_analytics:             { tier:'pro',  audience:'host',     on:true, freeTaste:'headline number; full read = Pro' },
};
// tier: 'free'|'pro'|'plus' · freeTaste: what a free user gets before the paywall · on:false = kill-switch
```
```
useEntitlement('host_copilot') -> { allowed:boolean, tier, reason:'ok'|'needs_pro'|'needs_plus'|'off' }

<ProGate feature="host_copilot">        // renders children if allowed…
  <DraftWithAI/>
</ProGate>                              // …else shows <ProBadge/> + routes to the right paywall
```
Rules Claude Code must follow:
- **Never hardcode a tier check in a screen.** Always read `entitlements.js` via `useEntitlement` / `<ProGate>`.
- `<ProGate>` auto-routes locked features to the correct paywall: `tier:'pro'` → ProUpsell (E1→E2); `tier:'plus'` → PlusPaywall (C4→E3→E4).
- Locked-but-visible features show a **`<ProBadge/>`** (see §3.6) so users see the value before paying — legible monetization, never a dead end.
- Changing a feature from Pro→free (or vice-versa) = editing one line here; no screen changes.

**Freemium model (approved) — "free taste, Plus/Pro unlimited":** all AI is a paid capability (attendee AI = Kinlo Plus, host AI = Kinlo Pro), BUT every AI feature ships a small **free taste** (`freeTaste` above) so free users experience the value and form the habit — never a blank wall. Anti-churn rules: (1) the paywall only fires at a **moment of demonstrated value** ("you've used your 3 AI questions this week"), never on app open; (2) never block core navigation, event discovery, or ticket purchase — gating is only on *AI depth*; (3) always show a **blurred/locked preview** of what Plus/Pro unlocks; (4) the app stays fully useful without paying. This maximizes upgrade conversion without killing adoption of the differentiator. To harden into a full wall later, delete the `freeTaste` fields (one line each).

---

# Deliverable 2 · Primary-flow redesigns (ASCII wireframes)

## 2.1 First-run onboarding — progressive host disclosure
Keep the auth order; **defer the host path** out of first run (it was the longest, highest-drop segment). New users reach Home in the fewest steps; hosting is offered later, in context.
```
Welcome ─> Signup/Login (email · Google · Apple) ─> EmailVerify ─> Legal
   ─> ProfileSetup (name · avatar · city)
   ─> "Turn on Kinlo AI?"  [Turn on]  [Not now]        ← one-time opt-in (gates all AI)
   ─> HOME (Attending)                                  ← done. No host questions here.

Become a host LATER (in context):
Profile ▸ Switch to Hosting ─> RequestHost ─> HostTypeSelection (Free | Paid)
   ─> if Paid: StripeConnect / Mercado Pago ─> pending ─> approved
   ─> header [Attending|Hosting] toggle now appears
```
```
┌─ ProfileSetup ───────────────┐   ┌─ Turn on Kinlo AI ───────────┐
│  ( avatar + )                │   │        ✨ (orb)              │
│  Name  [__________]          │   │  Meet Kinlo AI               │
│  City  [__________]          │   │  Finds your people & events  │
│                              │   │  ✓ only you see it            │
│           ( Continue )       │   │  ✓ never public · off anytime │
└──────────────────────────────┘   │  ( Turn on )   Not now       │
                                    └──────────────────────────────┘
```

## 2.2 Home / discovery
```
┌───────────────────────────────────────┐
│ Hi Camila            [Att|Host]* ✉• 🔔•│  *toggle host-only
│ ┌ Weekly Digest (AI) ─────────────────┐│
│ │ ✨ Your week — 3 picks           →  ││
│ └─────────────────────────────────────┘│
│ ⌕ Search events                        │
│ Featured        ▸ card ▸ card ▸ card    │
│ Browse by community  (Yoga)(Hike)(Salsa)│
│ Zero-state: "No events near Medellín yet│
│   — be the first to host"  ( Host one ) │
└───────────────────────────────────────┘
  [Home]   Wall   Events   Rentals   Profile
```

## 2.3 The ProfileScreen split (fixes the "junk drawer")
Three distinct surfaces, no more overload:
```
1) PUBLIC PROFILE (others see = UserProfile)     2) SETTINGS (private)
   avatar · name · city · followers                 Kinlo AI toggle
   [Follow]  posts grid                             Appearance (WARMTH/AURORA)
                                                     Account · Notifications
3) HOST DASHBOARD = Events tab in Hosting mode      Safety Center ▸ Report
   (NOT inside Profile anymore)                      Subscriptions (Pro/Plus)
                                                     Legal · Log out
Own Profile hub = links to the above + Personality + My Memberships + Switch to Hosting.
```

## 2.4 Social — Wall → Post → DM
```
WALL (Smart Wall)                    Post Detail                Messages (from ✉)
┌────────────────────┐   tap post   ┌──────────────┐   ✉      ┌──────────────┐
│ ✨ Curated for you  │  ─────────>  │ author · time │  ──────> │ ★Ask Kinlo   │
│ ┌ event post ─────┐ │              │ body · photos │          │ Mariana   •  │
│ │ Why: 5 friends  │ │              │ ♡ Going  reply│          │ Match: Dani  │
│ │ [ I'm in ]      │ │              │ ── comments ──│          │ Event: Yoga  │
│ └─────────────────┘ │              └──────────────┘          └──────┬───────┘
│ [+ compose]         │                                          tap ▶ DM Chat
└────────────────────┘
Signals = Going · Interested · Met  (no likes / no follower counts)
```

## 2.5 Matching entry (+ where the gates fire)
```
Event Detail ──during──> "Matching opens after the event 🔒 (countdown)"
   ──after (push)──> A1 OptIn ─> A2 Consent (4 pts, CANNOT skip) ─> A3/A4 Profile
       ─> C1 Grid (ranked) ─> C2 Person ─> Like / Pass
             ├ free like-cap hit ─> Kinlo Plus paywall (C4 ─> E3 ─> E4)   [gate: plus]
             └ Match Intelligence: "Why you two click" + icebreakers       [gate: plus]
   Host (Hosting mode) ▸ Manage ▸ Matching controls (D2)  [gate: pro] · Analytics (D3, aggregate-only)
Privacy: opt-in, consent-gated, aggregate-only for hosts, never expose who liked whom.
```

---

# Deliverable 3 · Design system (evolve, don't replace)

## 3.1 Themes — keep both, WARMTH default
Keep **WARMTH** (Clean / light) as default and **AURORA** (dark) as opt-in. Both read the same token names; only values swap. The AI surfaces (§ AICard) are intentionally dark in both themes — that's the "Claude is here" signature.

## 3.2 Type ramp
| Token | Font / size / weight | Use |
|---|---|---|
| display | Space Grotesk 26–40 / 700 | screen titles, hero numbers |
| title | Space Grotesk 17–20 / 700 | section titles, prices, stats |
| body | Plus Jakarta 14–15 / 400–600 | content, lists |
| label | Plus Jakarta 12.5–13 / 600 | buttons, chips |
| eyebrow | Space Grotesk mono 11 / 700 UPPER | section headers |
| caption | Plus Jakarta 11–12 / 500 | meta, timestamps |

## 3.3 Spacing & radius
- **Spacing scale (4pt base):** 4 · 8 · 12 · 16 · 20 · 24 · 32. Screen padding 20; card padding 14–16; gaps 8–16 (flex/grid `gap`, never ad-hoc margins).
- **Radius:** chip/pill 999 · card 16–22 · button 24–27 · tile 12–14 · sheet 28 (top).

## 3.4 Color roles (token names — values per theme)
```
bg · surface · sunken · hairline · text · textSec · textMuted
brand(#7C3AED) · brandSoft(#F1E9FE) · brandGradient(135° #7C3AED→#C026D3→#FF3E9A)
ai.bg(#160F22) · ai.panel(#2A1E3D→#42265C) · ai.accent(#C792EA)      ← AI signature
success(#1F8A6E) · warn(#B45309) · danger(#c25b5b) · limeGood(#C3E88D)
match.friend/professional/romantic (+ soft)   ·   avatarPastels[5]
```

## 3.5 Elevation
- Card `0 1px 3px rgba(0,0,0,.06)` · Floating (tab bar, FAB, primary CTA) brand `0 8–10px 22px rgba(124,58,237,.28)` / neutral `0 10px 30px rgba(30,20,50,.14)`. No neon borders / glow.

## 3.6 Reusable component specs
| Component | Spec | Used in |
|---|---|---|
| **ListRow** | 36px lead icon-tile (brandSoft) · title(body 600) + optional sub(caption) · chevron/right-slot · 1px hairline · h≈56 | Settings, Manage, Inbox, memberships |
| **SectionHeader** | eyebrow (mono 11 UPPER, textMuted) + optional right action | every grouped section |
| **StatCard** | title(caption textMuted) + value(display, Space Grotesk) + delta(success/danger) | Analytics, Host dashboard, Profile stats |
| **AICard** | ai.panel bg, sparkle + eyebrow + grounded reason, white text | every AI surface (Wall, Analytics, Match, Digest) |
| **ProBadge** | pill, brandGradient, crown icon + "PRO" (or "PLUS") 11/800 white | any locked feature affordance |
| **LockedFeature** | dimmed content + centered ProBadge + one-line value + CTA → paywall | Host Copilot/Analytics/Member Intel when not Pro |
| **PaywallSheet** | bottom sheet (radius 28 top): hero, benefit checklist, price row, primary CTA, "Maybe later"; variant `pro`|`plus` | ProUpsell (E1), PlusPaywall (C4) |
| **Button** | primary = brandGradient h54 r27 white 16/700; secondary = surface + soft shadow; destructive = danger text | global |
| **Badge / Chip** | soft surface + tier/type color text, pill | filters, looking-for, status |
| **Card** | surface, radius 18, card shadow | global |
| **Icon** | central `<Icon>` (Lucide, strokeWidth 1.75, absoluteStrokeWidth, color by token) | global — reuse existing |
| **Empty/Loading/Error** | Empty = illustration + 1-line + CTA; Loading = skeleton shimmer; Error/AI-fallback = plain content + soft note (never blank, never fake AI) | every Firestore-driven list |

---

# Deliverable 4 · Prioritized rollout (P0 / P1 / P2)

Framed for incremental engineering — **no business-logic rewrites**; nav is one file.

### P0 — The shell (unblocks everything, ship first)
- `AppNavigator.js`: replace flat stack with **5-tab bar** + persistent header (✉ Messages, 🔔 Notifications) + **Host Mode** toggle. This alone **un-orphans** Feed, Notifications, MyEvents, DMs and un-buries Rentals.
- `src/config/entitlements.js` + `useEntitlement` + `<ProGate>` / `<ProBadge>` / `<LockedFeature>`.
- Lock **design tokens** (WARMTH default) + core components (ListRow, SectionHeader, StatCard, Button, AICard shell).
- **Profile split** (Public / Settings / Host entry). No new features yet — pure IA + system.

### P1 — Attendee core + AI foundation
- **Home** redesign + zero states. **Wall = Smart Wall** with the `callClaude` Cloud Function (AI Foundation) + "Why you're seeing this" + signals (Going/Interested/Met).
- **Ask Kinlo** (Inbox pinned + Wall header). **Inbox** (DMs/match/event chats).
- **"Turn on Kinlo AI"** opt-in + loading/fallback states (reused everywhere).
- **Rentals** tab polish (pillar) for attendees.

### P2 — Host depth, matching depth, monetization
- **Host Mode → Manage**: Host Copilot (Draft with AI), Member Intelligence, AI Analytics — all `<ProGate tier="pro">`.
- **Match Intelligence** (why-you-click + icebreakers) `<ProGate tier="plus">`; **Weekly Digest** (push + Home card).
- **Rentals → Your Fleet** (host), post-event **Recaps**, PaywallSheet polish (Pro/Plus), Ratings AI coaching.

> **This completes Deliverables #1–#4.** Next step options: (a) I generate the companion visual mockups for the new IA (tab bar + Home + Profile split) as `.dc.html`, or (b) I merge the `kinlo_ai_features/` specs as an appendix so Claude Code has one folder. Tell me which.
