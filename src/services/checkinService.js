/**
 * QR check-in. The attendee shows a QR encoding `bvchk:{eventId}:{userId}`;
 * the host scans it and writes events/{eventId}/checkins/{userId} (host-only
 * per rules, so attendance can't be self-claimed).
 */
import {
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { isUserAttending } from "../utils/eventHelpers";
import { getEventReservations, redeemMembershipCredit } from "./membershipService";

export const CHECKIN_PREFIX = "bvchk";

export const buildCheckinPayload = (eventId, userId) =>
  `${CHECKIN_PREFIX}:${eventId}:${userId}`;

export const parseCheckinPayload = (raw) => {
  const parts = (raw || "").trim().split(":");
  if (parts.length !== 3 || parts[0] !== CHECKIN_PREFIX) return null;
  return { eventId: parts[1], userId: parts[2] };
};

/**
 * Validate a scanned QR for an event and record the check-in.
 * @param {string} eventId - the event being scanned for
 * @param {string} raw - raw scanned QR string
 * @returns {Promise<{success:boolean, name?:string, error?:string, already?:boolean}>}
 */
export const checkInFromScan = async (eventId, raw) => {
  const parsed = parseCheckinPayload(raw);
  if (!parsed) return { success: false, error: "This isn't a Kinlo check-in code." };
  if (parsed.eventId !== eventId) {
    return { success: false, error: "That code is for a different event." };
  }

  try {
    const evSnap = await getDoc(doc(db, "events", eventId));
    if (!evSnap.exists()) return { success: false, error: "Event not found." };
    if (!isUserAttending(evSnap.data().attendees, parsed.userId)) {
      return { success: false, error: "This person isn't on the guest list." };
    }

    const userSnap = await getDoc(doc(db, "users", parsed.userId));
    const name = userSnap.exists()
      ? userSnap.data().fullName || userSnap.data().name || "Guest"
      : "Guest";

    const ref = doc(db, "events", eventId, "checkins", parsed.userId);
    const existing = await getDoc(ref);
    if (existing.exists()) return { success: true, name, already: true };

    await setDoc(ref, {
      userId: parsed.userId,
      name,
      checkedInAt: new Date().toISOString(),
      by: auth.currentUser?.uid || null,
    });

    // Membership credit is consumed AT CHECK-IN (kinlo_business/05 §D). If this
    // attendee reserved with a membership, redeem that reservation now. The
    // server transaction is idempotent (guarded by reservation.status), so a
    // re-scan never double-deducts. Best-effort — never block the check-in.
    try {
      const reservations = await getEventReservations(eventId);
      const reserved = reservations.find(
        (x) => x.userId === parsed.userId && x.status === "reserved"
      );
      if (reserved) await redeemMembershipCredit(reserved.id);
    } catch (e) {
      // credit redemption is best-effort; the attendance stands regardless
    }

    return { success: true, name };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

export const subscribeCheckins = (eventId, cb) =>
  onSnapshot(collection(db, "events", eventId, "checkins"), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
