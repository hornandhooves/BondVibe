# 13 · Member Intelligence — keep your community warm

**Pillar:** Host · **Users:** hosts (Kinlo Pro) · **Mockup:** phone 04

## What it is
Claude reads the host's **aggregated** member activity and surfaces what a spreadsheet never could: overall sentiment, who's cooling off, and a ready-to-send **win-back message** — one tap to send.

## What Claude does
1. Summarizes **community pulse** in a sentence ("Sentiment positive 88% — people love the new sunrise slot").
2. Detects **cooling-off** members (attended before, absent N weeks) as a count + segment.
3. **Drafts a win-back broadcast** tailored to why they lapsed and what's new.
4. (Optional) suggests the next event theme from what members engage with.

## Screen (match mockup 04)
- **AICard:** "AI community pulse" + sentiment + cooling-off callout.
- Metric tiles: Sentiment %, Cooling off (count), Regulars.
- **AI-drafted win-back** card (audience avatars + editable message) → **Send to N**.
- Footer: "Aggregated & privacy-safe · AI never exposes individual DMs".

## Data Claude receives (AGGREGATE ONLY)
```
{ members:{ total, regulars, lapsingCount, lapsingSegment:"attended 3+, absent 3wk" },
  sentiment:{ score, sampleThemes:["loves sunrise slot","asks for parking"] },   // from opt-in feedback/reviews, aggregated
  upcoming:[{title,startsAt}] }
```
**Never** send individual DMs, likes, or match data to this feature.

## Output schema
```json
{ "pulse":"Sentiment is positive (88%) — people love the new sunrise slot. 6 regulars haven't shown in 3 weeks.",
  "metrics":{ "sentiment":88, "coolingOff":6, "regulars":42 },
  "winBack":{ "audienceCount":6, "message":"Hey! We've missed you at Sunrise Yoga 🌅 Saturday we're adding live cello — saved you a mat. Come flow?" } }
```

## Build notes
- Sends via the host **broadcast** system (targeted, measurable) — replaces WhatsApp spam.
- Sentiment source = opt-in reviews/feedback only, aggregated; no scraping of private chats.
- Gate behind Kinlo Pro. Reuses host CRM + analytics.
