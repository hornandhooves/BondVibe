/**
 * Matchmaking v2 — deterministic affinity engine (P1).
 *
 * The score is computed here, in pure JS, from REAL signals — the AI (match_intel)
 * only explains/introduces, it NEVER produces the number. When there isn't enough
 * signal to be honest, we return status "under_construction" and score `null` —
 * never a fabricated %.
 *
 * Social weights (sum 100): interests 35 · intention 25 · Big Five 20 · context 12
 * · format 8. Professional mode re-weights toward intention + industry +
 * complementarity (not similarity).
 */
import { calculateCompatibility, isBigFive } from "./personalityScoring";

export const AFFINITY_WEIGHTS = {
  social: { interests: 35, intention: 25, bigfive: 20, context: 12, format: 8 },
  professional: { intention: 30, industry: 25, complement: 20, interests: 15, context: 10 },
};

// Minimum real signal to publish a number (else "en construcción").
const MIN_SIGNALS = 2;
const MIN_WEIGHT = 40;

const arr = (v) => (Array.isArray(v) ? v : []);

/** Jaccard overlap of two id lists → 0..1, or null when neither side has data. */
export function jaccard(a, b) {
  const A = new Set(arr(a));
  const B = new Set(arr(b));
  if (A.size === 0 && B.size === 0) return null;
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? null : inter / union;
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

// Format fit: group-preference match + energy proximity. null if neither has data.
function formatValue(a, b) {
  const parts = [];
  if (a.groupPref && b.groupPref) {
    parts.push(a.groupPref === b.groupPref ? 1 : 0.4);
  }
  if (a.energy && b.energy) {
    const d =
      (Math.abs((a.energy.adventure ?? 50) - (b.energy.adventure ?? 50)) +
        Math.abs((a.energy.social ?? 50) - (b.energy.social ?? 50))) /
      2;
    parts.push(clamp01(1 - d / 100));
  }
  return parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : null;
}

// Shared context (events + communities). null when unknown.
function contextValue(ctx) {
  if (!ctx || (ctx.sharedEvents == null && ctx.sharedCommunities == null)) return null;
  const shared = (ctx.sharedEvents || 0) + (ctx.sharedCommunities || 0);
  return clamp01(shared / 3); // 3+ shared → full context
}

// Professional complementarity: both have something to offer AND to seek → they
// can help each other. Rewards a filled reciprocal profile.
function complementValue(a, b) {
  const oa = !!(a.pro && a.pro.offer);
  const sa = !!(a.pro && a.pro.seek);
  const ob = !!(b.pro && b.pro.offer);
  const sb = !!(b.pro && b.pro.seek);
  if (!a.pro && !b.pro) return null;
  const canHelp = (oa && sb ? 0.5 : 0) + (ob && sa ? 0.5 : 0);
  return canHelp || (oa || sa || ob || sb ? 0.2 : null);
}

// Industry: in professional mode a DIFFERENT industry scores higher
// (complementarity, not similarity); same industry still counts (peers).
function industryValue(a, b) {
  const ia = a.pro && a.pro.industry;
  const ib = b.pro && b.pro.industry;
  if (!ia || !ib) return null;
  return ia === ib ? 0.5 : 1;
}

/**
 * @param {object} a  profile A ({ interests[], funnyTags[], lookingFor[],
 *   personality, energy, groupPref, pro{} })
 * @param {object} b  profile B
 * @param {"social"|"professional"} [mode]
 * @param {object} [ctx] { sharedEvents, sharedCommunities }
 * @returns {{ status:"ok"|"under_construction", score:number|null,
 *            mode:string, signals:Array<{key,weight,value}> }}
 */
export function computeAffinity(a, b, mode = "social", ctx = {}) {
  const m = mode === "professional" ? "professional" : "social";
  if (!a || !b) return { status: "under_construction", score: null, mode: m, signals: [] };
  const w = AFFINITY_WEIGHTS[m];

  const bf =
    isBigFive(a.personality) && isBigFive(b.personality)
      ? calculateCompatibility(a.personality, b.personality) / 100
      : null;
  const interests = jaccard(
    [...arr(a.interests), ...arr(a.funnyTags)],
    [...arr(b.interests), ...arr(b.funnyTags)]
  );
  const intention = jaccard(a.lookingFor, b.lookingFor);

  const raw =
    m === "professional"
      ? {
          intention,
          industry: industryValue(a, b),
          complement: complementValue(a, b),
          interests,
          context: contextValue(ctx),
        }
      : {
          interests,
          intention,
          bigfive: bf,
          context: contextValue(ctx),
          format: formatValue(a, b),
        };

  const signals = Object.keys(w).map((key) => ({
    key,
    weight: w[key],
    value: raw[key] == null ? null : clamp01(raw[key]),
  }));

  const available = signals.filter((s) => s.value !== null);
  const availableWeight = available.reduce((sum, s) => sum + s.weight, 0);

  // Honest-null: too little real signal → "en construcción", never a fake %.
  if (available.length < MIN_SIGNALS || availableWeight < MIN_WEIGHT) {
    return { status: "under_construction", score: null, mode: m, signals };
  }

  const weighted = available.reduce((sum, s) => sum + s.value * s.weight, 0);
  const score = Math.round((weighted / availableWeight) * 100);
  return { status: "ok", score, mode: m, signals };
}
