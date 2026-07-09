# 13 · Bugs round-5 (reviewed against DuarTchock/BondVibe@d95f9df)

> OTA d95f9df verified real: `useInboxBadges` ✓, `BusinessScopeContext` ✓, handles service ✓, chat-scroll ✓, badges spec-12 ✓. These 6 remain. Each is mapped to the real file + line. EN/ES parity, theme tokens, no hardcoded colors, jest green, one commit per bug, push to main after each block.

---

## BUG 4 — Event length is +1h vs the wheel (timezone, not the picker)
**Files:** `src/utils/duration.js`, `src/components/DurationWheelModal.js`
**Observed (8:51):** header reads **"1h 15m"** while the spinner shows **"0 hours 15 min"** — a constant +60.
**Root cause:** `duration.js` encodes/decodes with **local** time (`new Date(2000,0,1,h,m)` + `getHours()`), but the iOS countdown `DateTimePicker` applies the **device timezone** to `value`/`onChange`. In a non-UTC zone (Mexico) the spinner's Date and `dateToMinutes()` drift. **The jest test passed only because CI runs in UTC** (local == UTC), so the round-4 "fix" never reproduced it.
**Fix — pin everything to UTC:**
1. `durationToDate(min)` → `new Date(Date.UTC(2000, 0, 1, Math.floor((m%1440)/60), m%60, 0, 0))`.
2. `dateToMinutes(d)` → `d.getUTCHours()*60 + d.getUTCMinutes()`.
3. In `DurationWheelModal`, add **`timeZoneOffsetInMinutes={0}`** to the `<DateTimePicker mode="countdown">` (RN-community honors it in spinner/countdown) so the native value is read/written in UTC.
4. **Test under a non-UTC TZ:** at the top of the duration test file set `process.env.TZ = "America/Mexico_City";` and assert roundtrips: `5→5, 15→15, 65→65, 180→180`, and `dateToMinutes(durationToDate(15)) === 15`. This is the test that must catch the regression.
**Accept:** header preview always equals the wheel; 0h 15m → "15 min", never "1h 15m".

## BUG 6 — Create Event doesn't validate instructor availability
**Files:** `src/services/businessAgendaService.js` (add helper), `src/screens/CreateEventScreen.js` (submit ~L585 before the write at L593/604), `src/screens/business/BookingFormScreen.js` (submit), `src/screens/business/AgendaScreen.js` (already has `runWithPlacementCheck` but only guesses 60 min at slot-tap).
**Do:**
1. Add `checkInstructorAvailability({ instructorUid, instructorName, start /*Date*/, durationMin })` to `businessAgendaService.js`: load `getDayItems(instructorUid, instructorName, start)` + the staff member's `getWorkingHours`; return `{ conflict, conflictItem, outOfHours }` by testing the **full** `[start, start+durationMin)` window for overlap against every non-blocked item, and against the working-hours range **and working day** (`wh.days`).
2. Call it at **CreateEvent submit** with the chosen `instructorUid`, `eventDate`, `durationMinutes` (real values — not the 60-min guess). On conflict/out-of-hours show the existing warn dialog (`business.agenda.conflictMsg` / `outOfHoursMsg`) with **Cancel / Book anyway**; only write on confirm. Same at **BookingForm submit**.
3. In `AgendaScreen`, keep the slot-tap nicety but the authoritative check is now at submit (real duration).
**⚠ One decision for you:** overlap = **warn-and-allow** (matches today's UX, my default) or **hard-block**? Tell me and I'll set it; the spec ships warn-with-confirm.
**Accept:** creating an event/session for an instructor who's busy in that window, or outside their hours, warns before saving; a free slot saves with no prompt.

## BUG 7 — Agenda Day: huge empty gap; instructor row must be a tight carousel
**File:** `src/screens/business/AgendaScreen.js`
**Root cause (8:23):** the horizontal strips (`dayStrip`, `staffStrip`, `viewRow`) are `<ScrollView horizontal>` with **no height constraint**, so in the flex column they stretch vertically and shove the grid to the bottom (the "floating chips + void").
**Fix:** give every horizontal ScrollView `style={{ flexGrow: 0 }}` (keep the day grid / "all" list at `flex: 1`). Tighten `staffStrip` + `legend` vertical padding so the instructor carousel sits **directly above** the grid. Verify both modes: single-instructor grid AND "All" list.
**Accept:** compact instructor carousel right under the date strip; grid/list starts immediately under the legend, no dead band.

## BUG 7.1 — Working hours: 24h hint + instructor dropdown (+ All) ; Staff handle/remove already exist
**Files:** `src/screens/business/AgendaScreen.js` (wh modal), `src/screens/business/StaffScreen.js` (wh modal)
1. **24h format hint:** in both working-hours editors add a visible hint "**24-hour format · HH:MM**" by the start/end inputs; constrain to numeric HH:MM and reject invalid values (00–23 : 00–59) on save.
2. **Instructor selector in the Agenda wh editor:** add a picker at the top of the modal, default = the selected chip, plus an **"All staff"** option. Today `openWorkingHours` silently targets the owner when "All" is selected — replace with an explicit selector; on save with **All staff**, loop `setWorkingHours` over every owner+instructor.
3. **Bidirectional sync — already wired:** both screens read/write the same `businesses/{bizId}/staff/{uid}.workingHours` via `getWorkingHours`/`setWorkingHours` and reload on focus, so an edit in Agenda shows in Staff and vice-versa. Just confirm no stale cache.
4. **Staff handle search + remove — already implemented:** `StaffScreen` invite sheet has `UserSearchField` → `inviteStaffByHandle`, and each non-owner row has a **×** → `removeStaff`. (User likely didn't see the handle field — it's inside the **+** sheet.) Optional polish: label it clearly. No new backend needed.

## BUG 17 — Move "Whole business / Choose event" INTO Dashboard
**Files:** `src/screens/business/BusinessHubScreen.js` (remove), `src/screens/business/BusinessDashboardScreen.js` (add)
**Observed (8:15):** the scope segment still sits at the hub top, above the Dashboard row. Round-4 left it in the hub's Overview section — the ask is to put it **inside the Dashboard screen**.
**Do:**
1. In `BusinessHubScreen`, **remove** the `scopeTrack` segment, the `scopeClear` link, the event-picker `Modal`, and the `openEventPicker`/`pickerOpen`/`events` state. Overview becomes just the Dashboard row.
2. In `BusinessDashboardScreen`, **add** the `Whole business | Choose event ▾` control at the top of the ScrollView (above the range chips) — move the picker Modal + state there. It already consumes `useBusinessScope()` and renders event-scoped stats, so only the control moves.
3. Keep `BusinessScopeContext`; ensure the label reads **"Choose event"** (`business.hub.scopeEvent`).
**Accept:** hub top = business header + section rows only; the scope switch lives in Dashboard and drives the KPIs.

## BUG 24 — Rename "Momentum board" → "Member health status" + multi-select filters
**Files:** `src/screens/business/MomentumBoardScreen.js`, `src/i18n/locales/{en,es}.json`, `src/constants/momentumDefaults.js` (default board name)
1. **Rename hub row:** `business.hub.momentumTitle` → **"Member health status"**, subtitle e.g. "Who needs attention · at-risk → recovered". (Keep the route name `MomentumBoard`.)
2. **Screen title:** set `business.momentum.title` → **"Member health status"** and change the default board name so the header reads it instead of "Momentum" (existing custom names stay). 
3. **Filter section title:** add a **"Health status"** heading above the priority chips row.
4. **Multi-select filters (min 1, max all):** change `priorityFilter` (scalar) → a set `priorityFilters`. **All** = every level (clears the specific set); tapping a level toggles it; removing the last selected snaps back to **All**. `visibleCards = cards.filter(c => allSelected || set.has(c.priority))`, shown across all columns.
**Accept:** the board reads "Member health status", the filters are titled "Health status", and you can select any 1–5 of All/Urgent/High/Medium/Low to filter the members shown.

---
### Order
P0 first (daily annoyances): **4 → 7 → 17 → 24**, then **6 → 7.1**. One commit per bug, pause after each, push to main. Answer the BUG 6 warn-vs-block question before I start #6.
