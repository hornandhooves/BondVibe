/**
 * Featured-EVENT promotion plans.
 *
 * KIN-185 moved the catalog itself to ./featuredPricing, which events and
 * services now share (one admin-editable ladder instead of two that drift).
 * This module stays as the events-facing entry point so existing callers keep
 * their import, and so the events surface has somewhere to put anything that
 * is genuinely event-only later.
 *
 * The platform keeps 100% of these fees — they are NOT split with the host.
 */

const {
  FEATURED_PLAN_DEFAULTS,
  getFeaturedCatalog,
  getFeaturedPlan,
} = require("./featuredPricing");

/**
 * Look up a promotion plan by id, with the admin config applied.
 * ASYNC as of KIN-185 — the price now comes from config/featuredPricing.
 * @param {string} planId
 * @return {Promise<Object|null>}
 */
function getPromotionPlan(planId) {
  return getFeaturedPlan(planId);
}

module.exports = {
  // Kept as the fallback ladder for anything that needs the shape without a
  // Firestore read; the live prices come from getPromotionPlan/getFeaturedCatalog.
  PROMOTION_PLANS: FEATURED_PLAN_DEFAULTS,
  getPromotionPlan,
  getFeaturedCatalog,
};
