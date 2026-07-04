# 16 · AI Analytics (host) + AI observability

Two things named "analytics": **(A)** the host-facing feature where Claude reads their numbers, and **(B)** how *you* measure the AI itself. Both here.

Mockup: phone 07 in `Kinlo AI Analytics & Integration.dc.html`.

---

## A) AI Analytics — host feature (Kinlo Pro)

### What Claude does
1. **Reads the month** — a grounded narrative of what's driving results ("Revenue up 18%, driven by the sunrise slot; Community Matching drove 12 repeat bookings; Tuesdays under-fill").
2. **Surfaces the metrics that matter** — revenue/MRR, repeat rate, check-in rate, matches→rebookings.
3. **Recommends next actions** — concrete, ranked ("Move Tuesday yoga to Saturday 8 AM, +6 expected"; "Launch a monthly membership, 42 regulars qualify").

### Screen (match mockup 07)
- Header + PRO badge.
- **AICard** "Kinlo AI read your month" (narrative).
- Metric tiles (Revenue/MRR ↑, Repeat rate, Check-in rate, Matches→rebook).
- Revenue-by-month bar chart.
- "What to do next · AI" recommendation rows.
- Footer: "Aggregated only · AI never shows who liked or messaged whom."

### Data Claude receives (AGGREGATE ONLY)
```
{ period:"2026-06",
  metrics:{ revenue, revenueDeltaPct, mrr, repeatRatePct, checkinRatePct, matchesToRebook },
  events:[{ title, day, price, capacity, attended }],
  members:{ regulars, lapsingCount } }
```
Never individual likes/DMs/match pairs.

### Output schema
```json
{ "narrative":"Revenue is up 18%, driven by the new sunrise slot. Community Matching drove 12 repeat bookings. Tuesday events under-fill — try weekends.",
  "metrics":{ "revenue":2140,"revenueDeltaPct":18,"repeatRatePct":63,"checkinRatePct":81,"matchesToRebook":12 },
  "recommendations":[
    { "text":"Move Tuesday yoga to Saturday 8 AM","expectedImpact":"+6 attendees" },
    { "text":"Launch a monthly membership","expectedImpact":"42 regulars qualify" } ] }
```
Label predictions as estimates. If data is thin, show raw metrics without the narrative.

### Build notes
- One grounded call, cached; recompute on new event close or weekly.
- Reuses existing host analytics data + Stripe + Community Matching aggregates.

---

## B) AI observability — measure the AI itself

Log every `callClaude` (feature, tokens, latency, outcome) to a `aiEvents` collection. Dashboards to build:

| Metric | Why it matters |
|---|---|
| **Suggestion acceptance rate** (per feature) | Did users act on AI output? Core quality signal. Target >30% for Smart Wall picks, >20% for concierge cards. |
| **AI-attributed RSVPs / rebookings** | Revenue impact — RSVPs where the user came via an AI card. Ties AI to the North Star. |
| **Fallback rate** | How often AI was unavailable / ungrounded. Keep <2%. |
| **Tokens & cost per active user** | Unit economics; alert on spikes. |
| **Latency p50/p95** | UX; concierge should stream, non-chat <2.5s p95. |
| **Opt-in rate & opt-outs** | Trust signal for the AI program. |
| **Moderation flags** (match safety) | Safety health; route to review queue. |

### North Star linkage
The AI program's success = lift in **connected attendances / month**. Instrument an A/B: users with Kinlo AI on vs off → compare repeat attendance, invites that convert, and host revenue. Report this to prove the differentiator.

### Privacy
Observability logs are **aggregate + PII-stripped**. Never log full prompts containing personal data in plaintext; store references/ids. Attendee AI usage honors opt-out and deletion.
