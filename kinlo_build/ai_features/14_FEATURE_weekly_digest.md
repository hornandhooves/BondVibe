# 14 · Your Week in Kinlo — the AI weekly ritual

**Pillar:** Attendee retention · **Mockup:** phone 05 (dark AI surface)

## What it is
A once-a-week, AI-composed digest that becomes a habit: your streak, what your friends are doing, what's opening, and credits earned — a reason to open Kinlo every week that isn't a spammy push.

## What Claude does
1. Composes a warm, personal **narrative** of the user's upcoming week grounded in real RSVPs, friends going, and opening sign-ups.
2. Surfaces the **attendance streak** and what keeps it alive.
3. Picks 2–3 **recommended events** (friends going / opening soon / new-for-you).
4. Reports **credits earned** (loyalty) — ties to the Kinlo Credits system.

## Screen (match mockup 05 — dark)
- Eyebrow "YOUR WEEK · curated by AI" + "Hey {name} — here's your week ✨".
- **Streak card** (brand gradient, 🔥).
- **AI narrative** card (grounded).
- "Picked for you" list with Go / Remind actions.
- "See full week" CTA.

## Data Claude receives
```
{ user:{ name, streakCount, credits }, upcoming:[{eventId,title,startsAt,friendsGoing}],
  openingSoon:[{eventId,title,opensAt,fillSpeed}], recommendations:[{eventId,reason}] }
```

## Output schema
```json
{ "greeting":"Hey Camila — here's your week ✨",
  "streak":{ "count":3, "nudge":"One more this week keeps it alive" },
  "narrative":"You've got Rooftop Salsa Saturday with 3 friends. Hiking MDE opens tomorrow — last one filled in 2 hours. You earned 40 credits last week.",
  "picks":[ { "eventId":"e1","cta":"go" }, { "eventId":"e2","cta":"remind" } ] }
```

## Build notes
- **One batched call per user per week** (cost control), delivered as a push + in-app card; regenerate only on major change.
- Push copy is a 1-line teaser from `narrative`. Respect notification preferences.
- Reuses: RSVPs, friends graph, Kinlo Credits, opening-soon events.
