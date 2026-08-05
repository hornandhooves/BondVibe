/**
 * KIN-150 — how "fresh" a Home carousel's data needs to be before a tab focus
 * triggers a re-fetch. Named here (not inlined in a component) so there's one
 * place to tune it — this is a client-only UX knob, not a business value, so
 * unlike config/pricing it doesn't need to be admin-editable from Firestore;
 * changing it is a code change + deploy either way.
 *
 * A pull-to-refresh (RefreshControl) always bypasses this and reloads
 * immediately, regardless of how recently the last load happened.
 */
export const HOME_CAROUSEL_REFRESH_TTL_MS = 60000;
