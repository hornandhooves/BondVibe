/**
 * Client access to an event's gated location (F2).
 *
 * The exact venue/address/coords live in `events/{id}/private/location`, readable
 * only by participants (creator or in attendees[]) per firestore.rules. This
 * service fetches that doc when allowed and hands the pieces to the pure
 * `resolveEventLocation` resolver so every screen renders the right state
 * (exact for participants, approximate otherwise, legacy fields as a fallback).
 */
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { resolveEventLocation } from "../utils/eventLocation";

/**
 * Synchronous OPTIMISTIC hint: creator/co-host only. ROSTER (#55): attendee
 * membership moved to the gated roster subcollection, which can't be read
 * synchronously off the event doc (the `attendees` array is gone). This drives
 * only the initial coarse-vs-exact render; the authoritative reveal is
 * fetchPrivateLocation, which the rules gate on real roster membership. Callers
 * that already know roster membership (e.g. via isOnRoster) should pass it as the
 * `isParticipant` prop rather than relying on this.
 */
export const isEventParticipant = (event, uid = auth.currentUser?.uid) => {
  if (!event || !uid) return false;
  const creatorId = event.creatorId || event.createdBy;
  if (creatorId === uid) return true;
  if (Array.isArray(event.coHosts) && event.coHosts.includes(uid)) return true;
  return false;
};

/**
 * Fetch the private exact-location doc. Returns null when the caller isn't a
 * participant (rules deny) or the doc doesn't exist (legacy/un-migrated event).
 * @param {string} eventId
 * @returns {Promise<object|null>}
 */
export const fetchPrivateLocation = async (eventId) => {
  if (!eventId) return null;
  try {
    const snap = await getDoc(doc(db, "events", eventId, "private", "location"));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    // permission-denied aquí es esperado para un no-participante; un
    // failed-precondition o unavailable NO lo es y hoy se ve idéntico
    // desde el llamador. Log del code antes de degradar a aproximada.
    console.warn("⚠️ fetchPrivateLocation:", e?.code, eventId);
    return null;
  }
};

/**
 * Resolve an event's location for the current user, fetching the private doc
 * when they're a participant. Never throws; never returns a blank for a legacy doc.
 * @param {object} event public event doc (must include its id as event.id)
 * @param {object} [opts]
 * @param {string} [opts.uid] defaults to the signed-in user
 * @param {boolean} [opts.isParticipant] real roster membership (e.g. from
 *   isOnRoster), when the caller already knows it. Falls back to the
 *   synchronous creator/co-host-only heuristic (isEventParticipant) when
 *   omitted — that heuristic can't see roster membership, so a caller that
 *   knows better should always pass this rather than let it get recomputed.
 * @returns {Promise<ReturnType<typeof resolveEventLocation>>}
 */
export const getEventLocation = async (
  event,
  { uid = auth.currentUser?.uid, isParticipant } = {},
) => {
  const participant = isParticipant ?? isEventParticipant(event, uid);
  const privateLocation = participant ? await fetchPrivateLocation(event?.id) : null;
  return resolveEventLocation(event, { isParticipant: participant, privateLocation });
};
