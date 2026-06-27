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
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { logger } from "../utils/logger";

export const MEMBERSHIP_PLAN_TYPES = {
  CREDITS: "credits",
  UNLIMITED: "unlimited",
};

/**
 * Validate plan input before writing.
 * @param {object} data
 * @returns {string|null} error message, or null if valid
 */
const validatePlanInput = (data) => {
  if (!data.name || !data.name.trim()) return "Plan name is required.";
  if (!data.priceCentavos || data.priceCentavos <= 0) {
    return "Price must be greater than zero.";
  }
  if (!data.validityDays || data.validityDays <= 0) {
    return "Validity (in days) must be greater than zero.";
  }
  if (data.type === MEMBERSHIP_PLAN_TYPES.CREDITS) {
    if (!data.creditsIncluded || data.creditsIncluded <= 0) {
      return "A credit pack must include at least one credit.";
    }
  } else if (data.type !== MEMBERSHIP_PLAN_TYPES.UNLIMITED) {
    return "Invalid plan type.";
  }
  return null;
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

    const isCredits = planData.type === MEMBERSHIP_PLAN_TYPES.CREDITS;

    const planDoc = {
      hostId,
      name: planData.name.trim(),
      description: planData.description?.trim() || "",
      type: planData.type,
      creditsIncluded: isCredits ? Number(planData.creditsIncluded) : null,
      validityDays: Number(planData.validityDays),
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
 * Format centavos as a MXN price string.
 * @param {number} centavos
 * @returns {string}
 */
export const formatPlanPrice = (centavos) => {
  const pesos = (Number(centavos) || 0) / 100;
  return `$${pesos.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXN`;
};

/**
 * Human summary of what a plan includes.
 * @param {object} plan
 * @returns {string}
 */
export const describePlan = (plan) => {
  if (!plan) return "";
  const validity = `${plan.validityDays} days`;
  if (plan.type === MEMBERSHIP_PLAN_TYPES.UNLIMITED) {
    return `Unlimited classes · valid ${validity}`;
  }
  const credits = plan.creditsIncluded;
  return `${credits} class${credits === 1 ? "" : "es"} · valid ${validity}`;
};
