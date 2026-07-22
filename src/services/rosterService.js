/**
 * Event roster — client reads (fix/privacy-event-roster).
 *
 * The attendee roster moved off the world-readable events/{id}.attendees array
 * into the gated events/{id}/roster/{uid} subcollection. A client can read its
 * OWN roster docs across all events via a collectionGroup query (the rule allows
 * `uid == rosterUid`), which replaces every old
 * `where("attendees","array-contains", me)` query. Joining/leaving go through the
 * joinEvent / leaveEvent callables (the subcollection is server-only write).
 */
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  documentId,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";

/** Event ids the current user is on the roster of (any status). */
export async function getMyRosterEventIds() {
  const me = auth.currentUser?.uid;
  if (!me) return [];
  try {
    const snap = await getDocs(
      query(collectionGroup(db, "roster"), where("uid", "==", me))
    );
    // doc path: events/{eventId}/roster/{uid} → parent.parent is the event.
    return [...new Set(snap.docs.map((d) => d.ref.parent.parent.id))];
  } catch (e) {
    console.error("❌ getMyRosterEventIds:", e);
    return [];
  }
}

/** The current user's roster events as `{ id, ...data }` docs (chunked by id). */
export async function getMyRosterEvents() {
  const ids = await getMyRosterEventIds();
  if (!ids.length) return [];
  const events = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const snap = await getDocs(
      query(collection(db, "events"), where(documentId(), "in", chunk))
    );
    snap.docs.forEach((d) => events.push({ id: d.id, ...d.data() }));
  }
  return events;
}

/** Whether the current user is on a given event's roster (reads their own doc). */
export async function isOnRoster(eventId) {
  const me = auth.currentUser?.uid;
  if (!me || !eventId) return false;
  try {
    return (await getDoc(doc(db, "events", eventId, "roster", me))).exists();
  } catch (e) {
    return false;
  }
}

/**
 * The active roster of an event (HOST/admin only — the rule denies a list to
 * others). Returns active participant uids. Callers gate on host before calling.
 */
export async function getEventRosterUids(eventId) {
  try {
    const snap = await getDocs(
      query(collection(db, "events", eventId, "roster"), where("status", "==", "active"))
    );
    return snap.docs.map((d) => d.data().uid || d.id);
  } catch (e) {
    return []; // not a host → denied; the roster list is host-only by design
  }
}

/** Leave an event (free RSVP / waitlist) — server-only roster write. */
export async function leaveEvent(eventId) {
  const fn = httpsCallable(getFunctions(), "leaveEvent");
  const res = await fn({ eventId });
  return res.data;
}

/** Join a free event — server-only roster write (capacity + waitlist enforced). */
export async function joinEvent(eventId) {
  const fn = httpsCallable(getFunctions(), "joinEvent");
  const res = await fn({ eventId });
  return res.data;
}
