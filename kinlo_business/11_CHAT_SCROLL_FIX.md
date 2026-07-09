# 11 · Chat message-list jumps on every keystroke (reviewed against main)

> Bug from the 07-15 screen recording: in the **event/group chat**, typing makes the **message list above the composer bounce** to different scroll positions on each keystroke. The composer itself stays pinned (round-4 BUG 12 fixed that) — this is a **different** root cause: message-list scroll stability. File: `src/screens/GroupChatScreen.js` (+ same pattern in any other chat using a plain ScrollView).

## Root cause (confirmed in `GroupChatScreen.js`)
1. The list is a **plain `<ScrollView>`** with no bottom-anchoring (no inverted `FlatList`, no `maintainVisibleContentPosition`). Any layout change — keyboard, the QuickType suggestion bar, the `multiline` input growing — resizes the viewport and the content drifts because nothing pins it to the bottom.
2. The subscription calls **`scrollToEnd({animated:true})` on EVERY snapshot** (not only on new messages). `markGroupMessagesRead` writes `readBy` → the snapshot re-fires → `setMessages` makes new object identities → animated re-scroll retriggers.
3. **The whole screen re-renders on every keystroke** — `text` is `useState` at the top of `GroupChatScreen`, so each letter rebuilds every `messages.map(...)` bubble. Combined with (1), the scroll position drifts visibly.

## Fix
1. **Convert the list to an inverted `FlatList`** — `inverted`, `data={[...messages].reverse()}`, `keyExtractor={m=>m.id}`, `renderItem` = the existing bubble/invite/poll rendering. Inverted lists keep the newest item pinned to the bottom automatically → keyboard/layout changes and new messages no longer move it, and you can **delete the manual `scrollToEnd`** entirely.
   - *If you must keep `ScrollView`:* add `maintainVisibleContentPosition={{ minIndexForVisible: 0 }}` and only `scrollToEnd` when (a) first load, or (b) a genuinely new message id arrived AND the user is already near the bottom. Never scroll on readBy/deliveredTo-only updates.
2. **Auto-scroll only on new messages.** Track the last message id / count; skip scrolling when a snapshot only changed tick metadata. Remove the blanket `setTimeout(scrollToEnd, 100)` from the subscription callback.
3. **Isolate the composer.** Move the `text` state + `TextInput` + send button into a memoized `<Composer onSend={sendGroupMessage}/>` child (or wrap the list in `React.memo`) so keystrokes don't re-render every bubble.
4. Keep `KeyboardAvoidingView` as-is (offset 0 + padding is correct).

## Apply to all chats
Audit the other chat screens for the same plain-ScrollView + scroll-on-every-snapshot pattern and apply the same inverted-FlatList treatment: event chat, DM thread, match chat, Ask Kinlo.

## Accept
- Typing a long message in a group chat does NOT move the message list; it stays pinned to the latest message.
- A new incoming message scrolls to it only if the user was already at the bottom.
- No jump/bounce on keyboard open, suggestion-bar change, or input growth. Same verified on DM/match/event chats.
