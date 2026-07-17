# Deploy sequence — Memberships unification (#30) + host-onboarding 3/3

Carlos runs this from **`main`, after merging #30**. Claude does not deploy or
migrate from the branch (CLAUDE.md §2: rules deploy from merged `main` only).

## Why the order is load-bearing

Two independent things ride on the SAME `firestore.rules` file, and
`firebase deploy --only firestore:rules` uploads the **whole file, not a delta**:

1. **`match /plans/{planId}`** — the new subcollection. Until it's deployed,
   every read of `plans` is denied, `listPlans` throws, and MembershipsScreen
   shows its (now honest) "couldn't read — the app is newer than the server"
   state instead of the empty state. This is BUG C's root cause.
2. **The host-onboarding hardening (deploy step 3/3, paused since #26)** — `role`
   and `hostConfig` become non-client-writable. Verified against the live
   ruleset on 2026-07-17: **prod has NEITHER** yet. So deploying rules here is
   **not purely additive** — it flips hosting activation to server-only in the
   same shot.

That second point is the prerequisite in step (a): the hardening only works if
clients already activate hosting through the `activateHost` / `deferHostType`
callables. A build from before #26 writes `role:'host'` directly, which the
hardened rule rejects — so those users could no longer become hosts. The new
client must be adopted on the device FIRST.

## The sequence

**(a) Confirm the new client is adopted on the test device.**
Host activation must go through the callables (`activateHost` / `deferHostType`),
not a direct `role` write. This is the gate that's been holding step 3/3. Verify
by activating hosting on the device and seeing it succeed against the CURRENT
(un-hardened) rules — proving the client uses the callable path before the rules
start requiring it.

**(b) Merge #30 to `main`.**

**(c) Deploy from `main` — rules + the new function + indexes:**
```bash
git checkout main && git pull origin main

# Rules: this ships host-onboarding 3/3 AND the plans rule together.
# NOT just additive — it makes role/hostConfig server-only. See above.
firebase deploy --only firestore:rules --project kinlo-app-dev

# The manual-assignment callable (Kinlo Pro gate lives here, server-side).
firebase deploy --only functions:assignPlanManually --project kinlo-app-dev

# Indexes, if any are pending.
firebase deploy --only firestore:indexes --project kinlo-app-dev
```

**(d) Migrate — dry run, audit, then apply:**
```bash
# Dry run: prints, per doc, source → dest and the credits/price mapping.
# Read it. Confirm the real "10" package maps the way you expect BEFORE --apply.
node scripts/migrate-plans.mjs

# Apply. Additive only: creates docs in `plans`, never touches packages /
# membershipPlans / any activePackage. Idempotent (migratedFrom). A bad run is
# undone by deleting the `plans` docs it created.
node scripts/migrate-plans.mjs --apply
```
A successful `--apply` prints the reminder to remove the transitional fallback
(grep `TRANSITIONAL — REMOVE AFTER PLANS MIGRATION`).

**(e) Verify pixels** on the device: MembershipsScreen shows the migrated "10" as
a manual membership, PlanFormScreen edits it, the online buy path filters
correctly, and the assign sheet works end-to-end against the real callable.

## Rollback notes

- **Rules:** re-deploy the previous `firestore.rules` from git history. The
  `plans` rule is additive, but the hardening is not — rolling back also
  un-hardens hosting activation.
- **Migration:** delete the `plans` docs the run created (they carry
  `migratedFrom`). Sources were never modified.
- **Fallback:** while `plans` is empty (before --apply, or after a rollback),
  HostMemberships still reads the legacy `membershipPlans`, so the attendee buy
  path keeps working throughout.
