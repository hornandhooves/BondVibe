/**
 * Matchmaking v2 — deterministic affinity engine (SERVER port of
 * src/utils/computeAffinity.js). The curated-set generator scores pairs HERE,
 * on the server, so the number is server-truth — a client can never inflate its
 * own affinity to jump the queue, and the AI never produces the score.
 *
 * Keep this in lock-step with the client engine (same weights, same jaccard,
 * same honest "under_construction" thresholds). The unit test asserts parity.
 */

const AFFINITY_WEIGHTS = {
  social: {interests: 35, intention: 25, bigfive: 20, context: 12, format: 8},
  professional: {intention: 30, industry: 25, complement: 20, interests: 15, context: 10},
};

const MIN_SIGNALS = 2;
const MIN_WEIGHT = 40;

const arr = (v) => (Array.isArray(v) ? v : []);
const clamp01 = (n) => Math.max(0, Math.min(1, n));

const BIG_FIVE = ["OPENNESS", "CONSCIENTIOUSNESS", "EXTRAVERSION", "AGREEABLENESS", "NEUROTICISM"];

function isBigFive(p) {
  return !!p && typeof p === "object" && BIG_FIVE.some((d) => typeof p[d] === "number");
}

// Big Five compatibility (mirror of personalityScoring.calculateCompatibility).
function calculateCompatibility(p1, p2) {
  if (!p1 || !p2) return 0;
  const weights = {EXTRAVERSION: 0.30, AGREEABLENESS: 0.25, OPENNESS: 0.20, CONSCIENTIOUSNESS: 0.15, NEUROTICISM: 0.10};
  let total = 0;
  Object.keys(weights).forEach((d) => {
    const diff = Math.abs((p1[d] || 0) - (p2[d] || 0));
    let dc;
    if (d === "OPENNESS") dc = diff <= 30 ? 100 - diff * 1.5 : 100 - diff;
    else dc = 100 - diff;
    total += dc * weights[d];
  });
  return Math.round(Math.max(0, Math.min(100, total)));
}

/** Jaccard overlap of two id lists → 0..1, or null when neither side has data. */
function jaccard(a, b) {
  const A = new Set(arr(a));
  const B = new Set(arr(b));
  if (A.size === 0 && B.size === 0) return null;
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? null : inter / union;
}

function formatValue(a, b) {
  const parts = [];
  if (a.groupPref && b.groupPref) parts.push(a.groupPref === b.groupPref ? 1 : 0.4);
  if (a.energy && b.energy) {
    const d = (Math.abs((a.energy.adventure ?? 50) - (b.energy.adventure ?? 50)) +
               Math.abs((a.energy.social ?? 50) - (b.energy.social ?? 50))) / 2;
    parts.push(clamp01(1 - d / 100));
  }
  return parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : null;
}

function contextValue(ctx) {
  if (!ctx || (ctx.sharedEvents == null && ctx.sharedCommunities == null)) return null;
  const shared = (ctx.sharedEvents || 0) + (ctx.sharedCommunities || 0);
  return clamp01(shared / 3);
}

function complementValue(a, b) {
  const oa = !!(a.pro && a.pro.offer);
  const sa = !!(a.pro && a.pro.seek);
  const ob = !!(b.pro && b.pro.offer);
  const sb = !!(b.pro && b.pro.seek);
  if (!a.pro && !b.pro) return null;
  const canHelp = (oa && sb ? 0.5 : 0) + (ob && sa ? 0.5 : 0);
  return canHelp || (oa || sa || ob || sb ? 0.2 : null);
}

function industryValue(a, b) {
  const ia = a.pro && a.pro.industry;
  const ib = b.pro && b.pro.industry;
  if (!ia || !ib) return null;
  return ia === ib ? 0.5 : 1;
}

/**
 * @param {object} a profile A
 * @param {object} b profile B
 * @param {"social"|"professional"} [mode]
 * @param {object} [ctx] { sharedEvents, sharedCommunities }
 * @return {{status:string, score:(number|null), mode:string, signals:Array}}
 */
function computeAffinity(a, b, mode = "social", ctx = {}) {
  const m = mode === "professional" ? "professional" : "social";
  if (!a || !b) return {status: "under_construction", score: null, mode: m, signals: []};
  const w = AFFINITY_WEIGHTS[m];

  const bf = isBigFive(a.personality) && isBigFive(b.personality) ?
    calculateCompatibility(a.personality, b.personality) / 100 : null;
  const interests = jaccard(
    [...arr(a.interests), ...arr(a.funnyTags)],
    [...arr(b.interests), ...arr(b.funnyTags)],
  );
  const intention = jaccard(a.lookingFor, b.lookingFor);

  const raw = m === "professional" ? {
    intention,
    industry: industryValue(a, b),
    complement: complementValue(a, b),
    interests,
    context: contextValue(ctx),
  } : {
    interests,
    intention,
    bigfive: bf,
    context: contextValue(ctx),
    format: formatValue(a, b),
  };

  const signals = Object.keys(w).map((key) => ({
    key, weight: w[key], value: raw[key] == null ? null : clamp01(raw[key]),
  }));

  const available = signals.filter((s) => s.value !== null);
  const availableWeight = available.reduce((sum, s) => sum + s.weight, 0);

  if (available.length < MIN_SIGNALS || availableWeight < MIN_WEIGHT) {
    return {status: "under_construction", score: null, mode: m, signals};
  }

  const weighted = available.reduce((sum, s) => sum + s.value * s.weight, 0);
  const score = Math.round((weighted / availableWeight) * 100);
  return {status: "ok", score, mode: m, signals};
}

module.exports = {computeAffinity, jaccard, calculateCompatibility, isBigFive, AFFINITY_WEIGHTS};
