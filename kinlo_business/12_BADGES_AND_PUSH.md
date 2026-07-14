# 12 · Unread badges (in-Inbox + native app icon) + push confirmation

> From the 07-13 screen recording: the header ✉ shows a combined unread badge, but **inside the Inbox no row shows where the unread is** (Event chats / Match chats / Community chats / Notifications / DMs), and the **native app-icon badge never appears** on the device home screen. Plus: confirm push works for hosts AND attendees. Reviewed against `DuarTchock/Kinlo@main`.

## What's actually broken vs. fine
- ✅ **Push pipeline is correctly wired for host AND attendee.** `registerPushToken(uid)` (`utils/messageService.js`) is called for every signed-in user (`AppNavigator.js:384/397`, not role-gated), requests permission, gets the Expo token via the EAS projectId, clears stale tokens on other accounts on the same device, and writes `pushToken` on the user doc. Multiple CFs send to both sides via `functions/notifications/pushService.js` (event messages → attendees+host, matches, follows/posts, business, join/digest). Round-4 BUG 13 already closed the attendee-token gap.
- ❌ **No per-category unread badge inside `InboxScreen`.** The rows are plain `<ListRow>` with no count. `useInboxBadge` collapses everything into ONE total for the header icon; there is no per-category breakdown.
- ❌ **Native app-icon badge is never set.** There is **no `setBadgeCountAsync` anywhere** in the app, and `pushService.js` sends **no `badge`** field. So the OS icon badge never updates — app open or closed.

---

## FIX A — per-category unread badges in the Inbox
**New hook `useInboxBadges()`** (generalize `useInboxBadge`): one `notifications` listener (same `userId` index) that returns a breakdown, not just a total:
```
{ eventChats, matchChats, communityChats, notifications, dms, total }
```
Map by notification `type` (enumerate the exact types written across `functions/**` — known ones below):
- **eventChats** ← `type === "event_messages"` → sum `unreadCount`.
- **communityChats** ← `type === "group_message"` (host-group messages) → count `read === false`.
- **matchChats** ← the match message/notification types (grep `functions/matching/*` + notification writers for the exact `type` strings) → count `read === false`.
- **notifications** ← everything else with `read === false` (generic: host_approved, event reminders, follows, etc.).
- Keep `total` = sum, so the header keeps working (have `useInboxBadge` delegate to this).

**Render count pills** on the four `<ListRow>`s in `InboxScreen.js`. `ListRow` already supports a `right` slot and a `titleBadge` — use `right={<CountPill n={badges.eventChats}/>}` (a small rounded pill, `colors.error` bg, white text, "9+" cap) shown only when `n>0`, keeping the chevron beside it or replacing it. Do the same for Match chats, Community chats, Notifications.

**DM rows:** DMs are **not currently unread-tracked** — `dms/{threadId}` has `lastMessage`/`updatedAt` but no per-user read state. Add lightweight tracking: on the thread, maintain `lastReadAt.{uid}` (set when the user opens `DMChat`) and compare with `updatedAt`/`lastSenderId !== me` to show an unread **dot** (and bold name) on the DM row + include in `badges.dms`. (Full per-message counts optional; a dot is enough for v1.)

**Accept:** opening the Inbox shows a numeric pill on each category that has unread, a dot on unread DM rows, and the pills clear when you open that category (the existing `clear…Notifications` calls already reset the aggregates).

## FIX B — native app-icon badge
Two parts (do both; the first is the must-have):
1. **Client (app open/background):** drive the OS badge from the combined unread. In the `useInboxBadge`/`useInboxBadges` listener, call `await Notifications.setBadgeCountAsync(total)` whenever the total changes. Reset to `0` on logout (`clearPushToken` path) and when the inbox is fully read. Also set it from the notification **received** handler in `App.js` (already have `setNotificationHandler`) so it updates while backgrounded. Android: ensure the notification channel allows badges.
2. **Server (app fully closed):** add a **`badge`** field to the Expo push message in `pushService.js` (`sendPushNotification` + `sendBatchPushNotifications`) = the **recipient's new unread total**. Compute it when queuing the send (the CFs already write the per-user `notifications` aggregate, so sum it there and pass `badge`). Without this, iOS can't bump the home-screen icon while the app is killed.

**Accept:** the app icon on the device home screen shows the unread count; it goes up on a new push (even with the app closed) and returns to 0 when the user clears the inbox.

## CONFIRM C — push for host & attendee (on-device test)
Code is correct; verify end-to-end on a **real device / TestFlight** (push never fires on simulator/Expo Go):
1. Attendee A joins host H's event. Both granted notifications on first launch (`registerPushToken`).
2. H posts in the event group → **A gets** a push + in-app notification + (after Fix A/B) event-chats pill + icon badge.
3. A DMs H → **H gets** push + DM dot + badge. Match made → both get match push.
4. Confirm `users/{uid}.pushToken` is set (starts with `ExponentPushToken[`) for both a host and an attendee account.

**Note:** the reason the icon badge never showed is Fix B (no `badge` in payload, no `setBadgeCountAsync`) — not a token/permission problem.

## Deliver
EN/ES parity for any new strings, jest green, theme tokens, no hardcoded colors (pill uses `colors.error`). Build A → B → C, pause after each for review, push to main. Fix B server part needs `firebase deploy --only functions`; the client parts reach TestFlight via OTA.
