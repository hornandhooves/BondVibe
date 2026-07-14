# 09 · Hotfix — host-cancel message + admin-check consistency

> Two small, safe fixes on top of round-4. Reviewed against `DuarTchock/Kinlo@main`. One commit each. English + tokens. **Not urgent, not user-blocking** — batch into the next deploy.

> ⚠️ Context correction: the round-1 security audit's **C1 (self-grant admin) is already FIXED & live-verified (2026-07-06)** — `firestore.rules` blocks a user setting `role:'admin'`, and `isAdmin()` prefers the `admin` custom claim. So there is **no open critical hole here.** FIX 2 below is only a defense-in-depth *consistency* cleanup, not a vulnerability patch.

---

## FIX 1 — Stale return message in `hostCancelEvent` (cosmetic) 🟡
**File:** `functions/stripe/refunds.js` → `exports.hostCancelEvent`.
**Problem:** the refund behavior is correct (host-cancel refunds GROSS incl. fees — `processRefund(..., 1.0, ..., true)`), and the **attendee notification is correct** ("refunded $X MXN in full, including all fees"). But the function's returned `message` still says the opposite:
```js
message: "Event cancelled. " + refundResults.length + " refunds processed (Stripe fees retained).",
```
"(Stripe fees retained)" contradicts the new policy. If any UI surfaces this returned message, it misleads the host.
**Do:** change it to reflect gross refunds, e.g.:
```js
message: "Event cancelled. " + refundResults.length +
         " attendees refunded in full (all fees included).",
```
Move the string to i18n if this message is shown in the UI (check the caller in `EventDetailScreen.js` ~L456/L569 — if it only logs, a plain string is fine). Keep EN/ES parity if i18n'd.
**Accept:** no "fees retained" wording on the host-cancel path; host-facing text matches the attendee's "full refund incl. fees."

---

## FIX 2 — Use the custom-claim admin check consistently (defense-in-depth) 🟡
**File:** `functions/stripe/refunds.js` → `hostCancelEvent` (the permission gate) + any other Cloud Function still doing an inline `userData.role === "admin"`.
**Problem:** `hostCancelEvent` authorizes admins with an **inline Firestore role read**:
```js
const userData = userDoc.data();
if (!userData || userData.role !== "admin") { throw ... "Only host or admin can cancel"; }
```
The audit's remediation added a claim-first helper **`isAdminUid()`** (checks `request.auth.token.admin` first, Firestore `role` only as fallback). This function doesn't use it. It's **safe today** (rules block self-promotion to `role:'admin'`), but it's inconsistent and would silently fail for a claim-only admin with no `role` doc field.
**Do:**
1. Replace the inline check with the existing helper: `isAdminUid(request.auth)` (or `isAdminUid(userId)` — match its real signature; grep `functions/` for `isAdminUid` / where the claim helper lives). Gate = `eventData.creatorId === userId || (await isAdminUid(request.auth))`.
2. Grep the whole `functions/` tree for any remaining `role === "admin"` / `role !== "admin"` inline checks (the audit flagged `functions/index.js:1991` and `stripe/refunds.js:427`) and route them through the same helper.
3. No rules change needed — this is server-code consistency only.
**Accept:** admin authority in Cloud Functions is uniformly claim-based via `isAdminUid()`; no inline `role === 'admin'` reads remain; host-cancel still works for the real host and for admins.

---

## Verify
- `firebase deploy --only functions` to the project your TestFlight build points to (see note below).
- Jest still green; a host-cancel on a paid test event still refunds gross and notifies "in full, including all fees."

## ⚠️ Deploy-target reminder (not a code fix)
Round-4's BUG 8 CF was deployed to **`kinlo-app-dev`**. Confirm that is the SAME Firebase project your TestFlight build talks to. If a separate **prod** project exists, these functions (and BUG 8) are NOT live for real users until deployed there too.
