/**
 * Pure clustering for match groups (P3) — no firebase deps, so it's unit-tested
 * directly. functions/matching/groups.js wraps this with the Firestore I/O.
 */
const {computeAffinity} = require("./affinity");

const GROUP_MIN = 4;
const GROUP_MAX = 6;
const CHAT_ACTIVE_AT = 3;

/**
 * Greedy cohesive clustering: seed with the first member, pull its most-affine
 * peers until the group is full (GROUP_MAX), then repeat. Deterministic given a
 * stable input order. A trailing remainder < GROUP_MIN is dropped (no lonely
 * "groups").
 * @param {Array<{uid:string, profile:object}>} members
 * @return {Array<Array<string>>} groups of uids
 */
function clusterMembers(members) {
  const pool = [...members];
  const groups = [];
  while (pool.length >= GROUP_MIN) {
    const seed = pool.shift();
    const scored = pool
      .map((m) => ({m, s: computeAffinity(seed.profile, m.profile, "social").score || 0}))
      .sort((a, b) => b.s - a.s);
    const take = scored.slice(0, GROUP_MAX - 1).map((x) => x.m);
    const group = [seed, ...take];
    const ids = new Set(take.map((m) => m.uid));
    for (let i = pool.length - 1; i >= 0; i--) if (ids.has(pool[i].uid)) pool.splice(i, 1);
    groups.push(group.map((m) => m.uid));
  }
  return groups;
}

module.exports = {clusterMembers, GROUP_MIN, GROUP_MAX, CHAT_ACTIVE_AT};
