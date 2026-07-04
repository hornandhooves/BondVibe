# 10 · Smart Wall — the feed that knows your tribe

**Pillar:** Wall · **Users:** attendees · **Mockup:** phone 01 in `Kinlo AI Features.dc.html`

## Why it beats Instagram
IG ranks by engagement bait from strangers. Smart Wall ranks by **belonging + intent to show up IRL**, and **explains every post**. Claude turns your real community graph into a feed that always converts to attendance.

## What Claude does
1. **Ranks the feed** by: your Vibes, personality fit, which friends are going, proximity in time, and past attendance.
2. **Writes a one-line "Why you're seeing this"** grounded in real signals ("5 from Hiking MDE are going, fits your Saturday mornings").
3. **Composes the top "Curated for you" digest card** (a 1–2 sentence weekly framing).
4. **Auto-writes post-event recaps** from attendee-shared moments (with consent), captions the photo grid.

## Screens (match mockup 01)
- Wall header + search.
- **AICard (top):** "Curated for you by Kinlo AI" + weekly framing + progress dots.
- **Event post:** image, "Why you're seeing this" pill + reason, title, time, friend avatars, **I'm in** CTA.
- **Recap post:** "You were there" verified badge, AI recap line, 3-photo grid.
- **Signals row:** Going / Interested / Met — **no likes, no follower counts**.

## Data Claude receives
```
{ user:{ vibes:[], personalityScores:{}, interests:[] },
  candidates:[ { eventId, title, startsAt, vibeId, friendsGoing:[uid], tags:[] } ],
  history:{ attendedEventIds:[], typicalDays:[] } }
```

## Output schema
```json
{ "digest": { "text": "..." },
  "feed": [ { "eventId":"e123", "reason":"5 from Hiking MDE are going, fits your Saturday mornings", "score":0.94 } ],
  "recaps": [ { "eventId":"e100", "caption":"18 of us flowed at dawn." } ] }
```
UI renders in `feed` order; `reason` shows in the pill; every `eventId` links to a real event. If `fallback`, show a plain chronological feed of the user's Vibes with no AI cards.

## Build notes
- New `<AICard>` + `<WhyPill>` components (design tokens).
- Cache ranking per session (TTL ~1–2h); re-rank on new RSVP.
- Recaps require the post-event photo pipeline (opt-in) — can ship after check-in exists.
- Reuses: communities/Vibes, RSVP, QR check-in (for "You were there"), personality test.
