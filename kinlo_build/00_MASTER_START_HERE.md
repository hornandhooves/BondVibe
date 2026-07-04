# Kinlo — BUILD PACKAGE · START HERE (Claude Code entry point)

> **App: Kinlo.** (Repo may be internally `bondvibe`; keep lowercase identifiers, all user-facing copy says **Kinlo**.)
> Put the whole **`kinlo_build/`** folder in the repo root. This is the ONLY file you point the developer at.

## The one prompt to give Claude Code
```
Read kinlo_build/00_MASTER_START_HERE.md and follow it. Build in the order given (P0→P2),
pausing after each phase for my review. Nothing in 02_FEATURE_INVENTORY.md may be dropped.
```

## What's in this folder
| File | What it is |
|---|---|
| `00_MASTER_START_HERE.md` | This index + rules + build order |
| `01_REDESIGN_SPEC.md` | The full redesign: IA, 5-tab nav, Host Mode, flows (ASCII), design system, gating (§1.8), rollout P0–P2 |
| `02_FEATURE_INVENTORY.md` | **Completeness checklist** — every screen/domain of the app mapped to its new home + tier. Nothing excluded. |
| `ai_features/` | The 7 AI features: `00_START_HERE`, `02_AI_FOUNDATION` (secure `callClaude`), `03_INTEGRATION_MAP`, one spec per feature (10–16) |

Companion visual mockups live in the repo root (open in a browser to match pixels):
`Kinlo Redesign — IA & Nav.dc.html` · `Kinlo Events Flow.dc.html` · `Kinlo Rentals Flow.dc.html` · `Kinlo Rentals Host Flow.dc.html` · `Kinlo AI Features.dc.html` · `Kinlo AI Analytics & Integration.dc.html` · `Kinlo Profile Rediseño (Diff).dc.html`

## Build order (stop for review after each phase)
1. **P0 — Shell** (`01` §Deliverable 4): 5-tab bar + header (✉/🔔) + Host Mode toggle in `AppNavigator.js`; `src/config/entitlements.js` + `useEntitlement`/`<ProGate>`/`<ProBadge>`; design tokens (WARMTH default); Profile split. **Un-orphans everything.**
2. **P1 — Attendee core + AI foundation**: Home, Wall (Smart Wall) + `callClaude` (`ai_features/02`), Ask Kinlo, Inbox, "Turn on Kinlo AI" opt-in + loading/fallback, Rentals tab.
3. **P2 — Host depth + matching + monetization**: Host Mode → Manage (Copilot, Member Intelligence, AI Analytics), Match Intelligence, Weekly Digest, Rentals → Your Fleet, recaps, paywalls.

## Hard rules (every phase)
- **English** UI copy + code comments. Match the Clean design system in `01` §3 and the mockups; use tokens, no hardcoded colors.
- **Nothing gets dropped.** Every row in `02_FEATURE_INVENTORY.md` must exist and be reachable in ≤2 taps.
- **AI never called from the client** — always via the `callClaude` Cloud Function (key server-side). Ground every AI output in the user's real data; graceful fallback, never fake.
- **Freemium gating (approved):** all AI is Plus (attendee) / Pro (host) with a small **free taste** per feature (`entitlements.js` `freeTaste`). Paywalls fire only at a moment of demonstrated value; never block core nav / discovery / ticket purchase.
- **Privacy for Community Matching is non-negotiable:** opt-in, consent step cannot be skipped, host analytics aggregate-only, never expose who liked/matched whom.
- Reuse existing `<Icon>` (Lucide) + theme tokens. Restructuring nav is low-risk (one file). Small commits per phase; show the file plan and wait for OK before editing.
