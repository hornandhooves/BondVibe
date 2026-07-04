# 03 · Integration Map — where every AI feature docks

Visual: `Kinlo AI Analytics & Integration.dc.html` (bottom panel). This maps each feature to the **existing** Kinlo screens/nav so you insert, don't rebuild.

## By existing screen

### Wall tab (attendee home)
- **Smart Wall (10)** — replaces the current feed ranking. Add: "Curated for you" `<AICard>` pinned at top; a "Why you're seeing this" `<WhyPill>` on each event post; post-event recap posts inline.
- **Ask Kinlo (11)** — entry point = a sparkle pill in the Wall header; also surface in empty states ("Not sure? Ask Kinlo").
- Signals on posts change from likes → **Going / Interested / Met**.

### Events tab + Event Create flow
- **Ask Kinlo (11)** — "Plan my week" CTA on the Events tab.
- **Host Copilot (12)** — "Draft with AI" button at the top of the existing Create-event form. Its JSON prefills title, description, price, predicted turnout, best post time. Kinlo Pro-gated.
- **Event detail** — add "friends going" social-proof row (feeds Smart Wall too).

### Host dashboard
- **AI Analytics (16)** — "AI read your month" `<AICard>` at the top of the existing **Analytics** tab, plus a "What to do next" recommendations list under the charts.
- **Member Intelligence (13)** — pulse `<AICard>` + AI-drafted win-back in the **Members** tab; sends via the broadcast system.
- Both Kinlo Pro-gated; both **aggregate-only**.

### Matching (Community Matching v2)
- **Match Intelligence (15)** — "Why you two click" `<AICard>` + icebreaker cards on each match profile screen; safety pass runs on match chats. Respects the post-event window + host settings.

### Profile & Settings
- **Weekly Digest (14)** — delivered as push + an in-app card; entry from Profile. One batched call per user per week.
- **Turn on Kinlo AI** first-run screen (see AI states) + a persistent **AI toggle** in Profile → Settings (opt-out).

## Required AI states (build once, reuse everywhere)
Mockups: `Kinlo AI Analytics & Integration.dc.html`, phones 2–4.
- **Opt-in / first-run** — "Meet Kinlo AI": what it uses, what it never does, Turn on / Not now. Gate all AI behind this consent.
- **Loading** — dark `<AICard>` "Kinlo AI is reading your community…" + shimmer skeletons. Never a blank screen.
- **Fallback** (model unavailable / low data / opted-out) — plain chronological content + a soft note ("AI picks are taking a break"). **Never fake AI output.**

## Navigation summary (tab bar unchanged)
Discover · Events · Wall · Matching/Communities · Profile — AI docks **inside** these, no new top-level tab. The only new full screens are the first-run opt-in and (optionally) the full "Your Week" digest.
