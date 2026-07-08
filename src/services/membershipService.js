/**
 * Membership service — host-defined membership plans (class packs / passes).
 *
 * Slice 1 scope: CRUD for membershipPlans (the host's templates) and read
 * helpers. Purchased memberships, credit redemption, reminders and analytics
 * are added in later slices and are written server-side (Cloud Functions),
 * never directly from the client.
 *
 * A plan can be:
 *   - type "credits":  includes a fixed number of class credits (creditsIncluded)
 *                      that expire validityDays after purchase.
 *   - type "unlimited": unlimited attendance until it expires (validityDays).
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { logger } from "../utils/logger";
import {
  MEMBERSHIP_PLAN_TYPES,
  MEMBERSHIP_AUDIENCE,
  audienceAllows,
  validatePlanInput,
  getMembershipState,
  getMembershipExpiryDate,
  formatPlanPrice,
  describePlan,
  toMillis,
} from "../utils/membershipUtils";

const FUNCTIONS_BASE_URL =
  "https://us-central1-bondvibe-dev.cloudfunctions.net";

// Re-export pure helpers so existing imports from this service keep working.
export {
  MEMBERSHIP_PLAN_TYPES,
  MEMBERSHIP_AUDIENCE,
  audienceAllows,
  getMembershipState,
  getMembershipExpiryDate,
  formatPlanPrice,
  describePlan,
};

/**
 * Create a membership plan for the current host.
 * @param {object} planData { name, description, type, creditsIncluded,
 *                            validityDays, priceCentavos, allowAutoRenew }
 * @returns {Promise<{success:boolean, planId?:string, error?:string}>}
 */
export const createMembershipPlan = async (planData) => {
  try {
    const hostId = auth.currentUser?.uid;
    if (!hostId) return { success: false, error: "Not signed in." };

    const error = validatePlanInput(planData);
    if (error) return { success: false, error };

    // Every plan is credit-based now (no unlimited). audienceTier gates who may
    // buy/redeem it (kinlo_business/05 §G); default 'both'.
    const audienceTier = [
      MEMBERSHIP_AUDIENCE.LOCAL,
      MEMBERSHIP_AUDIENCE.GENERAL,
      MEMBERSHIP_AUDIENCE.BOTH,
    ].includes(planData.audienceTier)
      ? planData.audienceTier
      : MEMBERSHIP_AUDIENCE.BOTH;

    const planDoc = {
      hostId,
      name: planData.name.trim(),
      description: planData.description?.trim() || "",
      terms: planData.terms?.trim() || "",
      type: MEMBERSHIP_PLAN_TYPES.CREDITS,
      creditsIncluded: Number(planData.creditsIncluded),
      validityDays: Number(planData.validityDays),
      audienceTier,
      priceCentavos: Number(planData.priceCentavos),
      currency: "MXN",
      allowAutoRenew: planData.allowAutoRenew !== false, // default true
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, "membershipPlans"), planDoc);
    logger.log("✅ Membership plan created:", ref.id);
    return { success: true, planId: ref.id };
  } catch (e) {
    console.error("❌ Error creating membership plan:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Update an existing plan (owner only — enforced by rules).
 * @param {string} planId
 * @param {object} updates
 */
export const updateMembershipPlan = async (planId, updates) => {
  try {
    // Re-validate when the relevant fields are present.
    if (
      updates.name !== undefined ||
      updates.priceCentavos !== undefined ||
      updates.validityDays !== undefined ||
      updates.type !== undefined
    ) {
      const error = validatePlanInput(updates);
      if (error) return { success: false, error };
    }

    const payload = { ...updates, updatedAt: serverTimestamp() };
    if (payload.name) payload.name = payload.name.trim();
    if (payload.priceCentavos) payload.priceCentavos = Number(payload.priceCentavos);
    if (payload.validityDays) payload.validityDays = Number(payload.validityDays);
    if (payload.creditsIncluded != null) {
      payload.creditsIncluded = Number(payload.creditsIncluded);
    }

    await updateDoc(doc(db, "membershipPlans", planId), payload);
    logger.log("✅ Membership plan updated:", planId);
    return { success: true };
  } catch (e) {
    console.error("❌ Error updating membership plan:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Archive a plan (soft delete) so it stops being sold but existing memberships
 * and history remain intact.
 * @param {string} planId
 * @param {boolean} active set false to archive, true to reactivate
 */
export const setMembershipPlanActive = async (planId, active) => {
  try {
    await updateDoc(doc(db, "membershipPlans", planId), {
      active,
      updatedAt: serverTimestamp(),
    });
    logger.log(`✅ Membership plan ${active ? "reactivated" : "archived"}:`, planId);
    return { success: true };
  } catch (e) {
    console.error("❌ Error archiving membership plan:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Get all plans for a host (newest first). Includes archived by default so the
 * host management screen can show them; pass { activeOnly: true } for buyers.
 * @param {string} hostId
 * @param {{activeOnly?: boolean}} options
 * @returns {Promise<Array>}
 */
export const getHostMembershipPlans = async (hostId, { activeOnly = false } = {}) => {
  try {
    if (!hostId) return [];
    const plansQuery = query(
      collection(db, "membershipPlans"),
      where("hostId", "==", hostId),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(plansQuery);
    const plans = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return activeOnly ? plans.filter((p) => p.active) : plans;
  } catch (e) {
    console.error("❌ Error loading host membership plans:", e);
    return [];
  }
};

/**
 * Fetch a single plan.
 * @param {string} planId
 * @returns {Promise<object|null>}
 */
export const getMembershipPlan = async (planId) => {
  try {
    const snap = await getDoc(doc(db, "membershipPlans", planId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error("❌ Error loading membership plan:", e);
    return null;
  }
};

/**
 * Create a Stripe PaymentIntent to purchase a membership plan.
 * The membership document itself is created by the payment webhook on success.
 * @param {string} planId
 * @returns {Promise<{success:boolean, clientSecret?:string,
 *                     paymentIntentId?:string, breakdown?:object, error?:string}>}
 */
export const createMembershipPaymentIntent = async (planId) => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) return { success: false, error: "Not signed in." };

    const response = await fetch(
      `${FUNCTIONS_BASE_URL}/createMembershipPaymentIntent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, userId }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || "Could not start purchase." };
    }
    return { success: true, ...data };
  } catch (e) {
    console.error("❌ Error creating membership payment intent:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Get the current user's memberships (newest first).
 * @param {string} [userId] defaults to current user
 * @returns {Promise<Array>}
 */
export const getUserMemberships = async (userId = null) => {
  try {
    const uid = userId || auth.currentUser?.uid;
    if (!uid) return [];
    const q = query(
      collection(db, "memberships"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("❌ Error loading user memberships:", e);
    return [];
  }
};

/**
 * A membership's utilization history: every redemption (check-in that spent a
 * credit) newest-first. Each record carries the event/class title + credits
 * spent + timestamp. Undone check-ins are marked status:'undone'.
 * @param {string} membershipId
 * @returns {Promise<Array>}
 */
export const getMembershipRedemptions = async (membershipId) => {
  try {
    if (!membershipId) return [];
    const snap = await getDocs(
      query(collection(db, "membershipRedemptions"), where("membershipId", "==", membershipId))
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toMillis(b.redeemedAt) - toMillis(a.redeemedAt));
  } catch (e) {
    console.error("❌ getMembershipRedemptions:", e);
    return [];
  }
};

/**
 * Get a user's active, usable membership with a given host, if any.
 * "Usable" = active, not expired, and (for credit packs) has credits left.
 * @param {string} hostId
 * @param {string} [userId]
 * @returns {Promise<object|null>}
 */
export const getUsableMembershipForHost = async (hostId, userId = null) => {
  try {
    const uid = userId || auth.currentUser?.uid;
    if (!uid || !hostId) return null;
    const q = query(
      collection(db, "memberships"),
      where("userId", "==", uid),
      where("hostId", "==", hostId)
    );
    const snapshot = await getDocs(q);
    const usable = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => getMembershipState(m) === "active");
    // Prefer the one expiring soonest so credits are used before they lapse.
    usable.sort((a, b) => toMillis(a.expiresAt) - toMillis(b.expiresAt));
    return usable[0] || null;
  } catch (e) {
    console.error("❌ Error finding usable membership:", e);
    return null;
  }
};

/**
 * Reserve a membership credit for an event (places a hold; deducted at check-in).
 * @param {string} eventId
 * @returns {Promise<{success:boolean, reservationId?:string, error?:string}>}
 */
export const reserveMembershipCredit = async (eventId) => {
  try {
    const fn = httpsCallable(getFunctions(), "reserveMembershipCredit");
    const res = await fn({ eventId });
    return { success: true, ...res.data };
  } catch (e) {
    console.error("❌ reserveMembershipCredit:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Redeem a reservation at check-in (host only) — deducts the credit.
 * @param {string} reservationId
 */
export const redeemMembershipCredit = async (reservationId) => {
  try {
    const fn = httpsCallable(getFunctions(), "redeemMembershipCredit");
    const res = await fn({ reservationId });
    return { success: true, ...res.data };
  } catch (e) {
    console.error("❌ redeemMembershipCredit:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Undo a membership check-in (host "Undo"): restores the credit and puts the
 * reservation back to reserved. Idempotent server-side.
 * @param {string} reservationId
 */
export const undoMembershipRedemption = async (reservationId) => {
  try {
    const fn = httpsCallable(getFunctions(), "undoMembershipRedemption");
    const res = await fn({ reservationId });
    return { success: true, ...res.data };
  } catch (e) {
    console.error("❌ undoMembershipRedemption:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Release a reservation when an attendee cancels (≥2h returns the credit).
 * @param {string} reservationId
 */
export const releaseMembershipReservation = async (reservationId) => {
  try {
    const fn = httpsCallable(getFunctions(), "releaseMembershipReservation");
    const res = await fn({ reservationId });
    return { success: true, ...res.data };
  } catch (e) {
    console.error("❌ releaseMembershipReservation:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Get the current user's active reservation for an event (if they joined with
 * a membership credit), else null.
 * @param {string} eventId
 * @param {string} [userId]
 * @returns {Promise<object|null>}
 */
export const getUserReservationForEvent = async (eventId, userId = null) => {
  try {
    const uid = userId || auth.currentUser?.uid;
    if (!uid || !eventId) return null;
    const q = query(
      collection(db, "membershipReservations"),
      where("eventId", "==", eventId),
      where("userId", "==", uid),
      where("status", "==", "reserved"),
      limit(1)
    );
    const snapshot = await getDocs(q);
    return snapshot.empty
      ? null
      : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  } catch (e) {
    console.error("❌ getUserReservationForEvent:", e);
    return null;
  }
};

/**
 * Get all active reservations for an event (host check-in view).
 * @param {string} eventId
 * @returns {Promise<Array>}
 */
export const getEventReservations = async (eventId) => {
  try {
    if (!eventId) return [];
    const q = query(
      collection(db, "membershipReservations"),
      where("eventId", "==", eventId),
      where("status", "in", ["reserved", "redeemed"])
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("❌ getEventReservations:", e);
    return [];
  }
};

/**
 * Aggregate analytics for a host across their memberships, payments and
 * attendance. Read-only; computed client-side from indexed (hostId ==) queries.
 * For very high volumes this can be replaced by trigger-maintained counters.
 * @param {string} [hostId] defaults to current user
 * @returns {Promise<object>}
 */
export const getHostAnalytics = async (hostId = null) => {
  try {
    const uid = hostId || auth.currentUser?.uid;
    if (!uid) return null;

    const [membershipsSnap, paymentsSnap, redemptionsSnap, hostSnap] =
      await Promise.all([
        getDocs(query(collection(db, "memberships"), where("hostId", "==", uid))),
        getDocs(query(collection(db, "payments"), where("hostId", "==", uid))),
        getDocs(
          query(collection(db, "membershipRedemptions"), where("hostId", "==", uid))
        ),
        getDoc(doc(db, "users", uid)),
      ]);
    const hostStats = hostSnap.exists() ? hostSnap.data().hostStats || null : null;

    const memberships = membershipsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const sevenDays = now.getTime() + 7 * 86400000;

    // Revenue: what the host actually receives (price, not fees).
    let revenueTotal = 0;
    let revenueMonth = 0;
    paymentsSnap.forEach((d) => {
      const p = d.data();
      const received = Number(p.metadata?.hostReceives);
      const cents = Number.isFinite(received) ? received : p.amount || 0;
      revenueTotal += cents;
      const createdMs = p.createdAt?.toMillis ? p.createdAt.toMillis() : 0;
      if (createdMs >= monthStart) revenueMonth += cents;
    });

    const activeUserIds = new Set();
    const expiringSoon = [];
    memberships.forEach((m) => {
      if (getMembershipState(m) === "active") {
        activeUserIds.add(m.userId);
        const expMs = m.expiresAt?.toMillis ? m.expiresAt.toMillis() : 0;
        if (expMs && expMs <= sevenDays) expiringSoon.push(m);
      }
    });
    expiringSoon.sort(
      (a, b) =>
        (a.expiresAt?.toMillis?.() || 0) - (b.expiresAt?.toMillis?.() || 0)
    );

    return {
      revenueTotalCentavos: revenueTotal,
      revenueMonthCentavos: revenueMonth,
      membershipsSold: memberships.length,
      activeMembers: activeUserIds.size,
      classesAttended: redemptionsSnap.size,
      expiringSoonCount: expiringSoon.length,
      expiringSoon,
      hostAverageRating: hostStats?.averageRating || 0,
      hostTotalRatings: hostStats?.totalRatings || 0,
    };
  } catch (e) {
    console.error("❌ Error computing host analytics:", e);
    return null;
  }
};

