/**
 * Admin payouts — client wrappers over the LIVE admin callables only
 * (feat/admin-payouts-ui · HANDOFF_diseno2_payouts.md · docs/DISENO_escrow_pagos.md).
 *
 * The paymentLedger is deny-all to clients, so EVERYTHING goes through these
 * server callables (which re-check admin server-side — the client gate is just
 * defense-in-depth). No direct Firestore reads/writes of the ledger.
 */
import { getFunctions, httpsCallable } from "firebase/functions";

/** List payouts (paginated, filtered server-side). `{ payouts, hostDebts, nextCursor }`. */
export const listPayouts = async ({ status, type, cursor, limit = 25 } = {}) => {
  const fn = httpsCallable(getFunctions(), "adminListPayouts");
  const res = await fn({ status: status || undefined, type: type || undefined, cursor: cursor || undefined, limit });
  return res.data;
};

/** Release a HELD payout NOW (irreversible; rejects frozen / non-held). */
export const releasePayout = async (paymentIntentId) => {
  const fn = httpsCallable(getFunctions(), "adminReleasePayout");
  return (await fn({ paymentIntentId })).data;
};

/** Full refund of a payout to the buyer (irreversible). */
export const refundPayout = async (paymentIntentId, reason) => {
  const fn = httpsCallable(getFunctions(), "adminRefundPayout");
  return (await fn({ paymentIntentId, reason })).data;
};

/** Freeze / unfreeze a payout (§7). A frozen payout is skipped by the release
 * cron until it is unfrozen. Admin-gated server-side in setPayoutFrozen. */
export const setFrozen = async (paymentIntentId, frozen) => {
  const fn = httpsCallable(getFunctions(), "setPayoutFrozen");
  return (await fn({ paymentIntentId, frozen: !!frozen })).data;
};
