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
  launch. Omitting `--platform` exports `all`, which includes **web** — web has
  never bundled (`@stripe/stripe-react-native` imports RN internals), so always
  pass `--platform`.
- **runtimeVersion is `{"policy": "appVersion"}`** → today `1.0.0`, from
  `app.json` `version`. An update only reaches builds with the **same**
  runtimeVersion, so bumping `version` orphans every installed build until it's
  rebuilt. `autoIncrement` moves buildNumber/versionCode, not this.
- **Do NOT run `eas build`.** Simulator builds are fine (`expo run:ios`); native
  builds are handled separately. A change is OTA-able unless it adds a **native
  module** (e.g. `react-native-maps`) — those need a native build, not OTA.
- **iOS builds stop for an Apple login + 2FA** (no credentials are stored on EAS
  yet), so they can't run unattended.
- **TestFlight is the controlled environment** — invite-only, not the App Store.
  Internal testing: 100 testers, no Apple review. External: 10,000, one Beta App
  Review. The `preview` profile can't reach it: `distribution: internal` on iOS
  is ad-hoc, which needs every device's UDID registered.

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
