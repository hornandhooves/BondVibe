# BondVibe — Scalability & Revenue Assessment

_Last updated: 2026-06. Grounded in the current codebase (commit on `main`)._

## TL;DR

- **Security & money model: solid and scalable.** Sensitive fields (reputation,
  membership credits, payments) are server-computed via Cloud Function triggers
  and protected by Firestore rules. 35/35 live end-to-end rule tests pass
  (`scripts/e2e-rules.js`). This is the hard part and it's done right.
- **Read/query model: NOT scalable as-is.** Several screens download whole
  collections to the client and filter in JS. This works for hundreds of
  events/users; it degrades (cost, latency) in the thousands and breaks the
  search experience well before that.
- **Revenue: one thin stream (5%).** The take rate is low, tips are
  un-monetized, and the recurring-revenue lever (premium subscription) is
  scaffolded but not the core of the model. The biggest upside is recurring
  host revenue + a richer fee mix, not raising the 5%.

---

## 1. What is already scalable & sound

| Area | Why it scales |
|------|---------------|
| **Reputation integrity** | `hostStats`/`carpoolStats` are written only by triggers (`onRatingCreated`, `onCarpoolRiderWritten`); rules block client writes — including at document creation. |
| **Money integrity** | `memberships`, `promotions`, credit reservations are server-only; clients can't forge them. Stripe Connect handles the actual money split. |
| **Per-user ownership** | Poll votes (`votes/{uid}`) and carpool seats (`riders/{uid}`) are keyed by uid and rule-guarded — tallying is manipulation-proof and naturally shards. |
| **Group access** | Membership/host checks via `get()` in rules; invite-join runs server-side (`joinGroupByCode`). |
| **Targeted live queries** | Notifications/unread badges use `where(userId==me)` indexed queries — these scale fine. |

The data model itself (events, ratings, memberships, groups as separate
collections with subcollections) is appropriate for Firestore.

---

## 2. Scalability risks (ranked)

> **Status (2026-06): the global full-collection reads + listener fan-out are
> resolved.** SearchEvents/feed is paginated with server-side keyword search
> (see §1 commits). `getPendingRatings`, `MyEventsScreen` (joined tab) and
> `getUnreadMessagesCount` now use targeted `where(attendees array-contains me)`
> / per-user aggregate queries instead of scanning all events.
> `useUnreadMessages` is a single per-user listener on the message-notification
> aggregate (was: whole-events listener + one listener per event). Verified by
> `scripts/e2e-rules.js` (38/38). **Still open:** incremental rating
> aggregation (`onRatingCreated`, per-host bounded) and the admin-only
> all-events/all-users reads.

### 🔴 High — Full-collection client reads

The client downloads **every** document and filters in memory:

| File | Pattern | Impact |
|------|---------|--------|
| `src/screens/SearchEventsScreen.js:124` | `getDocs(collection(db,"events"))` then filter in JS | Every search reads the entire events collection. Cost + latency grow linearly; unusable at ~5k+ events. |
| `src/services/ratingService.js:254` | reads all events to find "pending ratings" | O(total events) per user, per visit. |
| `src/screens/MyEventsScreen.js:141` | reads all events | Same. |
| `src/utils/messageService.js:440` | reads all events | Same. |
| `src/screens/AdminDashboardScreen.js:145`, `src/utils/adminService.js:311` | all events / all users | Admin-only, but unbounded. |

**Fix:** query server-side with `where` + `orderBy` + `limit` + `startAfter`
(pagination). For "events near me / upcoming", index on `date` and
`status`; for "pending ratings", store a per-user `attendedEventIds` or a
`ratings`-derived index rather than scanning all events.

### 🔴 High — Client-side search has a ceiling

`SearchEvents` does text/category/location/date filtering in JS over the full
collection. It can't do geo-radius, ranking, typo tolerance, or scale.

**Fix:** move search to a dedicated index — **Algolia** or **Typesense**
(synced from a Firestore trigger). Add geo search (geohash) for "near me".
This is the single biggest unlock for discovery (and discovery drives GMV).

### 🟠 Medium — Listener fan-out per event

`src/hooks/useUnreadMessages.js` opens **one `onSnapshot` per event** the user
attends. A power user in 50 events = 50 live listeners.

**Fix:** maintain a per-user `unreadCounts` map (updated by the message
trigger) and use a single listener on the user doc. O(1) listeners per user.

### 🟠 Medium — Aggregations recomputed by scanning

Rating averages are recomputed by reading all of a host's/event's ratings on
each new rating. Fine now; O(N) per write as a host accumulates reviews.

**Fix:** incremental aggregation — keep `sum` + `count` and update by delta in
the trigger (distributed counter if write rate is high).

### 🟢 Low — Notification fan-out loops

`onGroupMessage` / attendee notifications loop per recipient with sequential
awaits. Fine for typical group sizes; batch the sends (`Promise.all`, chunked)
before groups get large.

---

## 3. Revenue model today

Source of truth: `functions/stripe/pricing.js` (currency **MXN**).

| Stream | Platform take | Notes |
|--------|---------------|-------|
| Event tickets | **5%** platform fee (user also pays Stripe fee) | Host gets 100% of set price. |
| Memberships | **5%** (same model) | Host keeps the price. |
| **Tips** | **0%** | 100% to host — un-monetized. |
| Featured-event promotions | **100%** to platform | Already shipped. |
| Premium host subscription | $199 MXN/mo **defined** (`getPremiumSubscriptionPrice`) | Scaffolded; not the core. |

**Assessment:** the platform monetizes only paid tickets/memberships at a thin
5%. Free events (the majority of early-stage activity), tips, and engagement
generate **zero** revenue. Revenue is 100% transactional — no recurring base.

---

## 4. Revenue improvements (prioritized)

### P0 — Recurring revenue from hosts (highest leverage)
Turn the scaffolded **premium host subscription** into the core monetization:
- **Free tier:** basic events, 5% fee, limited groups/analytics.
- **Pro ($199–399 MXN/mo):** lower or 0% platform fee, unlimited groups,
  advanced analytics, featured credits/month, priority support, custom
  branding, membership tools.
- Why: recurring MRR is what makes the business predictable and fundable, and
  it converts your most engaged hosts (who already get value from groups,
  memberships, carpool, polls).

### P0 — Monetize discovery (boosts/featured)
Featured events exist; expand into a **self-serve promotion marketplace**:
boost in search results, "featured host", category spotlights, homepage
placement. Sells against the discovery you'll build in §2. High margin (100%).

### P1 — Take a cut of memberships / introduce tip fee
- Apply a small platform fee to **membership sales** (recurring host income →
  recurring platform income).
- A modest tip fee (e.g., 5–10%) or "round-up" — tips are currently 0%.

### P1 — Attendee-side premium
"BondVibe Plus" for attendees: no booking fees, early access to popular events,
exclusive/members-only events, profile perks. Converts demand-side users.

### P2 — Sponsored / brand partnerships
Once discovery + audience exist: sponsored events, brand-hosted categories,
local-business partnerships. Pairs naturally with groups (engaged communities).

---

## 5. Growth / "be successful" levers

- **Network effects are already in the product** — groups, carpool, invites,
  polls drive retention and viral loops. The new **invite links/codes** are a
  growth primitive: instrument them (track joins-per-invite) and lean in
  (referral rewards, "invite 3 friends" perks).
- **Reduce host churn** with the Pro toolset (analytics, CRM-style groups,
  recurring memberships) — hosts are the supply side; keeping them keeps GMV.
- **Discovery quality** (search + geo + ranking) is the top of the funnel.
  Fixing §2 isn't just cost control — better discovery → more bookings → more
  fees. It's a revenue project.
- **Trust** — the manipulation-proof ratings are a real moat; surface them
  ("verified reviews from real attendees").

---

## 6. Recommended sequencing

1. **Scale reads/search** (§2 high items) — prerequisite for growth and for
   selling promotion. Pagination first (quick win), then Algolia/Typesense +
   geo.
2. **Premium host subscription** (§4 P0) — recurring revenue.
3. **Promotion marketplace** expansion (§4 P0) — high-margin, builds on search.
4. **Membership/tip fees + attendee premium** (§4 P1).
5. **Aggregation + listener hardening** (§2 medium) — before large hosts/groups.

---

## Appendix — Running the E2E suite

```bash
node scripts/e2e-rules.js
```

Creates temporary Firebase Auth users + docs, exercises the **live** deployed
rules and callable functions across every feature (events, ratings,
anti-manipulation, memberships, polls, carpool, groups, group polls, invites),
and cleans up. Exits non-zero on any failure. Current: **35/35 pass.**
