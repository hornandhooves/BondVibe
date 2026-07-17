import { getFunctions, httpsCallable } from "firebase/functions";

/**
 * Manual assignment — server-side only.
 *
 * There's no client-side twin of this on purpose. Manual assignment IS the Kinlo
 * Pro feature (it's how a studio takes cash without Stripe), so the entitlement
 * has to be checked somewhere a modified client can't reach. Hiding the sheet
 * keeps an honest host out of a paid feature; it doesn't stop a direct write.
 */

/** How a manually-assigned plan was paid for. */
export const PAYMENT_METHOD = {
  CASH: "cash",
  TRANSFER: "transfer",
  /** Given away — a comp. No money changed hands. */
  COMPED: "comped",
};

export const PAYMENT_METHODS = [
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.TRANSFER,
  PAYMENT_METHOD.COMPED,
];

export const paymentMethodLabelKey = (m) => `plans.assign.method.${m}`;

/**
 * Assign a plan to a member and record how it was paid.
 *
 * Produces the same activePackage the online checkout does — one product, two
 * ways in, one runtime.
 *
 * @param {{bizId: string, memberId: string, planId: string, paymentMethod: string}} args
 * @returns {Promise<{ok: boolean, activePackage: object}>}
 * @throws HttpsError — notably `permission-denied` with "kinlo_pro_required"
 *   when the host isn't Pro, and `failed-precondition` for audience_mismatch.
 *   Callers surface these; they're the server's answer, not a suggestion.
 */
export async function assignPlanManually({ bizId, memberId, planId, paymentMethod }) {
  const call = httpsCallable(getFunctions(), "assignPlanManually");
  const res = await call({ bizId, memberId, planId, paymentMethod });
  return res.data;
}
