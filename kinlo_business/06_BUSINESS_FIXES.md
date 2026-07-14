# 06 · Business — Round-2 Fixes (reviewed against the real repo)

> Reviewed `DuarTchock/Kinlo@main`. These are corrections to what shipped, mapped to the **actual files/screens**. Build in order, pause after each for review. All UI copy + comments in English. Match theme tokens (`src/constants/theme-tokens.js`). AI via existing `callClaude`. Everything Pro-gated via `src/config/entitlements.js` (`business_erp`).

---

## FIX 1 — Collapse to ONE "Your Business" hub + scope filter  ★ (priority 1)
**Problem (confirmed):** `src/screens/ManageScreen.js` renders a **"Business"** section (Analytics→`HostAnalytics`, Finance→`Finance`, Payments→`StripeConnect`, Membership plans→`MembershipPlans`, Ratings→`RatingsOverview`) **and** a **"Community"** section (Members→`HostCRM`, Groups→`HostGroups`). These duplicate what already lives inside `src/screens/business/BusinessHubScreen.js` (`BusinessDashboard`, `BusinessFinance`, `BusinessMembers`, `BusinessPackages`). The host sees **two Analytics, two Finance, two Members, two Membership surfaces** → confusion.

**Canonical decision:** the **`business/` module is the single source of truth.** The legacy `Host*`/`Finance`/`MembershipPlans` screens are superseded.

**Do:**
1. In `ManageScreen.js` **remove the `manage.business` and `manage.community` `<SectionHeader>`s and their cards.** Keep only:
   - **Create event** (primary),
   - the **"Kinlo for Business"** entry row (→ `BusinessHub`),
   - a **"This event"** section with event-scoped ops only: **Hosted events** (`MyEvents`), **Check-in scanner** (`CheckInScanner`), **Ratings** (`RatingsOverview`). (Groups stay under community elsewhere or inside the hub — not as a Manage peer of the ERP.)
2. In `BusinessHubScreen.js` add a **scope filter** at the top: a segmented control **`Whole business` | `This event ▸`** (default *Whole business*). Store the choice in local state + a `BusinessScopeContext`. `BusinessDashboard`, `BusinessFinance`, `MembersList` and analytics read the scope: *Whole business* = all data; *This event* = filter every query by the chosen `eventId` (a picker sheet lists the host's events). This is exactly the ask: the hub shows **one event's** numbers OR the **whole business** via the filter — so the old per-event "Business" section is redundant.
3. Point any lingering deep-links (e.g. from `EventDetail`) at the `Business*` screens, not the legacy ones. Leave the legacy screens in the repo but **unlinked** (dead) this round; delete in a later cleanup once parity is verified.

**Accept:** From Manage there is exactly ONE route to members, money, analytics and memberships — inside the hub. No metric appears in two places. The hub can scope to a single event.

---

## FIX 2 — Classes must REUSE CreateEventScreen  ★ (priority 2)
**Problem (confirmed):** `src/screens/business/ClassFormScreen.js` is a bespoke, reduced form (title, free-text instructor, weekdays, time, duration, capacity, location, public). It is missing everything `src/screens/CreateEventScreen.js` has: images, description, category, **two-tier Local/General pricing**, **membership credit**, cover, matching, etc. The user's instruction was: *a class is a Create-Event with recurrence + an instructor*, nothing less.

**Do:**
1. Make **`CreateEventScreen` the single form for events AND classes.** Add a `mode` route param: `mode: 'event' | 'class'` (default `'event'`).
2. When `mode==='class'`, additionally show: the **recurrence** control (reuse `src/utils/recurrenceUtils.js` — weekly weekdays or one-off) and a **required Instructor** picker (see FIX 3). Everything else (title, category, images, description, capacity+waitlist, two-tier price, membership credit) is the SAME component — do not re-implement.
3. Save through the existing services: `mode==='class'` → `businessClassesService.createClass/updateClass` (extend its payload to persist the full event-shaped fields: `images`, `description`, `category`, `priceLocal`, `price`, `twoTier`, `acceptsMembership`, `creditCost`, `capacity`, `waitlist`); `mode==='event'` → current path. Keep old class docs backward-compatible (missing fields default).
4. Delete the bespoke body of `ClassFormScreen` and have `BusinessClassForm` route render `CreateEventScreen` with `mode:'class'` (or thin-wrap it). `ClassesScreen` and `ClassRosterScreen` keep working (they read `title/time/instructor/capacity/roster`).

**Accept:** "New class" is visually and functionally the "Create event" screen + recurrence + instructor. A class can carry images, category, two-tier price and membership credit.

---

## FIX 3 — Instructor binding everywhere (root cause of the empty agenda)  ★
**Problem (confirmed):** `CreateEventScreen` has **no instructor field at all**, and `ClassFormScreen` stores `instructor` as a **free-text string**, not a staff reference. Nothing writes `instructorUid`. So events/classes can never be filtered onto a person's agenda — which is why the Agenda only shows a private session.

**Do:**
1. Build a small **`InstructorPicker`** (reads `businessStaffService` staff where role ∈ `owner|instructor`, plus "Me"). It returns `{ instructorUid, instructorName }`.
2. Add it to `CreateEventScreen` (shown for BOTH modes; required for `class`, optional for `event`). Persist `instructorUid` + `instructorName` on the event/class doc.
3. Replace the free-text instructor in the class flow with this picker. Migrate: if an old class has a string `instructor` and no `instructorUid`, keep showing the string until re-saved.
4. Bookings (`businessSessionsService`) already have a host; ensure they also carry `instructorUid` (default = current user) so private sessions land on the right agenda.

**Accept:** every event, class and session stores an `instructorUid`; the agenda can filter by it.

---

## FIX 4 — Agenda = a real calendar grid  ★ (priority 3 & 4)
**Problem (confirmed):** `BusinessAgenda` → `src/screens/business/SessionsAgendaScreen.js`, which is a **list** (requests + upcoming bookings). The grid seen in the screenshot uses **30-min lines**, a single **"You"**, and shows only sessions. Classes and events don't appear.

**Do — turn the agenda into a day calendar:**
1. **1-hour gridlines** (not 30-min). Events/classes/sessions can be **15/30/45/60/90 min or custom** — render each block at its true height. Reuse the existing **`src/components/DurationWheelModal.js`** as the duration picker when placing/creating an item (also replace the free-text "duration" `TextInput` in the class flow with it).
2. **Working hours per instructor:** each staff member has weekly working days + a start/end range (e.g. Mon–Sat 07:00–20:00). The grid **defaults its visible range to the selected instructor's working hours**; time outside is shown collapsed/greyed. Store `workingHours` on the `staff/{uid}` doc; add a "Working hours" editor in `StaffScreen`/availability.
3. **Merge all three sources** into the grid for the selected instructor + day: **events** (where `instructorUid` matches), **classes** (expanded from recurrence via `recurrenceUtils`), and **private sessions/bookings**. Colour by type — Event, Class, Private, Blocked — and show that legend (the current legend omits Private/Event).
4. **Block-off** stays: tapping empty time creates a class/session OR an "Unavailable" block (`agendaBlocks/{bizId}` with `staffUid,start,end,label`).
5. Keep the **requests inbox** (confirm/decline) from `SessionsAgendaScreen` — move it to a "Requests" tab or a banner above the grid; don't lose it.
6. **HH:mm** 24-h labels.

**Accept:** the agenda is a day grid with 1-hour lines and correctly-sized blocks; it shows events + classes + private sessions for the chosen instructor; duration is set with the wheel; each instructor's working hours frame the view; block-off works.

---

## FIX 5 — General / director agenda (all instructors)  ★ (priority 5)
**Do:** at the top of the agenda, an instructor selector with **"All"** first (director view) then one chip per staff member (the mockup shows this). 
- **All** = a multi-column/overlay day showing every instructor's schedule side by side (or a compact merged list grouped by instructor) so the director sees the whole studio at a glance.
- Selecting one instructor = that person's day (FIX 4).
Gate: reception role sees only check-in; owner/manager sees All.

**Accept:** the director can see every instructor's day in one view, or drill into one.

---

## FIX 6 — Bug: raw i18n key `business.payment.method.credit`  (priority: quick win)
**Problem (confirmed):** `BookingFormScreen` renders `t(\`business.payment.method.${p}\`)` for `PAID_WITH = [credit, cash, stripe, mercadopago]`. There is a `method` block in `en.json`/`es.json` (~line 2971) but it is **not** under `business.payment`, so the key resolves to the raw string shown in the screenshot.

**Do:** add a `business.payment.method` object in **both** `en.json` and `es.json`:
```
"payment": { "method": { "credit": "Membership credit" / "Crédito de membresía",
                          "cash": "Cash" / "Efectivo",
                          "stripe": "Stripe",
                          "mercadopago": "Mercado Pago" } }
```
(or repoint `BookingFormScreen` to the existing `method` path — but adding the keys is safer). Then **grep the app for any other raw `t(\`...\`)` template keys** and confirm none render literally.

**Accept:** the booking screen shows "Membership credit / Cash / Stripe / Mercado Pago"; no raw keys anywhere.

---

## Also found (fix alongside)
- **Two-tier pricing missing from classes & bookings.** Once FIX 2 lands, classes get it for free. Add Local/General to the private-session price too if the session is paid.
- **Membership credit timing.** `BookingFormScreen` sets `paidWith:'credit'` + `status:'confirmed'` at creation. Per `05` the credit must **deduct at check-in / session done**, not at reservation — align bookings with the same idempotent check-in deduction used for events/classes.
- **Duration as free text** in the class flow → use `DurationWheelModal` (15/30/45/60/90/custom).
- **Instructor free-text** (see FIX 3) → staff picker.
- **Legacy duplicates** (`HostAnalytics`, `Finance`, `HostCRM`, `MembershipPlans`, `HostMembershipsScreen`) — once unlinked (FIX 1), schedule deletion after parity is confirmed so the bundle doesn't carry two implementations.

## Global acceptance
1. One hub, one of each metric, scope filter (whole business / one event).
2. Class = Create-Event + recurrence + instructor.
3. Every event/class/session carries `instructorUid`.
4. Agenda: 1-hour grid, wheel-picked durations, per-instructor working hours, events+classes+sessions merged, block-off.
5. "All" director agenda + per-instructor.
6. No raw i18n keys.
