/**
 * Matchmaking v2 — weekly curated sets + double opt-in intros (P2).
 *
 * The curated set is generated on the SERVER so the affinity score is
 * server-truth (a client can't inflate its own ranking) and the freemium gate
 * is enforced server-side (a client can't unlock a set it hasn't paid for):
 *
 *   • Free during the trial week (users/{uid}.matchmaking.freeTrialEndsAt).
 *   • After the trial, the whole set is 100% BLOCKED unless the user is Kinlo
 *     Plus — the members array is WITHHELD (empty) so nothing leaks to a locked
 *     client; only the count survives as a teaser. (P4 wires the paywall + the
 *     trial start; here the gate already refuses to hand over a locked set.)
 *
 * Candidates come from the user-level pool `matchPool/{uid}` (populated in P3;
 * an empty pool yields an honest empty set — never fabricated matches). People
 * on the caller's `matchExclusions/{uid}` list ("dejar de sugerir", which is
 * NOT a block) are filtered out.
 *
 * Intros are double opt-in and PRIVATE (like the event-scoped likes): requesting
 * an intro writes a server-only edge; only when the OTHER person also requests
 * does a mutual Follow + a DM thread get created. Interest never leaks before
 * it's reciprocal, and the host never sees any of it.
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const {computeAffinity} = require("./affinity");

const db = admin.firestore();

const SET_MIN = 5;
const SET_MAX = 10;

// ---- helpers ---------------------------------------------------------------

/**
 * ISO year-week string ("2026-W29") — the set is keyed/refreshed weekly.
 * @param {Date} date any date in the week
 * @return {string} ISO year-week
 */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Firestore Timestamp | ISO | ms → epoch ms (or null).
 * @param {*} v a timestamp-like value
 * @return {(number|null)} epoch ms
 */
function toMillis(v) {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v === "function") return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  if (typeof v === "string") return new Date(v).getTime();
  return null;
}

/**
 * Freemium gate — free_trial (within the trial week) · plus (Kinlo Plus) ·
 * locked (neither). MUST match src/utils/curatedGate.js (the client mirror).
 * @param {object} matchmaking users/{uid}.matchmaking
 * @param {string} plan users/{uid}.plan
 * @param {number} nowMs epoch ms
 * @return {{unlocked: boolean, tier: string}} gate result
 */
function gateFor(matchmaking, plan, nowMs) {
  const trialEndsMs = toMillis(matchmaking && matchmaking.freeTrialEndsAt);
  if (plan === "kinlo_plus") return {unlocked: true, tier: "plus"};
  if (trialEndsMs != null && nowMs < trialEndsMs) return {unlocked: true, tier: "free_trial"};
  return {unlocked: false, tier: "locked"};
}

/**
 * The signal keys that actually contributed (value ≥ 0.5) — the "why".
 * @param {object} affinity a computeAffinity result
 * @return {Array<string>} contributing signal keys, strongest first
 */
function reasonsFrom(affinity) {
  return (affinity.signals || [])
    .filter((s) => s.value != null && s.value >= 0.5)
    .sort((a, b) => b.weight - a.weight)
    .map((s) => s.key);
}

/**
 * Build (and persist) the curated set for one user. Pure enough to unit-test the
 * ranking by injecting a `db`-like reader isn't done here (kept simple); the
 * ranking math lives in ./affinity which IS unit-tested.
 * @param {string} me uid
 * @param {number} nowMs epoch ms
 * @return {Promise<object>} the written set (members withheld when locked)
 */
async function generateForUser(me, nowMs) {
  const meSnap = await db.collection("users").doc(me).get();
  const meUser = meSnap.exists ? meSnap.data() : {};
  const mm = meUser.matchmaking || {};

  // Gate 1 — participation. No consent / incomplete profile / disabled → no set.
  if (mm.consentAt == null || mm.profileComplete !== true || mm.enabled === false) {
    return {status: "inactive", weekOf: isoWeek(new Date(nowMs)), members: [], count: 0};
  }

  // Freemium (P4): the trial start is stamped HERE, server-side, the first time
  // we ever build a set for this user — so the client can't grant itself a
  // longer free week. The real unlock is plan === "kinlo_plus", which only the
  // Stripe webhook can set.
  if (mm.freeTrialEndsAt == null) {
    const trialEndsMs = nowMs + 7 * 86400000;
    mm.freeTrialEndsAt = admin.firestore.Timestamp.fromMillis(trialEndsMs);
    await db.collection("users").doc(me).set(
      {matchmaking: {freeTrialEndsAt: mm.freeTrialEndsAt}}, {merge: true},
    );
  }

  const mine = meUser.matchProfile || null; // denormalized user-level profile (P3)
  const [poolSnap, exclSnap] = await Promise.all([
    db.collection("matchPool").where("enabled", "==", true).limit(400).get(),
    db.collection("matchExclusions").doc(me).get(),
  ]);
  const excluded = new Set((exclSnap.exists ? exclSnap.data().excluded : []) || []);
  const myCommunities = new Set((mine && mine.communities) || meUser.communities || []);
  // Privacy default (P3): you only see people who share ≥1 community with you.
  // The cross-community SETTING (P4) is opt-in — it broadens discovery beyond
  // your shared communities. Default OFF keeps the "only shared community" rule.
  const crossCommunity = mm.crossCommunity === true;

  const ranked = poolSnap.docs
    .map((d) => ({uid: d.id, ...d.data()}))
    .filter((p) => p.uid !== me && !excluded.has(p.uid))
    .filter((p) => {
      if (crossCommunity) return true;
      const theirs = p.communities || [];
      return theirs.some((c) => myCommunities.has(c));
    })
    .map((p) => {
      const sharedCommunities = (p.communities || []).filter((c) => myCommunities.has(c)).length;
      const affinity = computeAffinity(mine, p, "social", {sharedCommunities});
      return {uid: p.uid, affinity, sharedCommunities};
    })
    .filter((x) => x.affinity.status === "ok")
    .sort((a, b) => b.affinity.score - a.affinity.score)
    .slice(0, SET_MAX);

  const members = ranked.map((x) => ({
    uid: x.uid,
    score: x.affinity.score,
    reasons: reasonsFrom(x.affinity),
    sharedCommunities: x.sharedCommunities,
  }));

  const {unlocked, tier} = gateFor(mm, meUser.plan || "free", nowMs);
  const weekOf = isoWeek(new Date(nowMs));

  const doc = {
    weekOf,
    mode: "social",
    tier,
    locked: !unlocked,
    // Server-side withholding: a locked set never carries its members. The
    // count survives so the paywall can say "we found N people for you".
    members: unlocked ? members : [],
    count: members.length,
    generatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection("curatedSets").doc(me).set(doc, {merge: false});
  return {status: members.length >= SET_MIN ? "ready" : "thin", ...doc};
}

// ---- callables / schedule --------------------------------------------------

const requestCuratedSet = onCall(async (request) => {
  const me = request.auth && request.auth.uid;
  if (!me) throw new HttpsError("unauthenticated", "Sign in required.");
  const res = await generateForUser(me, Date.now());
  // Never hand the client the members when locked — already withheld above.
  return res;
});

const generateWeeklyCuratedSets = onSchedule(
  {schedule: "every monday 08:00", timeZone: "America/Mexico_City"},
  async () => {
    const now = Date.now();
    // Only opted-in, active users get a weekly set.
    const users = await db.collection("users")
      .where("matchmaking.enabled", "==", true)
      .limit(2000)
      .get();
    let generated = 0;
    for (const u of users.docs) {
      const mm = u.data().matchmaking || {};
      if (mm.consentAt == null || mm.profileComplete !== true) continue;
      try {
        await generateForUser(u.id, now);
        generated++;
      } catch (e) {
        console.error("curatedSet failed for", u.id, e.message);
      }
    }
    console.log(`curatedSets generated: ${generated}`);
  },
);

/**
 * Double opt-in intro. PRIVATE like a like: writing the edge never reveals
 * interest; only a reciprocal request forms the connection (mutual Follow + DM
 * thread). Mirrors createLikeAndMaybeMatch, but user-level / cross-community.
 * data: { toUid }
 */
const requestMatchIntro = onCall(async (request) => {
  const from = request.auth && request.auth.uid;
  if (!from) throw new HttpsError("unauthenticated", "Sign in required.");
  const {toUid} = request.data || {};
  if (!toUid || toUid === from) throw new HttpsError("invalid-argument", "Bad target.");

  // Both sides must be active participants in matchmaking.
  const [meSnap, toSnap] = await Promise.all([
    db.collection("users").doc(from).get(),
    db.collection("users").doc(toUid).get(),
  ]);
  const meMm = (meSnap.exists && meSnap.data().matchmaking) || {};
  const toMm = (toSnap.exists && toSnap.data().matchmaking) || {};
  const active = (mm) => mm.consentAt != null && mm.profileComplete === true && mm.enabled !== false;
  if (!active(meMm)) throw new HttpsError("failed-precondition", "not_participating");
  if (!active(toMm)) throw new HttpsError("failed-precondition", "peer_not_participating");

  const introId = [from, toUid].sort().join("_");
  const myEdge = db.collection("matchIntros").doc(introId).collection("edges").doc(from);
  const theirEdge = db.collection("matchIntros").doc(introId).collection("edges").doc(toUid);
  const threadId = introId; // dms thread id is the sorted pair too
  const threadRef = db.collection("dms").doc(threadId);

  const result = await db.runTransaction(async (tx) => {
    const theirSnap = await tx.get(theirEdge);
    tx.set(myEdge, {from, createdAt: FieldValue.serverTimestamp()}, {merge: true});
    if (!theirSnap.exists) return {matched: false};

    // Reciprocal → connect: mutual follow + a DM thread they can both open.
    const users = [from, toUid].sort();
    tx.set(db.collection("follows").doc(`${from}_${toUid}`),
      {followerId: from, followeeId: toUid, createdAt: FieldValue.serverTimestamp()}, {merge: true});
    tx.set(db.collection("follows").doc(`${toUid}_${from}`),
      {followerId: toUid, followeeId: from, createdAt: FieldValue.serverTimestamp()}, {merge: true});
    tx.set(threadRef, {
      users, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      lastMessage: "", source: "matchmaking",
    }, {merge: true});
    tx.set(db.collection("matchIntros").doc(introId),
      {users, status: "connected", connectedAt: FieldValue.serverTimestamp()}, {merge: true});
    return {matched: true, threadId};
  });

  if (result.matched) {
    for (const ruid of [toUid, from]) {
      await db.collection("notifications").add({
        userId: ruid, type: "match_intro", read: false,
        titleKey: "notifications.matchIntro.title",
        bodyKey: "notifications.matchIntro.body",
        params: {}, icon: "💜",
        createdAt: FieldValue.serverTimestamp(),
        metadata: {threadId},
      });
    }
  }
  return result;
});

module.exports = {
  requestCuratedSet,
  generateWeeklyCuratedSets,
  requestMatchIntro,
  // exported for reasoning/tests
  isoWeek,
  gateFor,
  reasonsFrom,
};
