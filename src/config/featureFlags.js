/**
 * Feature flags — switches for work that is built but not ready to be seen.
 *
 * These are NOT entitlements. `src/config/entitlements.js` answers "is this user
 * allowed this?" (tier, role) and varies per user. A flag here answers "does this
 * exist yet?" and is the same for everyone. If you're gating by plan or role, you
 * want entitlements, not this file.
 *
 * Keep flags boolean and read them at render time, so flipping one is a one-line
 * change with no dead code to resurrect.
 */

/**
 * Mercado Pago as a host payout processor.
 *
 * OFF until the Mercado Pago integration is finished. While it's off, hosts only
 * see Stripe Connect when choosing how to get paid, and no checkout routes to
 * Mercado Pago — including for hosts whose `hostConfig.payoutProcessor` was
 * already written as "mercadopago" before this flag existed (that data is left
 * alone; it simply isn't honoured while this is false).
 *
 * To re-enable: flip to `true`. Nothing else — the UI, the payout branch in
 * HostTypeSelectionScreen and the checkout routing in CheckoutScreen all read
 * this, and the i18n keys were never removed.
 */
export const MERCADOPAGO_ENABLED = false;
