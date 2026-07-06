# 03 · Fixes — Round 1 (from live-build review)

Five corrections found testing the running app. Apply on top of the spec. English UI, Clean design system, tokens only. Each item: what's wrong → what to do → files to look at.

---

## FIX 1 · Remove emoji & generic icons — meaningful custom iconography + real images
**Wrong:** the app uses emoji as brand/content art — 🎉 as the Kinlo logo (Welcome), 👥/✨/🔒 as feature bullets, and **emoji as event/profile images** (🥾🧘💃 tiles). Emoji are off-brand, inconsistent across platforms, and read as placeholder.

**Do:**
1. **Brand marks & feature glyphs → custom Lucide-style line icons** (strokeWidth 1.75, brand color, in a `brandSoft` rounded tile). Concrete replacements:
   - Welcome logo 🎉 → the **Kinlo orb** (brand-gradient circle with the connection mark). Reuse the logo asset from `design_handoff_bondvibe_theme/`, never an emoji.
   - "Group Events" 👥 → `users`/`calendar` line icon · "Personality Matching" ✨ → a **two-overlapping-circles "bond"** mark (NOT sparkles — reserve sparkles strictly for Kinlo AI) · "Safe & Inclusive" 🔒 → `shield-check` line icon.
2. **Event & profile images → real images only.** Never emoji-as-image. Use an `<ImageSlot>` (uploaded photo). **Fallback when no photo:** a branded gradient block with the event/community **initials** or a small category **line glyph** — never an emoji.
   - Event cards, Event detail hero, avatars, rental vehicle photos: all real image or branded-initial fallback.
   - Category **chips/labels** may keep the existing line `CategoryIcon` set (those are line icons, fine) — the ban is on emoji used as imagery/content.
3. Audit: `grep -rnE "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" src/` → replace every emoji in JSX/strings with an `<Icon>` or real image. Keep a single `<Icon name>` source (Lucide) so nothing is a raw glyph.

> Note: the design mockups (`.dc.html`) used emoji as quick placeholders — production must follow this rule, not the placeholders.

---

## FIX 2 · Home screen — remove the duplicated "Quick Actions" grid
**Wrong:** Home shows a **QUICK ACTIONS** grid (Explore · Wall · My Events · Notifications · Get around · Create) that **duplicates the bottom tab bar** (Home/Wall/Events/Rentals/Profile) and the header bell. Two navigations for the same destinations = clutter and confusion.

**Do:** delete the Quick Actions grid entirely. Home content, top→bottom, per spec §2.2:
1. Header (greeting + [Attending|Hosting] if host + ✉ + 🔔)
2. **Weekly Digest (AI)** banner
3. **Search events** bar
4. **Featured events** (horizontal)
5. **Browse by community** (chips)
6. Zero-state ("No events near {city} — be the first to host")

Navigation lives **only** in the bottom tab bar + header. The single allowed shortcut is a contextual **Create** — a FAB shown in **Host Mode only** (attendees don't create events), not a Home tile. Files: `HomeScreen`.

---

## FIX 3 · Profile — remove the "Host tools moved" card
**Wrong:** the gray "Host tools moved · Switch to Hosting in the header → Events tab becomes Manage" card is **migration scaffolding**, not a feature. It shouldn't ship.

**Do:** delete that card. **No functionality is lost** — host access is the header **[Attending|Hosting]** toggle, which already works. (If you want a host entry inside Profile for discoverability, use the single clean **"Switch to Hosting"** row/CTA from the Profile mockup — but never the "moved" explainer.) Files: `ProfileScreen`.

---

## FIX 4 · Group chat — music-note icon must open Spotify, not settings
**Wrong:** in the group chat header the ♪ **music-note** icon routes to **group settings**; the gear icon is already settings. So the Spotify action is unreachable and there's a duplicate.

**Do:** wire the ♪ icon to the **Spotify playlist flow**:
- If no playlist linked → open **"Connect Spotify playlist"** (host only can link).
- If linked → open the group's **playlist view / Spotify deep link**.
- Keep the ⚙️ gear = group settings only. Spotify green (`#1DB954`) is the one allowed non-brand accent (per design system) for the connect button. Files: `GroupChat` header — fix the `onPress` on the music-note button (it's pointing at the settings route).

---

## FIX 5 · Messages / Inbox — include Group chats (not just matches)
**Wrong:** Inbox only lists match chats; **group chats are missing**, so members can't reach their group conversations from the ✉ inbox.

**Do:** Inbox aggregates **all** conversation types, in sections:
1. **Ask Kinlo** (pinned AI thread)
2. **Direct messages** (DMs)
3. **Group chats** ← add (event groups + community groups)
4. **Event chats**
5. **Match chats** (if host enabled matching)

One unified list, filterable; each row = avatar/branded-initial + name + last message + unread dot. Group rows deep-link into `GroupChat`. Files: `Inbox`/`DMList` — add the groups query + section. Confirms spec §Inbox and `02_FEATURE_INVENTORY.md` (Social + Host Groups).

---

### Acceptance
- No emoji anywhere in UI (icons = `<Icon>`, imagery = real photo or branded-initial fallback).
- Home has no Quick Actions grid; navigation only via tab bar + header.
- No "Host tools moved" card; header toggle is the host switch.
- Group-chat ♪ opens Spotify; ⚙️ opens settings.
- Inbox shows DMs + Group + Event + Match chats + Ask Kinlo.
- Featured is an auto-advancing carousel (Fix 6).

---

## FIX 6 · Home "Featured" → auto-advancing carousel (2 half-size cards)
**Change:** the Featured section becomes a **carousel** instead of a static/scrolling row.
**Do:**
- Show **2 cards per view**, each card **half the previous height** (image block ~60px instead of ~120px; compact title + date).
- **Auto-advance every 3 seconds** through the pages, smooth slide (`transform: translateX`, ~0.55s ease), wrapping back to the first page.
- **Dots** indicator (active page highlighted) + **swipe** to move manually.
- **Pause auto-advance on user interaction** (swipe/press) and resume after ~5s idle. Pause when the screen loses focus (`useIsFocused`) to save cycles.
- Cards use the real-image / branded-initial fallback from Fix 1 (no emoji).
- Reference mockup: `Kinlo Home Featured Carousel.dc.html`. Files: `HomeScreen` featured component.
