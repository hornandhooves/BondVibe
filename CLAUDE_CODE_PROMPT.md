# Prompt for Claude Code — Implement the Kinlo redesign

> Give this to Claude Code (the CLI agent running inside this repo). Claude Code
> reads the project filesystem directly, so **you don't upload anything** — every
> file referenced below already lives in the repo root. Just paste this prompt.

---

## Your role

You are a **senior React Native / Expo engineer**. Your job is to implement the
Kinlo UX/UI redesign faithfully and incrementally, without breaking existing
business logic.

## Read these first (all in the repo root)

1. **`KINLO_REDESIGN_SPEC.md`** — the **source of truth**: the new information
   architecture, navigation, flow redesigns, and design system produced by Claude
   Design. Implement *this*.
2. **`UX_HANDOFF_APP_STRUCTURE.md`** — the current app map (65 screens, features,
   what's orphaned) so you understand the starting point.
3. **`CLAUDE_DESIGN_PROMPT.md`** — the design brief for context on intent and
   constraints.

> If `KINLO_REDESIGN_SPEC.md` is missing, stop and ask — the design spec must
> exist before implementation. Do not invent the design yourself.

## What to build

Implement the redesign in the spec, in its priority order (P0 → P1 → P2).
Expected scope, at minimum:
- **Introduce the new navigation** (e.g., bottom tab bar) as defined in the spec.
  All navigation is registered in **`src/navigation/AppNavigator.js`** — restructure
  it there.
- **Wire up the orphaned screens** (Feed, Notifications, MyEvents, Conversations)
  into the new IA so they're reachable.
- **Split/refactor `ProfileScreen`** per the spec (public Profile vs Settings vs
  Host Dashboard).
- **Apply the design system** (type ramp, spacing, component variants) across
  screens, starting with the highest-traffic ones.

## Engineering constraints (non-negotiable)

- **Do not change business logic, Firestore schema, or Cloud Functions behavior**
  unless the spec explicitly requires it. This is a UI/navigation redesign.
- **Reuse existing foundations** — the central `<Icon>` (`src/components/Icon.js`,
  Lucide) and theme tokens (`src/constants/theme-tokens.js`,
  `src/contexts/ThemeContext.js`). Extend them; do not fork a parallel system.
- **Keep both themes working** — WARMTH (Clean/light, default) and AURORA (dark).
- **Work in small, reviewable commits** on a feature branch off `main` (do not
  commit directly to `main` without asking). End commit messages with the
  project's Co-Authored-By line.
- **Verify each change by running the app in the iOS Simulator**
  (`npx expo start`, then the iOS simulator). Don't rely on typecheck/tests alone —
  actually drive the changed screen and confirm it renders/navigates.
- **Do NOT run EAS or TestFlight builds** (`eas build` / `eas submit`). The user
  manages releases; local simulator builds only.
- **Ask before anything destructive or ambiguous** (deleting screens, changing
  data models, removing features). Surface trade-offs; don't guess.

## How to work

1. **Start in plan mode.** Read the three docs, then propose an implementation
   plan that maps the spec's P0/P1/P2 to concrete file changes. Get approval
   before editing.
2. Implement **phase by phase**, committing after each coherent chunk.
3. After each phase, give a short changelog and how you verified it (which screen
   you drove in the simulator).
4. Flag anything in the spec that's technically infeasible or risky, with an
   alternative.

## Definition of done

- The new navigation is live and every feature is reachable from a persistent nav.
- Orphaned screens are wired in.
- The design system is applied consistently to the screens named in the spec.
- Both themes render correctly.
- No regressions in existing flows (auth, event join/checkout, payments, matching
  consent) — verified in the simulator.
