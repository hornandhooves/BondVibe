# 12 · Host Copilot — draft an event in seconds

**Pillar:** Host · **Users:** hosts (Kinlo Pro) · **Mockup:** phone 03

## What it is
The host types a rough idea; Claude drafts the **full event** — title, description, **suggested price**, **predicted turnout**, and best time to post — all grounded in the host's own past events.

## What Claude does
1. Expands a one-line idea into a polished title + description (on-brand, warm, English).
2. **Suggests a price** using the host's past fill rates and comparable events.
3. **Predicts turnout** ("~17/20") from the host's last N events + community size.
4. Recommends **best publish time** from when the host's members open Kinlo.
5. Regenerate / edit any field.

## Screen (match mockup 03)
- "Just type the idea" input → **Draft with AI** (gradient).
- "Claude drafted this" eyebrow → generated title + description card.
- Two tiles: **Suggested price** (with "optimal for fill"), **Predicted turnout** ("from last 4 events").
- Tip card: best time to post.
- **Use draft** + regenerate.

## Data Claude receives
```
{ host:{ pastEvents:[{title,price,capacity,attended,vibeId}], memberCount, openTimes:[] },
  idea:"sunset rooftop yoga + live cello, 20 spots" }
```

## Output schema
```json
{ "title":"Golden Hour Flow & Cello",
  "description":"...",
  "priceSuggestion":{ "amount":18, "currency":"USD", "rationale":"optimal for fill" },
  "turnoutPrediction":{ "expected":17, "capacity":20, "basis":"last 4 events" },
  "bestPostTime":{ "day":"Tue","hour":19 } }
```
Predictions are estimates — label them as such; never present as guarantees. If the host has too few past events, hide price/turnout and just draft copy.

## Build notes
- Part of **Kinlo Pro** host tools (gate accordingly).
- Feeds directly into the existing event-create form (prefill fields).
- Reuses host analytics for the grounding data.
