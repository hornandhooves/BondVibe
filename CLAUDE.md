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
- **Firebase project: `kinlo-app-dev` only** (no prod project). `bizId === ownerUid`
  (v1). Deploying rules (`firebase deploy --only firestore:rules` / `--only
  storage`) is **global — the last deploy wins, regardless of branch.** Deploy
  rules **only from merged `main`**, and tell your teammate.
- **OTA updates:** client-only changes reach TestFlight via
  `eas update --branch production --platform ios` (runtimeVersion `1.0.0`). The
  **last update on `production` wins** for all users — publish OTA **only from
  `main`**; use the `preview` channel for testing.
- **Do NOT run `eas build`.** Simulator builds are fine (`expo run:ios`); native
  TestFlight builds are handled separately. A change is OTA-able unless it adds a
  **native module** (e.g. `react-native-maps`) — those need a native build, not
  OTA.

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
- `CI=true npx jest` → green.
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
