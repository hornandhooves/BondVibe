/**
 * Matchmaking v2 — freemium gate (P2), client mirror of the server gate in
 * functions/matching/curated.js `gateFor`. The SERVER is the source of truth
 * (it withholds a locked set's members); this copy only decides what the client
 * *renders* — a full set, the paywall, or an honest empty/under-construction
 * state. Keep the two in lock-step (unit-tested here).
 *
 *   free_trial → within the trial week · plus → Kinlo Plus · locked → neither.
 */

/** Firestore Timestamp | ISO | ms → epoch ms (or null). */
export function toMillis(v) {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  if (typeof v === "string") return new Date(v).getTime();
  return null;
}

/**
 * @param {object} matchmaking users/{uid}.matchmaking ({ freeTrialEndsAt? })
 * @param {string} plan users/{uid}.plan ("free" | "kinlo_plus")
 * @param {number} [now] epoch ms
 * @return {{ unlocked:boolean, tier:"plus"|"free_trial"|"locked" }}
 */
export function gateFor(matchmaking, plan, now = Date.now()) {
  if (plan === "kinlo_plus") return { unlocked: true, tier: "plus" };
  const trialEndsMs = toMillis(matchmaking && matchmaking.freeTrialEndsAt);
  if (trialEndsMs != null && now < trialEndsMs) return { unlocked: true, tier: "free_trial" };
  return { unlocked: false, tier: "locked" };
}

/**
 * How to render a curated-set doc (server already withheld members when locked).
 *   "inactive"    — not opted in / incomplete → send to consent+profile
 *   "locked"      — trial over, not Plus → paywall (members withheld server-side)
 *   "empty"       — active + unlocked but nobody to suggest yet → honest state
 *   "ready"       — show the "te presentamos" cards
 * @param {object|null} set curatedSets/{uid} doc
 * @param {object} matchmaking users/{uid}.matchmaking
 * @return {"inactive"|"locked"|"empty"|"ready"}
 */
export function curatedSetState(set, matchmaking) {
  const mm = matchmaking || {};
  if (mm.consentAt == null || mm.profileComplete !== true || mm.enabled === false) {
    return "inactive";
  }
  if (!set) return "empty";
  if (set.locked === true) return "locked";
  if (!Array.isArray(set.members) || set.members.length === 0) return "empty";
  return "ready";
}
