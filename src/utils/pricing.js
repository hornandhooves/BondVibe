/**
 * Client-side pricing estimate.
 *
 * The SERVER (functions/stripe/pricing.js) is the source of truth for what is
 * actually charged — these constants mirror it only to show the buyer an
 * estimated breakdown before the PaymentIntent is created. Keep them in sync
 * with functions/stripe/pricing.js (PRICING_CONFIG).
 *
 * Model: USER_PAYS_FEES — the buyer pays the price plus platform + processing
 * fees on top; the host receives 100% of the price they set.
 */

// Processing fee per payout processor. The buyer pays this on top so the host
// receives 100% of their price. Rates are approximate — confirm current rates
// per processor (and note IVA may apply on the commission in Mexico).
export const PROCESSOR_FEES = {
  stripe: { percent: 0.029, fixedCentavos: 300 },
  mercadopago: { percent: 0.0349, fixedCentavos: 0 },
};

export const PRICING = {
  platformFeePercent: 0.05,
  currency: "MXN",
  // Kept for backwards-compatibility with older callers/tests.
  stripeFeePercent: 0.029,
  stripeFeeFixedCentavos: 300,
};

/**
 * Estimate the fee breakdown for a given base price and payout processor.
 * @param {number} baseCentavos - price set by the host, in centavos
 * @param {"stripe"|"mercadopago"} [processor="stripe"] - host payout processor
 * @param {object} [overrides] - admin-configurable rate overrides:
 *   { platformFeePercent, processorPercent, processorFixed }
 * @returns {{baseCentavos:number, platformFeeCentavos:number,
 *            processorFeeCentavos:number, stripeFeeCentavos:number,
 *            processor:string, totalCentavos:number}}
 */
export const estimateCheckout = (baseCentavos, processor = "stripe", overrides = {}) => {
  const base = Math.max(0, Math.round(Number(baseCentavos) || 0));
  const platformFeePercent = Number.isFinite(overrides.platformFeePercent)
    ? overrides.platformFeePercent
    : PRICING.platformFeePercent;
  const platformFee = Math.ceil(base * platformFeePercent);
  const fee = PROCESSOR_FEES[processor] || PROCESSOR_FEES.stripe;
  const pPercent = Number.isFinite(overrides.processorPercent)
    ? overrides.processorPercent
    : fee.percent;
  const pFixed = Number.isFinite(overrides.processorFixed)
    ? overrides.processorFixed
    : fee.fixedCentavos;
  const processorFee = Math.ceil((base + platformFee) * pPercent) + pFixed;
  return {
    baseCentavos: base,
    platformFeeCentavos: platformFee,
    processorFeeCentavos: processorFee,
    // Alias kept so existing UI reading stripeFeeCentavos keeps working.
    stripeFeeCentavos: processorFee,
    processor,
    totalCentavos: base + platformFee + processorFee,
  };
};

/**
 * Format centavos as a MXN currency string.
 * @param {number} centavos
 * @returns {string}
 */
export const formatCentavos = (centavos) => {
  const pesos = (Number(centavos) || 0) / 100;
  return `$${pesos.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXN`;
};

/**
 * Compact MXN for tight KPI tiles: `$132`, `$1.2k`, `$41.2k`, `$1.2M` — no
 * `.00 MXN` tail, so a money value never wraps to two lines. Keeps a leading
 * minus for losses. Full precision stays in formatCentavos (used elsewhere).
 * @param {number} centavos
 * @returns {string}
 */
export const formatCentavosCompact = (centavos) => {
  const pesos = (Number(centavos) || 0) / 100;
  const abs = Math.abs(pesos);
  const sign = pesos < 0 ? "-" : "";
  let body;
  if (abs >= 1000000) body = `${(abs / 1000000).toFixed(1)}M`;
  else if (abs >= 1000) body = `${(abs / 1000).toFixed(1)}k`;
  else body = `${Math.round(abs)}`;
  return `${sign}$${body}`;
};

/**
 * Display a PESO amount unambiguously as MXN (BUG 1): `MX$199`, never a bare
 * `$199` (which reads as USD). Pass whole pesos, not centavos. Integers show no
 * decimals; fractional amounts show two.
 * @param {number} pesos
 * @returns {string}
 */
export const formatMXN = (pesos) => {
  const n = Number(pesos) || 0;
  const body = Number.isInteger(n)
    ? n.toLocaleString("es-MX")
    : n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `MX$${body}`;
};
