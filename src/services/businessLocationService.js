/**
 * Client access to a business's gated location (KIN-284/288).
 *
 * Copied from src/services/eventLocationService.js, not imported — the
 * ticket's isolation restriction applies to the whole stack (see
 * businessLocation.js's header for why).
 *
 * The read gate is staff/owner OR a confirmed buyer (KIN-288): firestore.rules'
 * businesses/{bizId}/private/{doc} checks exists() on
 * businesses/{bizId}/confirmedBuyers/{uid}, a doc paymentWebhook.js's
 * handleServiceBookingPayment writes (Admin SDK only) when a booking's
 * payment confirms. `hasConfirmedBooking` below is the client's own signal
 * that the caller already knows this and can skip straight to fetching the
 * private doc, rather than waiting on the synchronous staff/owner heuristic.
 */
import { doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { getMyBizId } from "./businessService";
import { resolveServiceLocation } from "../utils/businessLocation";

/**
 * Calls the setServiceLocation Cloud Function (functions/index.js) — the
 * server computes the coarse/exact split, same as setEventLocation does for
 * events. { bizId, address, exactCoords? } is enough; venueName/area are
 * derived server-side from `address` when omitted.
 * @param {{bizId:string, address?:string, exactCoords?:{latitude:number,longitude:number}, venueName?:string, area?:string, entryNotes?:string}} args
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export const setServiceLocation = async (args) => {
  try {
    const fn = httpsCallable(getFunctions(), "setServiceLocation");
    const res = await fn(args);
    return { success: true, ...(res.data || {}) };
  } catch (e) {
    return { success: false, error: (e && e.message) || "error" };
  }
};

/**
 * Synchronous OPTIMISTIC hint: "am I currently operating as this business"
 * (active business context matches bizId) — the cheapest available
 * synchronous signal for staff/owner, mirroring isEventParticipant's
 * creator/coHost shortcut. This drives only the initial coarse-vs-exact
 * render; the authoritative reveal is fetchPrivateLocation, which the rules
 * gate on real staff/owner membership. A caller that already knows better
 * (e.g. BusinessHub already in host mode for this bizId) should pass it as
 * `isParticipant` instead of relying on this.
 */
export const isServiceParticipant = (bizId, uid = auth.currentUser?.uid) => {
  if (!bizId || !uid) return false;
  return getMyBizId() === bizId;
};

/**
 * Fetch the private exact-location doc. Returns null when the caller isn't
 * staff/owner nor a confirmed buyer (rules deny) or the doc doesn't exist
 * (location never set).
 * @param {string} bizId
 * @returns {Promise<object|null>}
 */
export const fetchPrivateLocation = async (bizId) => {
  if (!bizId) return null;
  try {
    const snap = await getDoc(doc(db, "businesses", bizId, "private", "location"));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    // permission-denied here is EXPECTED for a non-participant (neither
    // staff/owner nor a confirmed buyer). A failed-precondition/unavailable
    // is not expected and looks identical from here — log the code before
    // degrading to approximate.
    console.warn("⚠️ fetchPrivateLocation:", e?.code, bizId);
    return null;
  }
};

/**
 * Resolve a business's location for the current user, fetching the private
 * doc when they're a participant. Never throws; never blanks when the
 * business simply never set a location (resolveServiceLocation's
 * hasLocation:false — the caller renders nothing in that case).
 * @param {object} business businesses/{bizId}/public/profile doc data (must
 *   include bizId as business.id, or pass opts.bizId)
 * @param {object} [opts]
 * @param {string} [opts.bizId] defaults to business?.id
 * @param {string} [opts.uid] defaults to the signed-in user
 * @param {boolean} [opts.isParticipant] real staff/owner membership, when the
 *   caller already knows it. Falls back to the synchronous active-business
 *   heuristic (isServiceParticipant) when omitted.
 * @param {boolean} [opts.hasConfirmedBooking] KIN-288: a confirmed booking
 *   with this business — counts as a participant, same as staff/owner, since
 *   firestore.rules now grants read via businesses/{bizId}/confirmedBuyers/{uid}.
 * @returns {Promise<ReturnType<typeof resolveServiceLocation>>}
 */
export const getServiceLocation = async (
  business,
  { bizId, uid = auth.currentUser?.uid, isParticipant, hasConfirmedBooking } = {},
) => {
  const id = bizId || business?.id;
  const participant =
    isParticipant ?? (isServiceParticipant(id, uid) || !!hasConfirmedBooking);
  const privateLocation = participant ? await fetchPrivateLocation(id) : null;
  return resolveServiceLocation(business, { isParticipant: participant, privateLocation });
};
