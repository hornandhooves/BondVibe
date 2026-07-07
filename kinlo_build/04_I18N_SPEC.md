# 04 · Internationalization (i18n) + AI content translation

Two layers, built separately. English UI code/comments, Clean design system, tokens only.

## Supported languages (13) — canonical list
Use these exact codes/names everywhere a language is shown or selected (app language selector AND event-creation "language" field AND any "language" picker). Native name shown to users; ISO code = i18n key + stored value.

| Code | Native name | English |
|---|---|---|
| en | English | English |
| es | Español | Spanish |
| fr | Français | French |
| de | Deutsch | German |
| it | Italiano | Italian |
| pt | Português | Portuguese |
| pl | Polski | Polish |
| nl | Nederlands | Dutch (Netherlands) |
| nl-BE | Vlaams (België) | Flemish — Belgian variant |
| ru | Русский | Russian |
| uk | Українська | Ukrainian |
| ja | 日本語 | Japanese |
| zh | 中文 | Chinese |
| ko | 한국어 | Korean |

> **Cleanups vs the raw request:** "Alemán" and "Deutsch" are the **same language (German, `de`)** — merged. "Belga" is a nationality, not a language; per your confirmation we ship **both** standard **Dutch (`nl`, Netherlands)** and the **Belgian variant** as **Flemish (`nl-BE`, Vlaams/België)** — same base language, Belgium-specific label + locale for dates/formatting and future region copy. Total = **14 entries**.

> Implementation note: `nl` and `nl-BE` share one translation JSON base (`nl.json`); `nl-BE.json` only overrides strings that differ. Keeps maintenance light while giving Belgian users a distinct choice.

## Layer 1 — UI string localization (i18next)
- Library: `i18next` + `react-i18next` + `expo-localization` (device-locale detection).
- Structure: `src/i18n/index.js` + `src/i18n/locales/{en,es,fr,de,it,pt,pl,nl,nl-BE,ru,uk,ja,zh,ko}.json`.
- Every user-facing string → a key: `t('home.featured')` etc. **Audit & extract all hardcoded strings** (grep JSX text + `<Text>` literals). This is the bulk of the work.
- Persist choice in `users/{uid}.language` + local storage; default = device locale, fallback `en`.
- Number/date/currency via `Intl` with the active locale.
- All 13 are **LTR** — no RTL mirroring needed.

### The shared language list (single source)
`src/i18n/languages.js` exports the 14-row list above. **Both** the app language selector **and** the event-creation "language" field import from it — never hardcode a second list. This guarantees the event language picker offers exactly these 14.

## Layer 2 — AI translation of user content (events, posts, bios, chat)
i18n does NOT translate what users type. Add a **"Translate"** action via the existing `callClaude` Cloud Function.
- Feature key `content_translation` in `entitlements.js`: `{ tier:'plus', audience:'attendee', on:true, freeTaste:'1 translation / month' }`. **Pro hosts include it.** After the free monthly use, `<ProGate>` routes to the Plus paywall (Pro if host).
- UX: show original by default; a "Translate to {userLang}" button → Claude returns translation → render with a "Translated by Kinlo AI" tag + "See original" toggle. Cache per (contentId, targetLang) to avoid re-charging/re-calling.
- Prompt: "Translate the following user content to {lang}. Preserve meaning, tone, emojis, and formatting. Return only the translation." Ground = the content text only.
- Never auto-translate everything (cost + users often want the original).

## UX placement (recommended)
- **Welcome screen:** compact **globe pill** top-right, pre-filled from device locale, tap → selector sheet. (mockup phone 1)
- **Auth header (login/signup):** same globe pill, so a user can switch before creating the account. Login **inherits** the Welcome choice — not a separate step.
- **Settings (Profile):** a **Language** row showing the current language → opens the same selector. (mockup phone 3)
- **Selector** = bottom sheet, searchable, native names + English subtitle, check on selected, no flag emoji (consistent with the no-emoji rule). (mockup phone 2)
- Reference: `Kinlo Language Selector.dc.html`.

## Acceptance
- Switching language changes the whole UI instantly and persists.
- The event-creation language field offers exactly the 14 languages from `languages.js`.
- "Translate" appears on events/posts/bios/chat; 1 free/month then Plus; Pro hosts included; result cached + tagged.
- Device-locale auto-detect on first run; manual override in Welcome, auth, and Settings.
