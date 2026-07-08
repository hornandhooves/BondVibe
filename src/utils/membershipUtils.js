/**
 * Pure membership helpers — no Firebase imports, so they are trivially unit
 * testable and reusable on both client and (logic-mirrored) server side.
 */

// Every membership is credit-based now (kinlo_business/05 §G): a fixed number of
// events/classes + a required expiry. "Unlimited" was removed entirely — new
// plans can't be unlimited and legacy unlimited instances ride out their expiry.
export const MEMBERSHIP_PLAN_TYPES = {
  CREDITS: "credits",
};

// A plan/package audience tier (kinlo_business/05 §G): who may buy/redeem it.
// Enforced at purchase and at redemption/check-in.
export const MEMBERSHIP_AUDIENCE = {
  LOCAL: "local",
  GENERAL: "general",
  BOTH: "both",
};

/**
 * Whether a plan/package audience allows a member of the given pricing tier.
 * @param {"local"|"general"|"both"|undefined} audienceTier
 * @param {"local"|"general"|undefined} memberTier
 * @returns {boolean}
 */
export const audienceAllows = (audienceTier, memberTier) => {
  const a = audienceTier || MEMBERSHIP_AUDIENCE.BOTH;
  if (a === MEMBERSHIP_AUDIENCE.BOTH) return true;
  return a === (memberTier || MEMBERSHIP_AUDIENCE.GENERAL);
};

/**
 * Normalize a Firestore Timestamp | {seconds} | Date | ISO string to millis.
 * @param {*} ts
 * @returns {number}
 */
export const toMillis = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * Validate plan input before writing.
 * @param {object} data
 * @returns {string|null} error message, or null if valid
 */
export const validatePlanInput = (data) => {
  if (!data.name || !data.name.trim()) return "Plan name is required.";
  if (!data.priceCentavos || data.priceCentavos <= 0) {
    return "Price must be greater than zero.";
  }
  if (!data.validityDays || data.validityDays <= 0) {
    return "Validity (in days) must be greater than zero.";
  }
  // Every plan is credit-based: a credit count is always required.
  if (!data.creditsIncluded || data.creditsIncluded <= 0) {
    return "A membership must include at least one credit.";
  }
  if (
    data.audienceTier &&
    ![MEMBERSHIP_AUDIENCE.LOCAL, MEMBERSHIP_AUDIENCE.GENERAL, MEMBERSHIP_AUDIENCE.BOTH].includes(data.audienceTier)
  ) {
    return "Invalid audience tier.";
  }
  return null;
};

/**
 * Derive a membership's usable state from its data.
 * @param {object} m membership
 * @param {number} [nowMs] current time (injectable for testing)
 * @returns {"active"|"expired"|"depleted"}
 */
export const getMembershipState = (m, nowMs = Date.now()) => {
  if (!m) return "expired";
  if (toMillis(m.expiresAt) < nowMs) return "expired";
  // Credit-based: 0 credits → depleted. A legacy unlimited instance has
  // creditsRemaining == null and simply rides out its expiry (not depleted).
  if (typeof m.creditsRemaining === "number" && m.creditsRemaining <= 0) {
    return "depleted";
  }
  return "active";
};

/**
 * Convert a membership's expiry to a JS Date.
 * @param {object} m
 * @returns {Date|null}
 */
export const getMembershipExpiryDate = (m) => {
  const ms = toMillis(m?.expiresAt);
  return ms ? new Date(ms) : null;
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
  const credits = plan.creditsIncluded;
  if (!credits) return `Membership · valid ${validity}`;
  return `${credits} class${credits === 1 ? "" : "es"} · valid ${validity}`;
};
