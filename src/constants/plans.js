/**
 * The unified `plans` model — businesses/{bizId}/plans.
 *
 * Packages and Membership Plans were the same product wearing two names. Both
 * end in one `activePackage` with credits the member spends by attending; the
 * only real difference was the sales channel — packages were assigned by hand,
 * plans were sold online with Stripe. Hosts had to learn two screens to express
 * one idea, and Membership Plans had no Hub entry at all.
 *
 * So the channel becomes a FIELD (`paymentModes`) instead of a second concept.
 *
 * The runtime doesn't change: whatever the channel, a purchase/assignment still
 * produces the same activePackage, and credits/attendance/expiry and the loyalty
 * stamps in MembershipCard are untouched.
 */
import { MEMBERSHIP_AUDIENCE } from "../utils/membershipUtils";

/** How a plan can be paid for. At least one is required — never an empty array. */
export const PAYMENT_MODE = {
  /** Member buys it themselves through Stripe checkout. Needs payouts connected. */
  ONLINE: "online",
  /** Host assigns it and records the payment (cash/transfer/comp'd). Kinlo Pro. */
  MANUAL: "manual",
};

export const PAYMENT_MODES = [PAYMENT_MODE.ONLINE, PAYMENT_MODE.MANUAL];

/**
 * What the plan is.
 *
 * Deliberately the SAME ids as the old PACKAGE_KIND ('class'/'session'/'event'),
 * not the handoff's prose names ("class pack" / "time pass" / "drop-in"). Every
 * existing package doc carries these values, and renaming them would turn an
 * additive migration into a rewrite of live data for no gain. The prose lives in
 * i18n, where copy belongs.
 */
export const PLAN_KIND = {
  /** A bundle of credits — the handoff's "class pack". */
  CLASS: "class",
  /** Unlimited within a window — the handoff's "time pass". */
  SESSION: "session",
  /** One credit, one visit — the handoff's "drop-in". */
  EVENT: "event",
};

export const PLAN_KINDS = [PLAN_KIND.CLASS, PLAN_KIND.SESSION, PLAN_KIND.EVENT];

export const planKindLabelKey = (kind) => `plans.kind.${kind}`;
export const paymentModeLabelKey = (mode) => `plans.paymentMode.${mode}`;

/** Loyalty defaults, only used once a host switches the reward on for a plan. */
export const LOYALTY_DEFAULTS = { stampsNeeded: 10 };

/**
 * Coerce anything into a valid, non-empty paymentModes array.
 *
 * The contract is "at least one, only known values, never undefined" — and this
 * is the one place that enforces it, because Firestore rejects undefined and an
 * empty array would make a plan unsellable through any channel while looking
 * fine in the list.
 *
 * @param {unknown} value
 * @returns {string[]} a sanitised array; falls back to ['manual'] — the mode
 *   that needs no Stripe account, so a bad value can never imply a plan is
 *   sellable online when it isn't.
 */
export function sanitizePaymentModes(value) {
  const arr = Array.isArray(value) ? value : [];
  const cleaned = PAYMENT_MODES.filter((m) => arr.includes(m));
  return cleaned.length ? cleaned : [PAYMENT_MODE.MANUAL];
}

/**
 * Normalise a loyalty reward into something Firestore accepts.
 * @param {object} [value] { enabled, stampsNeeded, rewardLabel }
 * @returns {{enabled: boolean, stampsNeeded: number, rewardLabel: string}|null}
 *   null when disabled — an explicit null, never undefined.
 */
export function sanitizeLoyaltyReward(value) {
  if (!value || value.enabled !== true) return null;
  const stamps = parseInt(value.stampsNeeded, 10);
  return {
    enabled: true,
    stampsNeeded: Number.isFinite(stamps) && stamps > 0 ? stamps : LOYALTY_DEFAULTS.stampsNeeded,
    rewardLabel: typeof value.rewardLabel === "string" ? value.rewardLabel.trim() : "",
  };
}

/** @returns {boolean} can a member buy this themselves? */
export const isSellableOnline = (plan) =>
  sanitizePaymentModes(plan?.paymentModes).includes(PAYMENT_MODE.ONLINE);

/** @returns {boolean} can a host hand this out? */
export const isAssignableManually = (plan) =>
  sanitizePaymentModes(plan?.paymentModes).includes(PAYMENT_MODE.MANUAL);

export { MEMBERSHIP_AUDIENCE };
