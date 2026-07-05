/**
 * signalsService — Wall signals (spec §2.4: Going · Interested · Met,
 * no likes / no follower counts).
 *
 * Going    = the real RSVP (joinEvent flow) — not handled here.
 * Interested = soft save: events/{id}.interested[] holds uids (rules allow
 *              only this field for non-owner updates).
 * Met      = post-event, honest-by-design: routes into PeopleYouMet
 *            (matching retention) — no separate storage.
 */
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db, auth } from "./firebase";

export const isInterested = (event) =>
  !!auth.currentUser && (event?.interested || []).includes(auth.currentUser.uid);

/** Toggle my soft-interest. Returns the new state (true = interested). */
export async function toggleInterested(eventId, currentlyInterested) {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  await updateDoc(doc(db, "events", eventId), {
    interested: currentlyInterested ? arrayRemove(uid) : arrayUnion(uid),
  });
  return !currentlyInterested;
}
