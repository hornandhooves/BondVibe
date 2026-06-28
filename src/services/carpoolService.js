/**
 * Car pool inside the event chat.
 *
 * A driver offers a ride (a live doc in `events/{eventId}/carpools/{id}`) and
 * posts a "carpool" chat message referencing it. Riders request a seat (a doc
 * they own in the `riders/{userId}` subcollection); the driver approves. Seats
 * available are derived live from approved riders.
 *
 * Loyalty perk: a Cloud Function increments the driver's
 * `carpoolStats.seatsShared` when a rider is approved — a manipulation-proof
 * recognition of drivers who help the community get to events.
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

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

    const ref = await addDoc(collection(db, "events", eventId, "carpools"), {
      driverId: uid,
      driverName: input.driverName || "Driver",
      seatsTotal: seats,
      from: input.from.trim(),
      departureTime: input.departureTime?.trim() || "",
      notes: input.notes?.trim() || "",
      status: "open",
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, "events", eventId, "messages"), {
      senderId: uid,
      type: "carpool",
      text: `🚗 Offering a ride · ${seats} seat${seats === 1 ? "" : "s"}`,
      data: { carpoolId: ref.id },
      createdAt: new Date().toISOString(),
      deliveredTo: {},
      readBy: {},
    });
    return { success: true, carpoolId: ref.id };
  } catch (e) {
    console.error("❌ createCarpool:", e);
    return { success: false, error: e.message };
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
 * Driver approves or declines a rider.
 */
export const respondToRequest = async (eventId, carpoolId, riderId, approve) => {
  await updateDoc(
    doc(db, "events", eventId, "carpools", carpoolId, "riders", riderId),
    { status: approve ? "approved" : "declined" }
  );
};

/** Driver closes the car pool. */
export const closeCarpool = async (eventId, carpoolId) => {
  await updateDoc(doc(db, "events", eventId, "carpools", carpoolId), {
    status: "closed",
  });
};

export const subscribeCarpool = (eventId, carpoolId, cb) =>
  onSnapshot(doc(db, "events", eventId, "carpools", carpoolId), (s) =>
    cb(s.exists() ? { id: s.id, ...s.data() } : null)
  );

export const subscribeRiders = (eventId, carpoolId, cb) =>
  onSnapshot(
    collection(db, "events", eventId, "carpools", carpoolId, "riders"),
    (s) => cb(s.docs.map((d) => ({ userId: d.id, ...d.data() })))
  );
