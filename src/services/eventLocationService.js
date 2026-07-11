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
 * True if the current (or given) user participates in the event — creator or in
 * attendees[]. Mirrors the rules' isEventParticipant so the client and server agree.
 */
export const isEventParticipant = (event, uid = auth.currentUser?.uid) => {
  if (!event || !uid) return false;
  const creatorId = event.creatorId || event.createdBy;
  if (creatorId === uid) return true;
  if (Array.isArray(event.coHosts) && event.coHosts.includes(uid)) return true;
  return Array.isArray(event.attendees) && event.attendees.includes(uid);
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
  } catch (_e) {
    // Permission-denied for a non-participant (or offline) — fall back to approx.
    return null;
  }
};

/**
 * Resolve an event's location for the current user, fetching the private doc
 * when they're a participant. Never throws; never returns a blank for a legacy doc.
 * @param {object} event public event doc (must include its id as event.id)
 * @param {string} [uid] defaults to the signed-in user
 * @returns {Promise<ReturnType<typeof resolveEventLocation>>}
 */
export const getEventLocation = async (event, uid = auth.currentUser?.uid) => {
  const participant = isEventParticipant(event, uid);
  const privateLocation = participant ? await fetchPrivateLocation(event?.id) : null;
  return resolveEventLocation(event, { isParticipant: participant, privateLocation });
};
