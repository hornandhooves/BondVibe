# Kinlo · AI Features — START HERE (Claude Code entry point)

> **App name: Kinlo.** (Repo may still be internally named `bondvibe` — that's fine, keep lowercase identifiers; all user-facing text says **Kinlo**.)
> Put the `kinlo_ai_features/` folder in the **repo root**. This file is the only one you need to point Claude Code at — it references everything else.

## The one-line prompt to give Claude Code
```
Read kinlo_ai_features/00_START_HERE.md and follow it. Build the AI-native features it
describes for the Kinlo app, in the order listed, pausing for my review after each phase.
```

## What this package is
Six **AI-native features** powered by **Anthropic Claude**, designed to be Kinlo's core differentiator. This is not "AI bolted on" — Claude reads each user's real community context (their Vibes, personality test, who's going, attendance history) and produces actions no competitor can copy.

Visual reference (open in a browser / design tool): **`Kinlo AI Features.dc.html`** (features 1–6) and **`Kinlo AI Analytics & Integration.dc.html`** (feature 7 + AI states + the integration map). Build the UI to match these.

## Read these in order
1. `00_START_HERE.md` — this file (index, rules, build order)
2. `01_DESIGN_SYSTEM.md` — Clean theme tokens + components (match the mockups)
3. `02_AI_FOUNDATION.md` — how Claude is wired in (secure proxy, prompt patterns, data, safety, cost) — **build this first, everything depends on it**
4. `03_INTEGRATION_MAP.md` — **where each feature docks in existing screens + required AI states (opt-in / loading / fallback)**
5. `10_FEATURE_smart_wall.md` — AI-ranked, explainable feed
6. `11_FEATURE_ask_kinlo.md` — conversational concierge that plans your week
7. `12_FEATURE_host_copilot.md` — AI drafts events, prices, predicts turnout
8. `13_FEATURE_member_intelligence.md` — AI community pulse + win-backs (host)
9. `14_FEATURE_weekly_digest.md` — AI-composed weekly ritual (retention)
10. `15_FEATURE_match_intelligence.md` — AI rationale + icebreakers + safety (extends Community Matching v2)
11. `16_FEATURE_ai_analytics.md` — **AI-read host analytics + AI observability metrics**

> Community Matching itself is specced separately in the earlier handoff (`HANDOFF_COMMUNITY_MATCHING.md` / `03_feature_community_matching.md` if present). Feature 15 extends it.

## Global build order (stop for review after each)
1. **Phase 0 — AI Foundation** (`02_AI_FOUNDATION.md`): the `callClaude` Cloud Function + client hook + shared prompt/JSON plumbing + safety + logging. Nothing else works without it.
2. **Phase 1 — Smart Wall** (`10`): highest reach, reuses check-in + communities.
3. **Phase 2 — Ask Kinlo** (`11`): the concierge, reuses Phase 0 plumbing.
4. **Phase 3 — Host Copilot** (`12`) + **Member Intelligence** (`13`): the host value engine.
5. **Phase 4 — Weekly Digest** (`14`) + **Match Intelligence** (`15`): retention + matching depth.
6. **Phase 5 — AI Analytics** (`16`): host insight layer + turn on AI observability (measure acceptance, cost, and North-Star lift).

> Before Phase 1, build the shared **AI states** from `03_INTEGRATION_MAP.md` (opt-in, loading, fallback) — every feature reuses them.

## Hard rules (apply to every feature)
- **English** for all UI copy, code comments, and content. (Only the product owner's chat is Spanish.)
- **Match the Clean design system** in `01_DESIGN_SYSTEM.md` and the mockups. No new styles, no hardcoded colors — use tokens.
- **Never call Anthropic from the client.** Always go through the `callClaude` Cloud Function; the API key is server-side only (`02_AI_FOUNDATION.md`).
- **Ground every AI output in the user's real data.** No hallucinated events, people, or numbers. If data is missing, the feature degrades gracefully (hide the AI card, don't fake it).
- **Privacy-first.** Attendee AI is opt-in; host-facing AI is aggregated only (never expose who liked/DMed whom). Mirror the Community Matching privacy model.
- **Structured output.** Claude returns JSON that the UI renders — never dump raw model text into the UI except in the Ask Kinlo chat.
- **Reuse existing assets:** personality test, QR check-in, communities/Vibes, Stripe, `ThemeContext`, `theme-tokens.js`, `<Icon>`/`CategoryIcon`.
- Small commits per phase. Show the file plan before editing and wait for OK.

## Definition of done (per feature)
- UI matches the mockup for that feature in `Kinlo AI Features.dc.html`.
- All Claude calls go through `callClaude`; graceful fallback when the model is unavailable.
- Output is grounded, structured, and privacy-safe.
- Copy is English and uses design tokens.
