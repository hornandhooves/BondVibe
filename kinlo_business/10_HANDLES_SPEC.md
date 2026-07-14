# 10 · Unique @handles — spec (reviewed against DuarTchock/Kinlo@main)

> App-wide feature: a **unique, permanent, case-insensitive @handle per user** (Instagram-style) used to **find** people and to power DMs, follows, group-add, community invites, CRM add, and @mentions/tags. English UI + EN/ES parity. Theme tokens. Uniqueness is **server-enforced** — never trust the client.

## Why / where it plugs in (current state)
- Users today are discoverable **only by email/phone** (`hostGroupService.findUserByEmail` / `findUserByPhone`, used in `GroupManageScreen` + `EditEventScreen`). There is **no** username, no user search, no `publicProfiles`.
- DMs start from a `uid` (`dmService.getOrCreateThread(otherUid)`); follows are by `uid` (`followService`). So today you can only DM/follow someone whose profile you already reached — a handle unlocks *finding* them.
- The Profile/Identity mockups already **show** an `@handle` under the name (e.g. `@camilarestrepo`) — this makes that real.
- Related round-4 items this completes: **BUG 14** (tap a name → profile), **BUG 22** (community invite — add by handle too).

---

## 1. Data model
**On the user doc** (`users/{uid}`, created at `SignupScreen.js:100`):
- `handle` — the display form as the user typed it (e.g. `Camila.Restrepo`). Optional cosmetic casing.
- `handleLower` — canonical lowercase (e.g. `camila.restrepo`). **This is the unique key** and what all lookups use.

**Uniqueness registry** (Firestore has no unique constraint — use the standard reservation-doc pattern):
- `handles/{handleLower}` → `{ uid, claimedAt }`. The doc **id IS the handle**, so a transaction that creates it iff it doesn't exist guarantees global uniqueness.
- **Permanent + non-reusable ("irrepetible"):** on account deletion, do **not** delete the `handles/{handleLower}` doc — tombstone it (`{ uid:null, releasedAt, formerUid }`) so a handle is never recycled to a different person. (If you later want release-after-N-days, that's a config knob; default = never.)

## 2. Rules (validation) — enforce on the server, mirror in the client for UX
- Charset: `^[a-z_]{3,30}$` — **letters a–z + underscore ONLY** (user decision: no digits, no dots). Normalize to lowercase; store `handleLower`. Must contain **at least one letter** (block an all-underscore handle).
- No leading/trailing `_`; no consecutive `__` (prevents look-alikes).
- **Reserved list** (blocked): `admin, kinlo, support, help, official, root, moderator, staff, team, security, about, settings, me, you, null, undefined` + brand terms. Keep it in one config array.
- Profanity/impersonation screen (reuse `functions/contentGuard.js`).
- Case-insensitive uniqueness via `handleLower`.

## 3. Claiming — server-only (Cloud Function)
`claimHandle({ handle })` callable:
1. Normalize → `handleLower`; validate charset/reserved/profanity.
2. Firestore **transaction**: read `handles/{handleLower}`; if it exists (and isn't this user's) → throw `already-taken`; else create it `{uid, claimedAt}` and set `handle`/`handleLower` on `users/{uid}`.
3. Rate-limit (e.g. a few attempts/min) to stop enumeration.
- **Permanent — never user-changeable (user decision):** once set, the client shows **no change UI, ever**. The only way to change a handle is an **admin override** (`adminReassignHandle`), which tombstones the old handle (never recycled). No self-change flag.
- `firestore.rules`: `handles/{h}` → `allow read: if isSignedIn(); allow write: if false;` (writes only via Admin SDK). Add `handle`/`handleLower` to the **user-doc update blocklist** so a client can't set them directly (must go through `claimHandle`).

## 4. Assignment flows
- **New signups:** add a **"Choose your handle"** step to onboarding (after account creation, `SignupScreen`). Pre-fill a suggestion from their name (`camila.restrepo`, then `camila.restrepo1`…), live availability check (debounced call to a lightweight `checkHandle` or a rules-allowed read of `handles/{h}`), confirm → `claimHandle`.
- **Existing users (backfill):** on next launch, if `!handleLower`, show a one-time **blocking** "Pick your handle" sheet (can't skip — everything keys off it). Auto-suggest from name; let them edit. Backfill script optional to pre-generate suggestions, but the user must confirm (handles are identity).

## 5. Search — the payoff
New `userService.searchUsers(prefix)`:
- Query `users` where `handleLower >= q && handleLower <= q + '\uf8ff'` (prefix range; add the composite index) — plus a name prefix pass (`nameLower`). Merge, dedupe, cap ~20.
- Return a **public projection only**: `{ uid, handle, name, avatar, city }` — never email/phone (respects the H6 PII fix; those stay in Auth / the private subcollection).
- Respect blocks (`blockService`): filter out users who blocked me / I blocked.
- New **"Search people"** UI: a search field (`@handle` or name) with result rows → each row taps to the user's profile (**BUG 14**) and has quick **Message / Follow / Add** actions.

## 6. Wire handles into every consumer
- **DMs** (`dmService`): "New message" → search by handle → `getOrCreateThread(uid)`.
- **Follows** (`followService`): follow from search/profile.
- **Groups** (`hostGroupService.addMember…`, `GroupManageScreen`): add members **by @handle** *in addition to* the existing email/phone (`findUserByHandle` alongside `findUserByEmail`/`findUserByPhone`).
- **Community invite (BUG 22):** invite by handle too.
- **CRM add member** (`businessMembersService` / `crmService`): look up an app user by handle to link the record (`linkedUid`).
- **@mentions / tags:** in chat composers (`GroupChatScreen`, event/DM/match) and posts (`postService`), typing `@` opens a handle **autocomplete**; a committed mention renders as a **tappable link → profile** and (optionally) fires a "you were mentioned" notification via the server-side `createNotification`. This is the "tags" ask.
- **Profile:** show `@handle` under the name everywhere a profile/name appears (Identity, Profile, attendee lists, chat headers).

## 7. Notifications & privacy
- Mentions/DM-from-search route through the existing **server-side** `createNotification` (never client-forged).
- Handles are **public and searchable by design** (that's the point) — but blocked users never surface to each other, and a handle exposes no PII beyond the public projection.

## Acceptance
1. Every user has a unique, permanent `handleLower`; two users can never hold the same one; deleting an account never frees a handle for reuse.
2. New users pick a handle in onboarding; existing users are prompted once and can't proceed without one.
3. `searchUsers` finds people by @handle or name and returns only public fields.
4. DMs, follows, group-add, community invite, CRM link, and @mentions all work via handle.
5. Uniqueness + claiming are server-enforced; the client can't set `handle`/`handleLower` directly; reserved/profane handles are rejected.
6. EN/ES parity; jest green; new composite index deployed.
