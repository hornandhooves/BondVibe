/**
 * Car pool inside the event chat.
 *
 * A driver offers a ride (a live doc in `events/{eventId}/carpools/{id}`) and
 * posts a "carpool" chat message referencing it. Riders request a seat (a doc
 * they own in the `riders/{userId}` subcollection); the driver approves. Seats
 * available are derived live from approved riders.
 *
 * Loyalty perk: a Cloud Function credits the driver's
 * `carpoolStats.seatsShared` once the event has ended (by approved-rider count),
 * not on approval (BUG 28.2) — a manipulation-proof recognition of drivers who
 * actually helped the community get to events.
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { createNotification } from "../utils/notificationService";

// Notify the riders currently attached to a ride (best-effort, never blocks).
const notifyRiders = async (eventId, carpoolId, exceptUid, notification) => {
  try {
    const snap = await getDocs(
      collection(db, "events", eventId, "carpools", carpoolId, "riders")
    );
    await Promise.all(
      snap.docs
        .filter((d) => d.id !== exceptUid && ["approved", "requested"].includes(d.data().status))
        .map((d) => createNotification(d.id, { ...notification, metadata: { eventId, carpoolId } }))
    );
  } catch (_e) {
    // best-effort — the live card already reflects the new state
  }
};

/**
 * Create a car-pool offer and post a referencing chat message.
 * @param {string} eventId
 * @param {object} input { seatsTotal, from, departureTime, notes, driverName }
 */
export const createCarpool = async (eventId, input) => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return { success: false, error: "Not signed in." };
    const seats = parseInt(input.seatsTotal, 10);
    if (!seats || seats < 1) return { success: false, error: "Add at least one seat." };
    if (!input.from?.trim()) return { success: false, error: "Add a pickup area." };

    // SECURITY (fix/security-carpool): creation goes through a callable so the
    // sensitive pickup (fromAddress/fromCoords) lands in the GATED private subdoc,
    // and driverId/seatsTotal are set server-side.
    const fn = httpsCallable(getFunctions(), "createCarpoolOffer");
    const res = await fn({
      eventId,
      seatsTotal: seats,
      from: input.from.trim(),
      fromAddress: input.fromAddress?.trim() || "",
      fromCoords: input.fromCoords || null,
      departureTime: input.departureTime?.trim() || "",
      notes: input.notes?.trim() || "",
      driverName: input.driverName || "Driver",
    });
    const carpoolId = res.data.carpoolId;

    await addDoc(collection(db, "events", eventId, "messages"), {
      senderId: uid,
      type: "carpool",
      text: `Offering a ride · ${seats} seat${seats === 1 ? "" : "s"}`,
      data: { carpoolId },
      createdAt: new Date().toISOString(),
      deliveredTo: {},
      readBy: {},
    });
    return { success: true, carpoolId };
  } catch (e) {
    console.error("❌ createCarpool:", e);
    return { success: false, error: e.message };
  }
};

/** Pickup detail (address/coords) — readable only by the driver + approved riders. */
export const getCarpoolPickup = async (eventId, carpoolId) => {
  try {
    const s = await getDoc(
      doc(db, "events", eventId, "carpools", carpoolId, "private", "pickup")
    );
    return s.exists() ? s.data() : null;
  } catch (e) {
    return null; // gated: not the driver / not an approved rider
  }
};

/**
 * Rider requests a seat (creates their own rider doc).
 */
export const requestSeat = async (eventId, carpoolId, riderName) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(
    doc(db, "events", eventId, "carpools", carpoolId, "riders", uid),
    { status: "requested", name: riderName || "Rider", requestedAt: serverTimestamp() }
  );
};

/**
 * Rider cancels their request/seat.
 */
export const cancelSeat = async (eventId, carpoolId) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(db, "events", eventId, "carpools", carpoolId, "riders", uid));
};

/**
 * Driver approves or declines a rider. SECURITY (fix/security-carpool): approval
 * runs through the transactional respondToCarpoolRequest callable (anti-oversell);
 * rules forbid setting status:"approved" from a client. Throws "carpool_full".
 */
export const respondToRequest = async (eventId, carpoolId, riderId, approve) => {
  const fn = httpsCallable(getFunctions(), "respondToCarpoolRequest");
  const res = await fn({ eventId, carpoolId, riderId, approve });
  return res.data;
};

/** Driver closes the car pool (no more requests; existing riders keep seats). */
export const closeCarpool = async (eventId, carpoolId) => {
  await updateDoc(doc(db, "events", eventId, "carpools", carpoolId), {
    status: "closed",
  });
};

/** Driver cancels the whole ride — riders lose their seats and are notified. */
export const cancelCarpool = async (eventId, carpoolId) => {
  const uid = auth.currentUser?.uid;
  await updateDoc(doc(db, "events", eventId, "carpools", carpoolId), {
    status: "cancelled",
  });
  await notifyRiders(eventId, carpoolId, uid, {
    type: "carpool_cancelled",
    title: "Ride cancelled",
    message: "A car pool you joined was cancelled by the driver.",
    icon: "car",
  });
};

/** Driver reopens a closed/cancelled ride so riders can request again. */
export const reopenCarpool = async (eventId, carpoolId) => {
  await updateDoc(doc(db, "events", eventId, "carpools", carpoolId), {
    status: "open",
  });
};

/**
 * Driver removes an already-listed rider. Rules let the driver update (not
 * delete) a rider doc, so we mark it "removed" and notify the rider.
 */
export const removeRider = async (eventId, carpoolId, riderId) => {
  await updateDoc(
    doc(db, "events", eventId, "carpools", carpoolId, "riders", riderId),
    { status: "removed" }
  );
  try {
    await createNotification(riderId, {
      type: "carpool_removed",
      title: "Removed from a ride",
      message: "The driver removed you from a car pool.",
      icon: "car",
      metadata: { eventId, carpoolId },
    });
  } catch (_e) {
    // best-effort
  }
};

/** Driver edits the offer (seats / pickup / time / notes). */
export const updateCarpool = async (eventId, carpoolId, updates = {}) => {
  // SECURITY (fix/security-carpool): seatsTotal is immutable after creation (rule
  // denylist — a bump would oversell + farm seatsShared); the pickup lives in the
  // server-only private subdoc. So only from/departureTime/notes are editable here.
  const clean = {};
  if (updates.from != null) clean.from = String(updates.from).trim();
  if (updates.departureTime != null) clean.departureTime = String(updates.departureTime).trim();
  if (updates.notes != null) clean.notes = String(updates.notes).trim();
  if (Object.keys(clean).length === 0) return;
  await updateDoc(doc(db, "events", eventId, "carpools", carpoolId), clean);
};

export const subscribeCarpool = (eventId, carpoolId, cb) =>
  onSnapshot(doc(db, "events", eventId, "carpools", carpoolId), (s) =>
    cb(s.exists() ? { id: s.id, ...s.data() } : null)
  );

// Full roster — DRIVER only (rules deny a list to riders/other participants).
export const subscribeRiders = (eventId, carpoolId, cb) =>
  onSnapshot(
    collection(db, "events", eventId, "carpools", carpoolId, "riders"),
    (s) => cb(s.docs.map((d) => ({ userId: d.id, ...d.data() })))
  );

// A rider's OWN request doc (what a non-driver can read of the roster).
export const subscribeMyRider = (eventId, carpoolId, cb) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  return onSnapshot(
    doc(db, "events", eventId, "carpools", carpoolId, "riders", uid),
    (s) => cb(s.exists() ? { userId: uid, ...s.data() } : null)
  );
};
