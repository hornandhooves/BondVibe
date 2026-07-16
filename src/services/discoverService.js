/**
 * Wall v2 · Descubre (client data layer, P1).
 *
 * People are ranked + gated on the SERVER (functions/wall/discover.js): the
 * client only renders what it receives (locked cards carry no identity, so the
 * blur can't leak). Communities and events are lighter, ungated suggestions
 * fetched directly.
 */
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit as qLimit,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { getBlockedIds } from "./blockService";

const uid = () => auth.currentUser?.uid || null;

/**
 * Affinity-ranked people. Returns the server's gated payload:
 *   { participating, isPlus, people:[{...}|{locked:true}], lockedCount }
 */
export const getDiscoverPeople = async () => {
  try {
    const fn = httpsCallable(getFunctions(), "discoverForYou");
    const res = await fn({});
    return res.data || { participating: false, people: [], lockedCount: 0, isPlus: false };
  } catch (e) {
    console.error("❌ getDiscoverPeople:", e);
    return { participating: false, people: [], lockedCount: 0, isPlus: false, error: e.message };
  }
};

// Suggested communities come from the discoverForYou payload (computed
// server-side — a client can't list communities it hasn't joined under the
// per-member hostGroups read rule).

/** Upcoming events the user might like (light suggestion — ungated). */
export const getSuggestedEvents = async (max = 6) => {
  const me = uid();
  try {
    const blocked = new Set(await getBlockedIds());
    const nowIso = new Date().toISOString();
    const snap = await getDocs(
      query(
        collection(db, "events"),
        where("date", ">=", nowIso),
        orderBy("date", "asc"),
        qLimit(20)
      )
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((e) => !blocked.has(e.creatorId) && !(e.attendees || []).includes(me))
      .slice(0, max);
  } catch (e) {
    console.error("❌ getSuggestedEvents:", e);
    return [];
  }
};
