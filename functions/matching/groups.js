/**
 * Matchmaking v2 — match groups (P3). Small, community-scoped clusters of 4-6
 * compatible people. A group's chat only turns on once 3+ candidates have
 * actually JOINED (opt-in all the way down — being suggested into a group never
 * exposes you in a chat you didn't accept).
 *
 * Formed on the server (server-truth affinity + the "shares a community" rule)
 * from the cross-community pool (matchPool/{uid}). Mirrors the privacy posture
 * of the rest of matchmaking: the host never sees any of this.
 */

const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const {isoWeek} = require("./curated");
const {clusterMembers, GROUP_MIN, GROUP_MAX, CHAT_ACTIVE_AT} = require("./grouping");

const db = admin.firestore();

const formMatchGroups = onSchedule(
  {schedule: "every monday 08:30", timeZone: "America/Mexico_City"},
  async () => {
    const weekOf = isoWeek(new Date());
    const poolSnap = await db.collection("matchPool").where("enabled", "==", true).limit(4000).get();
    const byCommunity = new Map();
    poolSnap.docs.forEach((d) => {
      const p = {uid: d.id, profile: d.data()};
      for (const c of d.data().communities || []) {
        if (!byCommunity.has(c)) byCommunity.set(c, []);
        byCommunity.get(c).push(p);
      }
    });

    let created = 0;
    for (const [community, members] of byCommunity) {
      if (members.length < GROUP_MIN) continue;
      const groups = clusterMembers(members);
      for (const uids of groups) {
        // Idempotent per (community, weekOf, membership signature).
        const id = `${community}_${weekOf}_${uids.slice().sort().join("").slice(0, 24)}`;
        await db.collection("matchGroups").doc(id).set({
          community, weekOf, candidates: uids, joined: [],
          chatActive: false, memberCount: 0,
          createdAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        created++;
      }
    }
    console.log(`matchGroups formed: ${created}`);
  },
);

/**
 * Join a suggested group. Only a candidate can join; caps at GROUP_MAX; the
 * group chat flips on once CHAT_ACTIVE_AT members have joined.
 * data: { groupId }
 */
const joinMatchGroup = onCall(async (request) => {
  const me = request.auth && request.auth.uid;
  if (!me) throw new HttpsError("unauthenticated", "Sign in required.");
  const {groupId} = request.data || {};
  if (!groupId) throw new HttpsError("invalid-argument", "Missing groupId.");

  const ref = db.collection("matchGroups").doc(groupId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Group not found.");
    const g = snap.data();
    if (!(g.candidates || []).includes(me)) {
      throw new HttpsError("permission-denied", "not_a_candidate");
    }
    const joined = new Set(g.joined || []);
    if (joined.has(me)) return {joined: true, chatActive: g.chatActive, memberCount: joined.size};
    if (joined.size >= GROUP_MAX) throw new HttpsError("failed-precondition", "group_full");
    joined.add(me);
    const chatActive = joined.size >= CHAT_ACTIVE_AT;
    tx.update(ref, {joined: [...joined], memberCount: joined.size, chatActive});
    return {joined: true, chatActive, memberCount: joined.size};
  });
});

module.exports = {formMatchGroups, joinMatchGroup, clusterMembers, GROUP_MIN, GROUP_MAX, CHAT_ACTIVE_AT};
