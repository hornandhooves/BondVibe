# Chat features — Car pool, Polls, Host Groups (proposal)

> Status: PROPOSAL. Grounded in the existing chat: messages live in
> `events/{eventId}/messages` with a `type` field ("text" | "location"),
> rendered per-type in EventChatScreen, with per-user delivered/read maps.

## Shared foundation (build once, reuse by all three)
1. **Rich message types + payload.** Add a generic `data` object to messages and
   new `type` values: `poll`, `carpool`, `event_invite`. The composer gets a
   "+" attachment menu (like the current location button) to create them.
2. **Live "object" docs separate from the chat message.** Polls and car pools
   are *mutable* (votes, seats change), so store the live object in its own doc
   and post a chat message that references it by id. The chat card subscribes to
   that doc for real-time updates.
3. **Generalized chat.** Make the chat work on any conversation path, not just
   `events/{id}/messages`, so Host Groups can reuse the exact same screen and
   `messageService` (pass a `basePath` / conversation ref instead of hardcoding).

---

## 1. Car Pool (inside the event chat)
A driver offers a ride; attendees request a seat; the driver approves.

**Data**
- `events/{eventId}/carpools/{carpoolId}`: driverId, driverName, seatsTotal,
  from (area), departureTime, notes, status ("open"|"full"|"closed"),
  riders: { uid: "requested" | "approved" }.
- A chat message `{ type: "carpool", data: { carpoolId } }`.

**UX**
- Composer "+" → "Offer a ride" → form (seats, from, time, notes) → posts a
  car-pool card into the chat.
- Card shows: 🚗 driver, seats available (live), from/time, and a **Request
  seat** button for others. Driver sees pending requests with Approve/Decline.
- Seats decrement on approval; card flips to "Full". Approved riders + driver
  get a notification.

**Rules:** any attendee can request (write their own `riders.{uid}=requested`);
only the driver approves / changes seats / closes. Enforced server-side
(Cloud Function `respondCarpoolRequest`) or scoped rules.

---

## 2. Polls (host) in the event chat
Host posts a poll; attendees vote; results update live.

**Data**
- `events/{eventId}/polls/{pollId}`: question, createdBy(host), allowMultiple,
  closesAt, options: [{ id, text }], votes: { uid: [optionId, ...] }.
- A chat message `{ type: "poll", data: { pollId } }`.

**UX**
- Composer "+" → "Create poll" (host only) → question + 2–5 options → posts a
  poll card.
- Card: question + each option with a live % bar + total votes; tapping an
  option toggles your vote. Host can **Close poll** (freezes results).

**Rules:** only the host creates/closes a poll; any attendee toggles only their
own `votes.{uid}` entry.

---

## 3. Host Groups (WhatsApp-style, persistent)
A host curates groups of frequent attendees with their own ongoing group chat —
independent of any single event.

**Data**
- `hostGroups/{groupId}`: hostId, name, description, photo?, memberIds: [uid],
  createdAt, updatedAt.
- `hostGroups/{groupId}/messages`: same message model as events (text, location,
  poll, carpool, **event_invite**), reusing the generalized chat.

**Capabilities**
- Host: create group, rename, add/remove members, delete group.
- Host posts to the group: messages, **polls**, **event invitations**
  (`{ type:"event_invite", data:{ eventId } }` → card → tap → EventDetail/join),
  and it triggers push notifications to all members.
- Members: read + chat + vote in polls + tap invites. (Optionally host-only
  posting toggle, like a broadcast/announcement group.)

**Surfaces**
- Host: a "Groups" section in the Host area (Profile/host hub) → list → group
  detail (chat) + a "Manage members" screen (add from past attendees, remove).
- Member: groups appear in their chats/inbox; opening one is the group chat.

**Notifications:** reuse the push pipeline; a new `onGroupMessage` Cloud
Function (mirrors `onNewMessage`) notifies members.

**Rules:** read/write limited to `hostGroups/{id}.memberIds` (members) and the
`hostId`; only the host edits membership/metadata.

---

## Recommended build order
- **Phase A — Polls in event chat** (smallest, high value; establishes the
  rich-message-type + live-object pattern).
- **Phase B — Car pool in event chat** (reuses the same pattern + a request flow).
- **Phase C — Host Groups** (largest: generalize the chat, group CRUD + member
  management, group notifications, then drop Polls/Car pool/Invites into groups
  for free since they're already built).

Each phase ships independently and is testable on its own.
