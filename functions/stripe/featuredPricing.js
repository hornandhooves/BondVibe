/**
 * Featured-placement catalog — SHARED by events and services (KIN-185).
 *
 * One ladder, both surfaces: Carlos closed this on 5-ago-2026 — a service
 * costs the same as an event to feature ($99 / $179 / $299 MXN for 7 / 14 /
 * 30 days), so there is ONE catalog to administer rather than two that drift.
 * The platform keeps 100% of these fees; they are never split with the host.
 *
 * The SERVER is the source of truth for price. `config/featuredPricing` in
 * Firestore is the admin-editable override (same pattern as `config/pricing`);
 * the constants below are the fallback when the doc is missing or a field is
 * unusable, so a bad/absent config can never make a promotion free.
 */

const {getFirestore} = require("firebase-admin/firestore");

/** Fallback catalog. Values in centavos. */
const FEATURED_PLAN_DEFAULTS = {
  feat_7: {id: "feat_7", days: 7, priceCentavos: 9900, tier: "standard"},
  feat_14: {id: "feat_14", days: 14, priceCentavos: 17900, tier: "standard"},
  feat_30: {id: "feat_30", days: 30, priceCentavos: 29900, tier: "standard"},
};

/** What a promotion can be bought for. */
const FEATURED_TARGETS = ["event", "service"];

const positiveInt = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

/**
 * Read the shared catalog, falling back per-field to the defaults above.
 * A plan id absent from the config keeps its default entry — the config
 * overrides prices, it does not define which plans exist.
 * @return {Promise<Object>} planId → {id, days, priceCentavos, tier}
 */
async function getFeaturedCatalog() {
  let overrides = {};
  try {
    const snap = await getFirestore()
      .collection("config")
      .doc("featuredPricing")
      .get();
    if (snap.exists) overrides = snap.data() || {};
  } catch (e) {
    console.warn("getFeaturedCatalog: falling back to defaults:", e.message);
  }

  const catalog = {};
  for (const [planId, def] of Object.entries(FEATURED_PLAN_DEFAULTS)) {
    const o = overrides[planId] || {};
    catalog[planId] = {
      id: planId,
      days: positiveInt(o.days, def.days),
      priceCentavos: positiveInt(o.priceCentavos, def.priceCentavos),
      tier: def.tier,
    };
  }
  return catalog;
}

/**
 * Look up ONE plan by id, with the config applied. Returns null for an
 * unknown id so the caller rejects rather than charging something arbitrary.
 * @param {string} planId
 * @return {Promise<Object|null>}
 */
async function getFeaturedPlan(planId) {
  if (!planId || !FEATURED_PLAN_DEFAULTS[planId]) return null;
  const catalog = await getFeaturedCatalog();
  return catalog[planId] || null;
}

module.exports = {
  FEATURED_PLAN_DEFAULTS,
  FEATURED_TARGETS,
  getFeaturedCatalog,
  getFeaturedPlan,
};
