/**
 * marketplaceService — the SERVICES marketplace (Marketplace P1).
 *
 * A service = a public SessionType (`publicListing == true`) of a business. This
 * module only EXPOSES those across businesses (collectionGroup) by vertical +
 * city and reads a single listing. It creates NO parallel collection — booking
 * and payment reuse the existing engine (agenda + memberships checkout).
 *
 * Rentals is surfaced as a vertical in the UI but has its OWN flow (`vehicles`);
 * it is never a SessionType and never queried here — the explore screen routes
 * the Rentals tile to RentalHub.
 */
import {
  collectionGroup,
  query,
  where,
  getDocs,
  limit as qLimit,
  doc,
  getDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { shapeListing, SERVICE_VERTICALS, MARKETPLACE_VERTICALS } from "../utils/marketplaceShape";

// Re-export the pure taxonomy/shaping so callers keep a single import surface.
export { shapeListing, SERVICE_VERTICALS, MARKETPLACE_VERTICALS };

/**
 * Public listings across all businesses. Firestore-side filters: publicListing
 * (+ vertical). City is filtered client-side (a listing with no city matches
 * any city). Requires the collectionGroup read rule + composite index.
 * @param {{ vertical?: string, city?: string, max?: number }} [opts]
 * @returns {Promise<Array>}
 */
export async function getMarketplaceListings({ vertical, city, max = 50 } = {}) {
  const clauses = [where("publicListing", "==", true)];
  if (vertical) clauses.push(where("vertical", "==", vertical));
  const q = query(collectionGroup(db, "sessionTypes"), ...clauses, qLimit(max));
  const snap = await getDocs(q);
  let list = snap.docs.map(shapeListing).filter((l) => l.bizId);
  if (city) list = list.filter((l) => !l.city || l.city === city);
  return list;
}

/** Distinct non-empty cities across current public listings (for the filter). */
export async function getMarketplaceCities() {
  const list = await getMarketplaceListings({ max: 200 });
  return [...new Set(list.map((l) => l.city).filter(Boolean))].sort();
}

/** A single public listing by business + id (detail screen). */
export async function getListing(bizId, id) {
  if (!bizId || !id) return null;
  const snap = await getDoc(doc(db, "businesses", bizId, "sessionTypes", id));
  if (!snap.exists()) return null;
  return shapeListing({ id: snap.id, ref: snap.ref, data: () => snap.data() });
}

/** The business behind a listing (name + verified/vertical for the detail host card). */
export async function getListingBusiness(bizId) {
  if (!bizId) return null;
  const snap = await getDoc(doc(db, "businesses", bizId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Reserve + pay a slot on a public service (Marketplace P1 · M4). Calls the
 * reserveServiceBooking Cloud Function — the SERVER validates price + capacity
 * atomically; the client never sends an amount. Returns
 * { success, bookingId, clientSecret } or { success:false, error } where error
 * is a server reason code (slot_full / host_payouts_not_ready / not_public / …).
 */
export async function reserveServiceBooking({ bizId, sessionTypeId, startAt, buyerName }) {
  try {
    const fn = httpsCallable(getFunctions(), "reserveServiceBooking");
    const res = await fn({
      bizId,
      sessionTypeId,
      startAt,
      buyerName: buyerName || auth.currentUser?.displayName || "",
    });
    return { success: true, ...(res.data || {}) };
  } catch (e) {
    return { success: false, error: (e && e.message) || "error" };
  }
}
