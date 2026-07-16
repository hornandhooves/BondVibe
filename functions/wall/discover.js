/**
 * Wall v2 · Descubre (P1). People discovery ranked by the SAME deterministic
 * affinity engine as matchmaking (server-truth score) over the cross-community
 * pool (matchPool/{uid}), respecting consent, matchExclusions and blocks.
 *
 * Freemium is enforced HERE, server-side (never trust the client):
 *   • Kinlo Plus  → the whole ranked list, identities revealed.
 *   • Free        → ONE unlocked pick; every other card comes back as
 *                   { locked:true } with NO identity — the client blurs a
 *                   placeholder and routes to the Plus paywall. A blurred card
 *                   can't leak who it is because the server never sent it.
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {computeAffinity} = require("../matching/affinity");
const {reasonsFrom} = require("../matching/curated");

const db = admin.firestore();

const MAX_CANDIDATES = 400;
const MAX_RESULTS = 30;

const discoverForYou = onCall(async (request) => {
  const me = request.auth && request.auth.uid;
  if (!me) throw new HttpsError("unauthenticated", "Sign in required.");

  const meSnap = await db.collection("users").doc(me).get();
  const meUser = meSnap.exists ? meSnap.data() : {};
  const mm = meUser.matchmaking || {};
  const isPlus = meUser.plan === "kinlo_plus";

  // Suggested communities (server-side — the hostGroups read rule is per-member,
  // so a client can't list communities it hasn't joined; the Admin SDK can).
  // Returns public-safe fields only, excluding communities the user is in.
  const communities = await suggestCommunities(me);

  // Discovery is matchmaking-gated: no consent / incomplete / disabled → the
  // client shows the opt-in CTA (honest), but communities still surface.
  if (mm.consentAt == null || mm.profileComplete !== true || mm.enabled === false) {
    return {participating: false, isPlus, people: [], lockedCount: 0, communities};
  }

  const mine = meUser.matchProfile || null;
  const [poolSnap, exclSnap] = await Promise.all([
    db.collection("matchPool").where("enabled", "==", true).limit(MAX_CANDIDATES).get(),
    db.collection("matchExclusions").doc(me).get(),
  ]);
  const excluded = new Set((exclSnap.exists ? exclSnap.data().excluded : []) || []);
  const blocked = new Set(meUser.blockedIds || []); // respect the safety layer
  const myCommunities = new Set((mine && mine.communities) || meUser.communities || []);
  const crossCommunity = mm.crossCommunity === true; // default: shared community only

  const ranked = poolSnap.docs
    .map((d) => ({uid: d.id, ...d.data()}))
    .filter((p) => p.uid !== me && !excluded.has(p.uid) && !blocked.has(p.uid))
    .filter((p) => {
      if (crossCommunity) return true;
      const theirs = p.communities || [];
      return theirs.some((c) => myCommunities.has(c));
    })
    .map((p) => {
      const shared = (p.communities || []).filter((c) => myCommunities.has(c)).length;
      const a = computeAffinity(mine, p, "social", {sharedCommunities: shared});
      return {p, shared, a};
    })
    .filter((x) => x.a.status === "ok")
    .sort((a, b) => b.a.score - a.a.score)
    .slice(0, MAX_RESULTS);

  // Free tier sees exactly ONE unlocked pick; the rest are withheld.
  const quota = isPlus ? ranked.length : 1;
  const people = ranked.map((x, i) => {
    if (isPlus || i < quota) {
      return {
        uid: x.p.uid,
        displayName: x.p.displayName || "",
        photoUrl: x.p.photoUrl || null,
        funnyTags: (x.p.funnyTags || []).slice(0, 3),
        score: x.a.score,
        reasons: reasonsFrom(x.a),
        shared: x.shared,
        locked: false,
      };
    }
    // Locked: identity withheld server-side. Only the fact that a match exists.
    return {locked: true};
  });

  return {
    participating: true,
    isPlus,
    people,
    lockedCount: isPlus ? 0 : Math.max(0, ranked.length - quota),
    communities,
  };
});

/**
 * Communities the user hasn't joined yet, most-active first (server-side so it
 * bypasses the per-member hostGroups read rule). Public-safe fields only.
 * @param {string} me uid
 * @return {Promise<Array<{id, name, memberCount}>>}
 */
async function suggestCommunities(me) {
  try {
    const snap = await db.collection("hostGroups").limit(60).get();
    return snap.docs
      .map((d) => ({id: d.id, ...d.data()}))
      .filter((g) => g.hostId !== me &&
                     !((g.memberIds || []).includes(me)) &&
                     !((g.blockedIds || []).includes(me)))
      .sort((a, b) => (b.memberIds ? b.memberIds.length : 0) - (a.memberIds ? a.memberIds.length : 0))
      .slice(0, 6)
      .map((g) => ({id: g.id, name: g.name || "", memberCount: (g.memberIds || []).length}));
  } catch (e) {
    console.error("suggestCommunities:", e.message);
    return [];
  }
}

module.exports = {discoverForYou};
