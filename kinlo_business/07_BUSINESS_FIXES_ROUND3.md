# 07 · Business — Round-3 Fixes (from QA on the running build)

> ✅ **Verified on `main` @ `1ab4f73` (round-2 merged).** Several pieces already exist — **do NOT rebuild them**, only the deltas below:
> - `AgendaScreen.js` = the day grid (instructor chips + All, 1-hour rows framed by working hours, block-off, requests inbox, legend, "All" = grouped list). ✔
> - Working-hours editor lives in `StaffScreen`. ✔ · `InstructorPicker` exists in `CreateEventScreen` (persists `instructorUid`/`instructorName`). ✔ · `ClassFormScreen` now reuses `CreateEvent`. ✔

Reviewed against the real repo. Each item: the file(s), the confirmed cause, the fix. English UI + comments, theme tokens, AI via `callClaude`, Pro-gated via `entitlements.js`.

---

## 1 — Check-in: two lists + manual toggle + QR entry  (`src/screens/EventCheckInScreen.js`)
**Now:** builds `rows` from attendees, but only membership reservations get a "Check in" button; paid/free attendees show a label with **no** action; no un-check; single flat list; no QR affordance. (Screenshot shows "No attendees yet".)
**Fix:**
- Split the list into two sections: **Checked in** and **Not checked in** (count in each header).
- Give **every** attendee a tappable **Check in / Undo** toggle (not only membership ones). Toggling moves them between sections.
- Preserve credit logic: for a membership reservation, checking in calls `redeemMembershipCredit` (deduct, idempotent); undo returns the credit. Paid/free just flip a `checkedIn` flag on the attendee/reservation.
- Add a **QR icon top-right** in the header that opens the existing camera scanner — reuse **`BusinessCheckInScreen`** (`checkInFromBusinessScan`, pass format `bizpass:{bizId}:{memberId}`) / `CheckInScannerScreen`. A successful scan marks that attendee checked-in in the same list. **Validate the existing scanner works and reuse it — do not build a new one.**

## 2 — Rename "Automations" → "Automatic notifications"  (`AutomationsScreen.js`, `AutomationFormScreen.js`, `MessageLogScreen.js`, hub row)
Non-technical hosts don't parse "automations". Rename all **user-facing** copy (keep code symbols/routes): screen titles, the hub row `business.hub.automationsTitle`/`Subtitle`, empty state, buttons. Use **"Automatic notifications"** (or "Auto reminders"). Update `en.json` + `es.json` for every child string. Keep the megaphone icon.

## 3 — My Memberships: show credits + tap for history  (`src/screens/MyMembershipsScreen.js`)
**Bug (confirmed):** line ~102 `t("myMemberships.classesLeft", { remaining, total })` — the locale only defines the **plural** keys `classesLeft_one` / `classesLeft_other`, which i18next resolves via **`count`**. No `count` is passed → no key matches → the raw string `myMemberships.classesLeft` renders (screenshot).
**Fix:**
- Pass `count`: `t("myMemberships.classesLeft", { count: remaining, remaining, total })`.
- **Remove the "unlimited" branch** (`unlimitedText` / `MEMBERSHIP_PLAN_TYPES.CREDITS` else-path) — memberships are credit+expiry only now (per `05` §G). Every card shows "X of Y left" + the progress bar + expiry.
- **Make each card tappable → utilization history**: a screen/modal listing every redemption for that membership — **date + class/event name + credits spent** — newest first. Source: query the member's redeemed reservations (`membershipService`; reservations with `status:'redeemed'` carry the event/class ref + timestamp). Show running balance.

## 4 — Staff: invite by real account email + host-managed roles/permissions  (`StaffScreen.js`, `businessStaffService.js`, CF `inviteBusinessStaff`)
**Now:** `inviteStaff` → CF returns `not_found` unless an account matches; the sheet offers only Instructor/Reception. A normal Gmail failed (screenshot).
**Fix — invite:**
- The invite email must match **the email the person used to create their Kinlo account** (any provider, incl. Gmail). In the CF, **normalize (trim + lowercase)** and look up by Firebase Auth (`getUserByEmail`) and/or `users.email`; case-insensitive.
- If no account yet, **create a pending invite** keyed by the email that **auto-links when they sign up/log in** (same pattern as CRM member auto-link) instead of hard-failing. Show "Invitation pending — links when they join."
**Fix — roles & permissions (design this):**
- Roles are **defined per business and renamable** (user decision: by-role, editable names). Seed four defaults the owner can rename or extend: **Owner** (all, not editable/removable), **Manager** (all except Finance + Staff by default), **Instructor** (own agenda + classes + check-in + members read), **Reception** (check-in + members read; no finance). Owner can **rename** any non-owner role and **add** new roles.
- Add a **permission matrix** the owner controls: for each role, toggle access to each Business area — `Dashboard, Members, Memberships/Packages, Finance, Classes, Agenda, Check-in, Automatic notifications, Momentum, Branches, Staff`. Store on `businesses/{bizId}/roles/{roleId}: { name, editableName, perms:{area:true/false} }`; seed the defaults above on setup. A "Roles" sub-screen (from `StaffScreen`) lists roles → tap to rename + toggle perms.
- `useEntitlement`/route guards read the staff member's role perms (in addition to Pro). Reception opening Finance → blocked. The hub hides areas the role can't access.
- Staff invite sheet: pick role from the business's roles; owner can edit a role's perms from `StaffScreen` (or a "Roles" sub-screen).

## 5 — Agenda: finish the Google-Calendar parity  ★ stakeholder-critical
`AgendaScreen.js` already renders a per-instructor **day grid** (1-hour rows, working-hours frame, block-off, requests inbox, All=grouped list). Only these **deltas** remain:
1. **Header `+` → `CreateEvent`** (top-right). Today the header has only the clock, and the empty-slot sheet offers "New session" (booking) + "Block off" — there is **no Create-Event entry**. Add a `+` that opens the existing `CreateEvent` (prefill the selected date + tapped hour + `instructorUid` = the selected chip). Keep "New session"/"Block off" on the slot sheet; add "Create event" there too.
2. **Clock icon → edit working hours** (not the 24h toggle). The user wants the clock to **set the working schedule**. Repoint the clock to open the **working-hours editor** for the selected instructor (reuse the `StaffScreen` modal logic: days + start/end, saved via `setWorkingHours`). Move the current expand-to-24h onto a small "full day" chip/long-press instead.
3. **Day / Week / Month / Year views.** Today it's day-only (a 14-day strip). Add a view switcher; Week = 7 day-columns of the same hour grid, Month = calendar cells with dots/counts, Year = month grid. Keep the instructor filter across views.
4. **Delete from the agenda** via the existing recurring-delete modal (this / this-and-following / all in series). Opening an event goes to `EventDetail` — make sure that delete modal is reachable from there (or add a delete action on the agenda block) and reused, not forked.
5. **Public listing works** (see item 9): an event created from the `+` with the public toggle ON appears in Search/discovery.
6. **Fold in & remove duplicates from the hub.** `BusinessHubScreen` currently links BOTH `BusinessAgendaDay` (the grid) **and** `BusinessAgenda` (old `SessionsAgendaScreen`), plus `Classes`. Remove the **old agenda row** and the **Classes row** — the grid covers browsing + creation + requests. Class creation persists via `CreateEvent` (mode class, from the `+`). Hub **Agenda subtitle → "Schedule events, manage agenda"**.

## 6 — Instructor picker shows real staff  (`components/business/InstructorPicker`)
The `InstructorPicker` already exists and persists `instructorUid`. The screenshot shows only "Me" because **no staff are accepted yet — invites fail (item 4).** So: (a) **verify `InstructorPicker` lists staff** from `listStaff()` (roles owner/instructor) + "Me"; if it doesn't, wire it. (b) This is fully unblocked once item 4 lands. Confirm a created event/class with a chosen instructor lands on **that instructor's Agenda** (AgendaScreen already filters by `instructorUid`).

## 7 — Edit from the agenda  (detail screens the agenda opens)
The agenda already routes: event → `EventDetail`, session → `SessionDetailScreen`, class → `BusinessClassRoster`. Add an **"Edit"** action on each:
- `EventDetail` (host) → the existing **`EditEventScreen`**.
- `SessionDetailScreen` → edit the booking (`BookingForm` in edit mode: time/type/member/location).
- Class roster → open `CreateEvent` (mode class) in edit.
Put it top-right of the detail as "Edit".

## 8 — Bug: "Event length" ≠ wheel value  (`CreateEventScreen`, `DurationWheelModal.js`)
**Cause:** the field's displayed value and the modal's committed value aren't a single source of truth (screenshot: field "2 hours" while the wheel sits on "1 h 0 m").
**Fix:** store duration once as **`durationMin` (integer minutes)** on the form. Pass it as the modal's `value` so the wheel **opens on the current value**; on `onSelect(minutes)` store that string verbatim; display the field with the **same `formatDuration(durationMin)`** the modal previews. Verify the iOS `countdown` picker initializes to `value` (not the hard-coded `durationToDate(180)`), and that closing without change keeps the value. Round-trip test: 90 → open → shows 1h30 → Done → field shows "1h 30m".

## 9 — Public events must appear in Search + Hosting  (`CreateEventScreen` write, discovery query)
**Now:** events toggled public don't show in the global search/all-events list (they do show in Hosting).
**Fix:** ensure the created/edited event doc carries **every field the discovery/search query filters on** — published `status`, a discovery `category`, a `city`/location the search uses, and a public `visibility` (mirror what `publishClassToDiscovery` writes for classes: it builds a discoverable `events` doc with `creatorId`, category, city). Align CreateEvent's write with that shape. Recurring series: each occurrence (or the parent with future instances) must be discoverable. Verify a freshly-created public event appears in Search **and** Hosting; a private one appears only in Hosting.

---

## Global acceptance
1. Check-in: two sections, manual toggle on every attendee, working QR entry (reused).
2. "Automatic notifications" everywhere (no "automations").
3. My Memberships shows "X of Y left" (no raw key, no unlimited) + tap → redemption history.
4. Staff invite works with any real account email + pending invites; owner-managed role permissions gate Business areas.
5. Agenda is a Day/Week/Month/Year calendar; `+`→CreateEvent; clock→working hours; delete via the series modal; Classes + Session&requests folded in.
6. Instructor picker = staff list; item lands on that instructor's agenda.
7. Edit event/class/session from the agenda.
8. Event-length field always equals the wheel selection.
9. Public events appear in Search and Hosting; private only in Hosting.
