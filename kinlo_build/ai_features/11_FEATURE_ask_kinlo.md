# 11 · Ask Kinlo — conversational concierge

**Pillar:** Wall / discovery · **Users:** attendees · **Mockup:** phone 02

## What it is
A chat where users plan their social life in natural language. Claude answers with **real events + real friends**, inline, and can act (RSVP, group-book, remind). Reduces "what should I do?" to one sentence.

## What Claude does
- Interprets intent ("what can I do Saturday with my salsa crew?") → queries the user's events/friends → returns a short reply + **inline event cards**.
- Suggests follow-ups as chips: "Plan my whole week", "Book for all 3 of us", "Find people like me", "Something new".
- Can trigger actions via tool-use: `rsvp(eventId)`, `groupInvite(eventId, friendIds)`, `remind(eventId)`.

## Screen (match mockup 02)
- Header: sparkle avatar, "Ask Kinlo", "● Knows your communities".
- Chat: user bubble (brand), AI bubble (white) + **inline event cards** with chevron, suggestion chips.
- Input bar: "Ask Kinlo anything…" + gradient send.
- **Streaming** on (the only feature that streams tokens).

## Data / tools
```
context: { user vibes, friends[], upcomingEvents[], personalityScores }
tools:   rsvp(eventId), groupInvite(eventId, friendIds[]), remind(eventId), searchEvents(query, filters)
```

## Output
- Assistant messages are natural text (streamed) **plus** a structured `attachments:[{type:'event', eventId}]` array the UI renders as cards. Only real `eventId`s.
- If it can't ground an answer, it says so and offers to broaden the search — never invents events.

## Build notes
- Use `useKinloChat()` from the AI Foundation.
- Persist chat history per user; entry points: Wall header, tab bar "+", empty states ("Not sure? Ask Kinlo").
- Guardrail: concierge only books events the user is eligible for; group-invite respects friends' privacy.
