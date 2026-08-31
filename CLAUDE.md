# CLAUDE.md — Kinlo (Kinlo) working agreement

Read this before working. It captures the conventions and gotchas of THIS repo so
every Claude (and every dev) behaves consistently. Keep it updated when a rule
changes.

**Project:** Kinlo — an Expo / React Native app (Expo SDK 54) with a Firebase
backend. Two sides in one app: the attendee/social app, and **"Kinlo for
Business"** (a host CRM/ERP: members, packages, attendance/check-in, finance,
dashboard). App scheme is `kinlo://`; the git repo is still `hornandhooves/BondVibe`.

---

## 0. Golden rules (read these first)
1. **Never push directly to `main`.** Branch → Pull Request → merge. (See §1.)
2. **Every new user-facing string goes in BOTH `en.json` and `es.json`** with the
   same key path. EN/ES parity is enforced. (See §3.)
3. **A new Firestore subcollection needs a rule in `firestore.rules` + a deploy**,
   or reads/writes fail with `Missing or insufficient permissions`. (See §4.)
4. **`jest` must stay green.** Run `CI=true npx jest` before you finish.
5. **Never fabricate data.** If a metric has no real source, show `"—"` (the
   honest-null pattern), don't invent a number.
6. **Never commit secrets.** `google-play-service-account.json`,
   `*-firebase-adminsdk-*.json`, `ANTHROPIC_API_KEY`, `.env` — all gitignored,
   keep it that way.
7. **A `setLoading(true)`/`setSaving(true)` must always resolve back to `false`,
   even on failure.** Use `useAsyncLoad()` (or wrap the risky call in
   try/catch/finally) — an unguarded `await`/`Promise.all(...)`/`.then(...)` that
   rejects leaves the UI stuck forever (a spinner that never resolves, a button
   stuck disabled). This reproduced independently 35+ times (KIN-92/94/95)
   before it had a name; it's now a lint error, not a convention to remember.
   (See §7.)

---

## 1. Git & collaboration (two+ devs in parallel)
- Work on a branch, never on `main`:
  ```bash
  git checkout main && git pull origin main
  git checkout -b feat/<short-name>
  # ...commit...
  git push -u origin feat/<short-name>
  # open a PR on GitHub → review → merge
  ```
- Pull `main` into your branch often (`git merge origin/main`) to resolve
  conflicts early. Keep PRs small.
- **Hot files** two devs will both edit — expect conflicts, coordinate / merge
  often: `src/navigation/AppNavigator.js`, `src/i18n/locales/en.json` +
  `es.json`, `firestore.rules`. When adding entries, put your block in a distinct
  region of the file.
- Commits Claude makes should end with a trailer, e.g.:
  `Co-Authored-By: Claude <noreply@anthropic.com>`
- **`gh pr merge` with an explicit `--repo` requires the PR number as a
  positional argument.** `gh pr merge --repo <owner>/<repo> --squash` fails
  with "argument required when using the --repo flag" and does nothing —
  harmless, but no merge either. When the command isn't run from the PR
  branch's own checkout, always: `gh pr merge <N> --repo <owner>/<repo>
  --squash`.
- **An orphaned `.git/index.lock`: run `lsof` first, never assume the cause.**
  Identify the PID with `lsof <path>/.git/index.lock`. Don't blame it on the
  Android emulator just because the process belongs to
  `com.apple.Virtualization.VirtualMachine` — any macOS VM uses that
  framework. If the PID turns out to be a system service, don't kill it.

---

## 2. Shared infrastructure — coordinate, git does NOT isolate these
- **Firebase project: `kinlo-app-dev` only** — the only project with data, and there
  is still **no prod project**. It lives under `hornandhoovesdev@gmail.com`; that's
  the account `gcloud` must be on. `bizId === ownerUid` (v1). Deploying rules
  (`firebase deploy --only firestore:rules` / `--only storage`) is **global — the
  last deploy wins, regardless of branch.** Deploy rules **only from merged `main`**,
  and tell your teammate.
- **Old-brand projects — dead, don't resurrect them.** Both were BondVibe-era and sit
  under `jcpuntoduarte@gmail.com`, so they don't even appear when `gcloud` is on the
  right account. If you go looking for them:
  - `bondvibe-dev` — abandoned 2026-07-13 when we migrated to `kinlo-app-dev`. Still
    ACTIVE, but both user-managed service-account keys were **revoked** 2026-07-16
    (only the Google-managed one remains). Any `bondvibe-*-adminsdk.json` you find on
    disk is a dead credential — delete it, don't try to use it. Note the FCM V1
    upload picker auto-detects service-account JSONs in the repo root and will
    happily default to the wrong one.
  - `bondvibe-prod` — **deleted 2026-07-16** (`DELETE_REQUESTED`; Google purges after
    ~30 days). It was never a real prod environment: no Firestore database, Auth never
    initialised, 0 storage buckets, 0 registered apps, billing off, and no activity
    after 2026-01-04. The name promised a user base that never existed.
  - Firebase enables `firestore` / `identitytoolkit` / `storage` APIs on **every** new
    project, so "API enabled" proves nothing. Check for actual data before believing a
    project matters.
- **Channels — testers and users must never share one.** A build listens on the
  channel baked in at BUILD time (`eas.json` → `build.<profile>.channel`); you
  cannot redirect an installed build by picking a different `--branch`.
  | profile | channel | who's on it |
  |---|---|---|
  | `development` | `development` | dev client, local loop |
  | `preview` | `preview` | sideloaded APK / ad-hoc iOS, throwaway checks |
  | **`beta`** | **`beta`** | **testers — iOS TestFlight + Android APK link** |
  | `production` | `production` | the launch channel. **Nobody is on it yet.** |
- **OTA updates:** testers get client-only changes via
  `eas update --branch beta --platform ios` (and `--platform android`). Publish
  OTA **only from `main`**. Never `--branch production` while testing: the **last
  update on `production` wins** for every real user, and that channel exists for
  launch. Always pass `--platform` — see the export block below for why.
- **`runtimeVersion` is `{"policy": "fingerprint"}`.** Not `appVersion`, not
  `1.0.0` — bumping `version` no longer orphans builds, but **any change to the
  native tree does**, because it changes the fingerprint. Each platform has its
  own: iOS and Android fingerprints are never compared to each other. An OTA
  only reaches builds whose fingerprint matches the update's exactly — everyone
  else gets nothing, with no error and no warning. Before publishing, compare
  each platform's fingerprint against the installed build that's supposed to
  receive it.
- **Do NOT run `eas build`.** Simulator builds are fine (`expo run:ios`); native
  builds are handled separately. A change is OTA-able unless it adds a **native
  module** (e.g. `react-native-maps`) — those need a native build, not OTA.
- **iOS builds stop for an Apple login + 2FA** (no credentials are stored on EAS
  yet), so they can't run unattended.
- **TestFlight is the controlled environment** — invite-only, not the App Store.
  Internal testing: 100 testers, no Apple review. External: 10,000, one Beta App
  Review. The `preview` profile can't reach it: `distribution: internal` on iOS
  is ad-hoc, which needs every device's UDID registered.
- **`eas update` packages the current working tree, not `origin/main`.** If the
  checkout is on a stale branch, on a commit behind the last merge, or
  mid-rebase, the OTA ships incomplete and looks exactly like a successful
  publish. `scripts/preflight-clean.sh` blocks on uncommitted changes, but **it
  does not check which branch you're on or that `HEAD` matches `origin/main`**
  — verify that by hand before publishing: `git branch --show-current`,
  `git rev-parse HEAD`, `git rev-parse origin/main`. Script gap tracked in
  KIN-250.
- **The asterisk `eas update` prints next to `Commit` means a dirty tree — and
  a single UNTRACKED file is enough to trigger it.** It does not imply
  uncommitted edits, and it does not mean the bundle carries anything it
  shouldn't: Metro bundles from the import graph, so a stray `.bundle`,
  `.worktrees/`, or `.md` at the repo root never gets pulled in. Before
  assuming the worst: `git status --short | grep -v "^??"` — empty output
  means the asterisk is cosmetic and there's nothing to investigate. Preflight
  not distinguishing the two cases is part of KIN-250.
- **`eas update` exports all three platforms by default, and web doesn't
  compile.** `app.json` doesn't declare `expo.platforms`, so the export runs
  as `--platform=all`. Web blows up bundling `@stripe/stripe-react-native`,
  which imports React Native internals that don't exist on web — and the
  export is atomic, so web's failure cancels iOS and Android even if they
  bundled fine. Always publish in two commands, `--platform android` and
  `--platform ios`, never `all`. **Don't** fix this by declaring
  `expo.platforms` while live builds still depend on OTAs: `app.json` is
  fingerprint input, and that change belongs to a new build. Full detail in
  KIN-253.
- **Deploy order: whichever side tolerates the other's absence goes first.**
  There's no fixed order. Firestore rules before the OTA that depends on them
  — new rules tolerate an old client; a new client against old rules eats
  `permission-denied`. OTA before the functions deploy that emits new
  notification types — a `case` with no matching type does nothing, but a
  notification with no `case` falls to `default` and tapping it silently does
  nothing either. The question before every two-layer deploy: which side
  breaks if the other hasn't shipped yet? That one goes second — and it gets
  written into the ticket before deploying.

---

## 3. Code conventions
- **i18n:** all copy via `react-i18next` `t("...")`; add keys to BOTH
  `src/i18n/locales/en.json` and `es.json` (same nesting; use `_one`/`_other` for
  plurals, `{{var}}` for interpolation). Verify parity before finishing.
- **Server-rendered i18n is a SEPARATE catalog** (`functions/i18n/notifications.{en,es}.json`
  + `tPush(key, lang, params)` in `functions/index.js`). If a notification/message
  needs to be read by someone other than its author, it must NOT be pre-rendered
  client-side and frozen into Firestore — forward the i18n `key` + `params` so
  each recipient renders it in **their own** language (BUG 34). A `titleKey`/`bodyKey`
  in `NOTIF_CATALOG` with no matching entry in the server JSON renders the raw key
  string to every reader who isn't the author (KIN-93's root cause). If you add a
  new `NOTIF_CATALOG` type with a `titleKey`/`bodyKey`, add the matching entries to
  BOTH server JSON files in the same PR.
- **Theme tokens, no hardcoded colors** — use `src/constants/theme-tokens.js`
  (`colors`, `FONTS`, `SPACING`, `RADII`). Exception: when a PIXEL-FIDELITY spec
  dictates an exact hue, use that exact value (and comment why).
- **Fonts:** Plus Jakarta Sans (prose/labels) + Space Grotesk (numbers, %, big
  amounts, headers), loaded via `expo-font` (already in `App.js`). **No System /
  Inter / Roboto fallback.** Set `fontFamily` from `FONTS.*` (not `fontWeight`)
  for custom fonts. **Space Grotesk's max weight is 700** — use it for the mock's
  "800" numerals. `letterSpacing: -0.5` on amounts, `-1` on big hero numbers.
- **Gradients:** real `expo-linear-gradient`, never a flat color.
- **Charts / trend lines:** `react-native-svg` `<Path>`, not a chart library
  (see `src/components/TrendLines.js`, `GoalLineChart.js`).
- **Flat cards:** `borderWidth: 1`, border `#ECE8F2` (light), **no shadow.**
  Shadows only on CTAs and the gradient hero cards (membership / P&L /
  attainment) — always set `elevation` too, for Android.
- **Honest-null `"—"`** for anything without a real data source; never fabricate.
- **Colors for native Android modules go in `#AARRGGBB`, not `rgba()`.** When a
  theme color in `rgba(r,g,b,a)` reaches a prop that an Android native SDK
  reads directly (e.g. `@stripe/stripe-react-native`'s `cardStyle`, which ends
  up in `android.graphics.Color.parseColor`), it has to be converted. Getting
  the byte order wrong produces a color that parses fine but is the wrong one
  — a silent failure. Use `toAndroidColor()` from `src/utils/color.js`; don't
  reinvent the conversion inline.
- **Don't anchor a code insertion inside an unclosed multiline block.** A
  `jest.mock(() => ({...}))`, a multi-line `import {...}`, any literal that
  opens on one line and closes several lines later: anchoring there can drop
  the new content in the middle of the block and break parsing, with the error
  surfacing far from the actual insertion. Anchor on a line that's
  unambiguously the start of a complete statement. This has already happened
  twice in this repo.

---

## 4. Firestore / data
- Business data lives under `businesses/{bizId}/...`. **Adding a new subcollection
  (e.g. `expenses`, `goals`) REQUIRES a matching rule in `firestore.rules`** and a
  deploy — otherwise it's denied. Finance-sensitive collections use the
  owner + non-reception-staff gate (mirror `payments`).
- **`businesses/{bizId}` itself is staff/owner-gated only — there is no public
  read.** A screen that needs to show business identity (name, verified badge,
  avatar) to a customer who is NOT staff must NOT read the parent doc directly
  (KIN-92). Either denormalize the safe fields onto the customer-readable doc at
  write time (see `bizDenorm()` in `src/services/businessSessionsService.js`), or
  read from a dedicated public sub-doc if one exists for that surface (see
  `claude/DISENO_business_public_profile.md` for the proposed general pattern).
- **Never write `undefined` to Firestore** — it's rejected. Coalesce optional
  fields to `null`.
- **`collectionGroup` queries need a recursive-wildcard rule**
  (`match /{path=**}/members/{memberId}`), not the nested one — and often a
  collection-group index in `firestore.indexes.json`.
- **A shared `firestore.rules` helper function (e.g. `isEventParticipant`,
  `isEventHost`) is reused across every collection that calls it — grep for
  every `match` block using it before changing what it returns.** Broadening
  (or narrowing) one to fix a single collection silently changes permissions
  everywhere else it's called too. `isEventParticipant(eventId)` alone gates
  **8** match blocks — `private` (the exact venue address), messages, typing,
  checkins, polls, votes, carpools, riders — so a fix aimed only at chat access
  would have silently opened the exact location, check-in visibility, poll
  voting and carpool requests to the same set of users too (KIN-240).
- A **query is rejected** unless the rules can *prove* every result is allowed —
  filter by the field the rule checks (e.g. `where("userId","==",uid)`), don't
  rely on a filter the rule ignores.

---

## 5. Before you finish (verification)
- `CI=true npx jest` → green.
- **`npm run lint` → clean, always — not just for `src/`.** `functions/` has its
  own ESLint config (`comma-dangle` and friends) that `jest` never exercises,
  especially for a one-off script that only runs standalone
  (`node some-script.js`), never imported by a test. A KIN-92 PR shipped with
  red CI for exactly this — a missing trailing comma, invisible to `jest`,
  caught only by CI instead of locally. Run lint before opening the PR, not
  after CI tells you.
- No new `local/no-unguarded-async-state` warnings on files you touched (see §7).
- Quick i18n parity check (en vs es key sets match).
- Babel-transform touched files through the project config if unsure.
- **Screenshot-diff** new screens against the design mocks. The `design_handoff_*/`
  folders (gitignored, reference-only) hold the READMEs + captures + a
  `PIXEL-FIDELITY SPEC` — read that spec BEFORE building a screen and port its
  exact values.
- No simulator in a headless Claude session → the human runs `expo run:ios` and
  reports pixel drift.
- **The Firestore emulator suite requires Java 21.** The JDK on PATH may be
  17. Point `JAVA_HOME` at a Temurin 21 for that one command only — don't
  touch the system config.
- **A local test count is not evidence by itself, and for two of the three
  suites there's no CI count to compare it against.** `jest.config.js` already
  excludes `/\.worktrees/`, so that specific contaminant is covered. But this
  repo's CI has **one required job**, `CI / Lint + Jest + i18n parity`, and
  that job runs only the app suite: it does **not** run the Firestore emulator
  suite or the security-rules suite. Practical consequence: the app suite's
  count DOES get compared against CI for the same commit and only counts as
  green when they match; the emulator and rules counts are **local only**, and
  must be reported as exactly that. Never present a local count as
  CI-confirmed. Coverage gap tracked in KIN-252.

---

## 6. Where things live (business module)
- Services: `src/services/business*.js` (members, packages, payments, expenses,
  attendance, analytics, goals, momentum, passes).
- Screens: `src/screens/business/*`.
- Shared components: `src/components/` (e.g. `ListRow`, `GradientBackground`,
  `DateField`, `Icon`, `TrendLines`, `GoalLineChart`, `SelectDropdown`).
- Ranges/labels: `src/constants/businessRanges.js`. Money: `src/utils/pricing.js`
  (`formatCentavos`, `formatCentavosCompact`).
- Rules: `firestore.rules`, `storage.rules` (root). Navigation:
  `src/navigation/AppNavigator.js`.

---

## 7. Async state — never let it get stuck (KIN-92 / KIN-94 / KIN-95)
**The pattern that keeps reproducing:** `setLoading(true)` (or `setSaving`,
`setWorking`, ...) → an `await somethingThatCanThrow()` or `Promise.all([...])`
with no try/catch → `setLoading(false)`. The moment the awaited call rejects
(permission-denied, offline, a bad doc, a server validation error — anything),
the reset line never runs. The screen is stuck spinning, or the button stuck
disabled, forever — the only way out is force-quitting the app. This was found
independently in 35+ places (23 load-sites, 13 save-sites) before it had a name.

**The fix, in order of preference:**
1. **Use `useAsyncLoad()`** (`src/hooks/useAsyncLoad.js`). It wraps the
   try/catch/finally for you and is unmount-safe:
   ```js
   // initial load
   const { loading, error, run } = useAsyncLoad();
   useFocusEffect(useCallback(() => {
     run(async () => {
       const [a, b] = await Promise.all([fetchA(), fetchB()]);
       setA(a); setB(b);
     });
   }, [run]));

   // save button
   const { loading: saving, run } = useAsyncLoad(false);
   const onSave = () => run(() => updateGroup(groupId, { name }));
   ```
2. If the shape genuinely doesn't fit the hook, wrap the risky call yourself:
   `try { ...await...; } catch (e) { ...surface it...; } finally { setLoading(false); }`.
   `finally` is the part that matters — it's what guarantees the reset runs.

**This is enforced, not just documented.** `eslint-rules/no-unguarded-async-state.js`
(registered in `eslint.config.js` as `local/no-unguarded-async-state`, currently
`"warn"` — see that file's header comment for exactly what it does and does not
catch) flags a `setX(true)` followed by an unguarded risky call with no
try/catch/finally before the matching `setX(false)`. Fix warnings on files you
touch; don't add new ones. Once the existing KIN-94/95 backlog is cleared the
rule should be promoted to `"error"`.
