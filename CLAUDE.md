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
- `CI=true npx jest` → green. **This is the syntax check.** Do NOT reach for
  `npx babel --config-file ./babel.config.js <file>`: on
  `src/navigation/AppNavigator.js` it fails with a **pre-existing**
  `SyntaxError: Unexpected token (299:12)` that has nothing to do with your
  change, while jest — which uses the real config — passes. Chasing it wastes an
  hour; masking it produces a false green.
- Quick i18n parity check (en vs es key sets match). **Never write the locale
  files by parse→stringify.** They don't round-trip: `JSON.stringify(json, null, 2)`
  differs from the on-disk formatting by ~1680 chars, so a "small" key addition
  rewrites hundreds of untouched lines and buries the real change in the diff
  (`json.dumps(indent=2)` in Python, same trap). Insert keys as TEXT — find the
  section's opening brace and splice — then re-parse to prove you added exactly
  what you meant to.
- **Make the action depend on the check.** `node --check x && CI=true npx jest &&
  git commit` — not `verify; commit`, which commits regardless, and not a check
  followed by an unconditional `echo "✅"`. Watch pipes too: `grep … | sed || echo
  "none"` never fires the fallback, because the exit code is sed's. A false green
  is worse than a red: it ends the investigation.
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
