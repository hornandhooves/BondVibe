/**
 * Rental service — vehicle rental marketplace (model A).
 *
 * A local partner publishes their fleet (vehicleProviders + vehicles) and
 * BondVibe takes a commission on each rental. Browsing is a city-scoped list
 * (no map / no geo native dep). All money-sensitive writes (rentals + vehicle
 * status transitions to/from "rented") go through Cloud Functions:
 *   - reserveVehicle       (atomic reserve + Stripe PaymentIntent + deposit hold)
 *   - completeRental       (release/capture deposit, free the vehicle)
 *   - expireVehicleReservations (scheduled — release unpaid holds)
 *
 * The client only ever writes vehicle/provider *content* it owns.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as qLimit,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { logger } from "../utils/logger";

export const VEHICLE_TYPES = ["scooter", "bike", "car"];
export const VEHICLE_STATUS = ["available", "rented", "maintenance"];

/** Shape a raw Firestore vehicle doc into a UI-friendly object. */
const shapeVehicle = (d) => {
  const v = d.data();
  const specs = v.specs || {};
  return {
    id: d.id,
    providerId: v.providerId || null,
    ownerId: v.ownerId || null,
    type: v.type || "scooter",
    title: v.title || "Vehicle",
    city: v.city || "",
    pickupLabel: v.pickupLabel || v.pickupLocation || "",
    photos: Array.isArray(v.photos) ? v.photos : [],
    status: v.status || "available",
    requiresLicense: !!v.requiresLicense,
    rangeKm: v.rangeKm || specs.rangeKm || null,
    pricePerHourCentavos: v.pricePerHourCentavos || specs.pricePerHourCentavos || 0,
    pricePerDayCentavos: v.pricePerDayCentavos || specs.pricePerDayCentavos || 0,
    depositCentavos: v.depositCentavos || specs.depositCentavos || 0,
  };
};

// ---------------------------------------------------------------------------
// Browse (renter side)
// ---------------------------------------------------------------------------

/**
 * List available vehicles, optionally scoped to a city and/or type.
 * @param {{ city?:string, type?:string, max?:number }} opts
 * @returns {Promise<Array>}
 */
export const getAvailableVehicles = async ({ city, type, max = 50 } = {}) => {
  try {
    const clauses = [where("status", "==", "available")];
    if (city) clauses.push(where("city", "==", city));
    if (type) clauses.push(where("type", "==", type));
    const q = query(collection(db, "vehicles"), ...clauses, qLimit(max));
    const snap = await getDocs(q);
    return snap.docs.map(shapeVehicle);
  } catch (e) {
    logger.error("getAvailableVehicles:", e);
    return [];
  }
};

/** Fetch a single vehicle by id. */
export const getVehicle = async (vehicleId) => {
  try {
    const snap = await getDoc(doc(db, "vehicles", vehicleId));
    return snap.exists() ? shapeVehicle(snap) : null;
  } catch (e) {
    logger.error("getVehicle:", e);
    return null;
  }
};

/** Fetch a provider/partner by id. */
export const getProvider = async (providerId) => {
  try {
    const snap = await getDoc(doc(db, "vehicleProviders", providerId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    logger.error("getProvider:", e);
    return null;
  }
};

/** The signed-in host's own provider profile, if any. */
export const getMyProvider = async () => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    const q = query(
      collection(db, "vehicleProviders"),
      where("ownerId", "==", uid),
      qLimit(1)
    );
    const snap = await getDocs(q);
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) {
    logger.error("getMyProvider:", e);
    return null;
  }
};

/** Vehicles published by the signed-in host (their fleet). */
export const getMyFleet = async () => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const q = query(
      collection(db, "vehicles"),
      where("ownerId", "==", uid),
      qLimit(100)
    );
    const snap = await getDocs(q);
    return snap.docs.map(shapeVehicle);
  } catch (e) {
    logger.error("getMyFleet:", e);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Reservation + lifecycle (Cloud Functions)
// ---------------------------------------------------------------------------

/**
 * Reserve an available vehicle and open its payment.
 * @param {{ vehicleId:string, startAt:string, endAt:string, eventId?:string }} p
 * @returns {Promise<{success:boolean, rentalId?:string, clientSecret?:string,
 *   depositClientSecret?:string, error?:string}>}
 */
export const reserveVehicle = async ({ vehicleId, startAt, endAt, eventId }) => {
  try {
    const fn = httpsCallable(getFunctions(), "reserveVehicle");
    const res = await fn({ vehicleId, startAt, endAt, eventId: eventId || null });
    return { success: true, ...res.data };
  } catch (e) {
    logger.error("reserveVehicle:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Complete (return) a rental — releases the deposit hold and frees the vehicle.
 * @param {string} rentalId
 * @param {boolean} [damage] owner-only: capture the deposit for damage.
 */
export const completeRental = async (rentalId, damage = false) => {
  try {
    const fn = httpsCallable(getFunctions(), "completeRental");
    const res = await fn({ rentalId, damage });
    return { success: true, ...res.data };
  } catch (e) {
    logger.error("completeRental:", e);
    return { success: false, error: e.message };
  }
};

/** Fetch a single rental by id (readable by renter/owner per rules). */
export const getRental = async (rentalId) => {
  try {
    const snap = await getDoc(doc(db, "rentals", rentalId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    logger.error("getRental:", e);
    return null;
  }
};

/** Rentals where the signed-in user is the renter (most recent first). */
export const getMyRentals = async () => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const q = query(
      collection(db, "rentals"),
      where("renterId", "==", uid),
      orderBy("reservedAt", "desc"),
      qLimit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    logger.error("getMyRentals:", e);
    return [];
  }
};

/** Rentals against vehicles owned by the signed-in partner. */
export const getOwnerRentals = async () => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const q = query(
      collection(db, "rentals"),
      where("ownerId", "==", uid),
      orderBy("reservedAt", "desc"),
      qLimit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    logger.error("getOwnerRentals:", e);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Partner fleet management (owner side — content only)
// ---------------------------------------------------------------------------

/** Create a provider profile for the caller. */
export const createProvider = async ({ name, city } = {}) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in required.");
  const ref = await addDoc(collection(db, "vehicleProviders"), {
    ownerId: uid,
    name: name || "",
    city: city || "",
    verified: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

/** Return the caller's providerId, creating a provider on first use. */
export const ensureProvider = async ({ name, city } = {}) => {
  const existing = await getMyProvider();
  if (existing) return existing.id;
  return createProvider({ name, city });
};

/** Publish a vehicle in the caller's fleet. */
export const createVehicle = async (data) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in required.");
  const ref = await addDoc(collection(db, "vehicles"), {
    ownerId: uid,
    providerId: data.providerId || null,
    type: VEHICLE_TYPES.includes(data.type) ? data.type : "scooter",
    title: data.title || "Vehicle",
    city: data.city || "",
    pickupLabel: data.pickupLabel || "",
    photos: Array.isArray(data.photos) ? data.photos : [],
    requiresLicense: !!data.requiresLicense,
    rangeKm: data.rangeKm || null,
    pricePerHourCentavos: data.pricePerHourCentavos || 0,
    pricePerDayCentavos: data.pricePerDayCentavos || 0,
    depositCentavos: data.depositCentavos || 0,
    status: "available",
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

/** Update a vehicle the caller owns (content + available/maintenance status). */
export const updateVehicle = async (vehicleId, updates) => {
  await updateDoc(doc(db, "vehicles", vehicleId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

/** Remove a vehicle the caller owns. */
export const deleteVehicle = async (vehicleId) => {
  await deleteDoc(doc(db, "vehicles", vehicleId));
};
