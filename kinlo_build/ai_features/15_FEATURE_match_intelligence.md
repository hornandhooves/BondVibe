# 15 · Match Intelligence — why you two click

**Pillar:** Matching · **Extends:** Community Matching v2 (`HANDOFF_COMMUNITY_MATCHING.md`) · **Mockup:** phone 06

## What it is
Adds a Claude layer on top of Community Matching: it **explains the match**, offers **tap-to-send icebreakers**, and runs **AI safety** on chats. Turns a % score into real conversation.

## What Claude does
1. **Match rationale** — one grounded paragraph on why two attendees fit (shared personality traits, interests, what each is "looking for").
2. **Icebreakers** — 3 specific, sendable openers based on both profiles.
3. **Safety** — background classification of match chats to flag harassment for moderation (never auto-shares contact; consent still required).

## Screen (match mockup 06)
- Profile hero + compatibility %.
- **AICard "Why you two click"** (grounded rationale).
- "AI icebreakers · tap to send" — 3 cards with send icon.
- **AI safety** note (green) explaining quiet moderation + mutual-consent guarantee.
- Bottom action bar: pass / **I'm interested**.

## Data Claude receives (both opted-in attendees only)
```
{ me:{ personalityScores, interests, lookingFor }, them:{ personalityScores, interests, lookingFor, bio },
  event:{ type:"friend|professional|romantic" } }
```

## Output schema
```json
{ "rationale":"You both scored high on Openness, love sunrise routines, and came for accountability partners. Mariana also hikes — your #1 interest.",
  "icebreakers":[ "Which trail near the city is your favorite for sunrise?", "Want to be each other's 6 AM accountability buddy?", "Coffee after Saturday's class?" ] }
```

## Safety pass (separate call)
```
input: { messageText } -> output: { flag: "none"|"review", categories:[] }
```
Store flags; route to moderation queue; never expose to the other user. Mirror Community Matching privacy: no contact shared until mutual consent; report/block/hide always available.

## Build notes
- Only runs for attendees who opted into matching (existing consent).
- Rationale/icebreakers = one grounded call when a profile is viewed (cache per pair).
- Respects matching window (post-event) and host settings from v2.
