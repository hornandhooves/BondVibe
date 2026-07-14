# 14 · BUG 25 — show the @handle on the Profile screen

> The handle system is fully built (ChooseHandleScreen, `claimHandle`, `findUserByHandle`, mentions, search) and every user already has `handle` / `handleLower` on their user doc — it's just **never rendered on the Profile screen**. Add it under the name. Reviewed against `DuarTchock/Kinlo@main`, `src/screens/ProfileScreen.js`.

## The fix (one screen, view mode)
In `ProfileScreen.js`, VIEW MODE, the `userSection` block renders name → email with nothing between:
```jsx
<Text style={[s.name, { color: colors.text }]}>{profile.fullName}</Text>
<Text style={[s.email, { color: colors.textSecondary }]}>{auth.currentUser?.email}</Text>
```
Insert the **@handle line between the name and the email**:
```jsx
<Text style={[s.name, { color: colors.text }]}>{profile.fullName}</Text>
{!!(profile.handle || profile.handleLower) && (
  <Text style={[s.handle, { color: colors.primary }]}>@{profile.handle || profile.handleLower}</Text>
)}
<Text style={[s.email, { color: colors.textSecondary }]}>{auth.currentUser?.email}</Text>
```
Add the style (next to `name`/`email` in `createStyles`):
```js
handle: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2, marginTop: -2 },
```
`userSection` already has `gap: 6`, so spacing is automatic; the small negative `marginTop` just tucks the handle under the name tighter than the email.

## Notes
- **Field:** the canonical display field is `profile.handle` (original case); `handleLower` is the search index — fall back to it just in case an older doc only has the lower form. Handles are `a-z` + `_`, so they're already lowercase either way.
- **No new i18n** — it's literally `@` + the handle, not a translated string.
- **Nothing else moves** — name, email, avatar, badges, stats all stay exactly as they are. This is purely additive.
- **Other profile surfaces (optional, nice consistency):** `UserProfileScreen.js` (other people's profiles) and `MatchProfileScreen.js` show names too — if they don't already show `@handle`, add the same line there for consistency. Not required for BUG 25.

## Accept
The Profile screen shows the user's `@handle` in the brand color, directly under their name and above their email (matching the annotated screenshot). Users with no handle yet (shouldn't happen — claim is blocking at signup) simply don't see the line.
