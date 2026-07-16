/**
 * Matchmaking v2 — curated sets, exclusions & intros (client data layer, P2).
 *
 * The set itself is BUILT and GATED on the server (see functions/matching/
 * curated.js): the client only reads curatedSets/{me} (whose members are already
 * withheld when locked) and hydrates the member cards from the pool. Requesting
 * a fresh set and requesting an intro both go through Cloud Functions.
 *
 * Firestore model (see firestore.rules · "MATCHMAKING V2"):
 *   curatedSets/{uid}            — server-written weekly set (owner reads own)
 *   matchExclusions/{uid}        — { excluded:[uid] } "dejar de sugerir" (≠ block)
 *   matchIntros/{introId}/edges  — PRIVATE server-only (double opt-in)
 *   matchPool/{uid}              — user-level display profile (P3)
 */
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  query,
  where,
  documentId,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { curatedSetState } from "../utils/curatedGate";

const uid = () => auth.currentUser?.uid || null;

/** Chunk an array into ≤10-item groups (Firestore `in` query limit). */
const chunk10 = (a) => {
  const out = [];
  for (let i = 0; i < a.length; i += 10) out.push(a.slice(i, i + 10));
  return out;
};

/**
 * The current user's curated set, resolved to a render state and (when ready)
 * hydrated with each member's display profile from the pool.
 * @return {Promise<{state:string, weekOf?:string, count:number, tier?:string,
 *   members:Array}>}
 */
export const getCuratedSet = async () => {
  const me = uid();
  if (!me) return { state: "inactive", members: [], count: 0 };
  try {
    const [setSnap, userSnap] = await Promise.all([
      getDoc(doc(db, "curatedSets", me)),
      getDoc(doc(db, "users", me)),
    ]);
    const set = setSnap.exists() ? setSnap.data() : null;
    const mm = (userSnap.exists() && userSnap.data().matchmaking) || {};
    const state = curatedSetState(set, mm);

    if (state !== "ready") {
      return { state, weekOf: set?.weekOf, count: set?.count || 0, tier: set?.tier, members: [] };
    }

    // Hydrate the "te presentamos" cards from the pool (context-first display).
    const byUid = new Map((set.members || []).map((m) => [m.uid, m]));
    const ids = [...byUid.keys()];
    const profiles = [];
    for (const group of chunk10(ids)) {
      const snap = await getDocs(
        query(collection(db, "matchPool"), where(documentId(), "in", group))
      );
      snap.docs.forEach((d) => profiles.push({ uid: d.id, ...d.data() }));
    }
    const members = profiles
      .map((p) => ({ ...p, ...byUid.get(p.uid) })) // fold in score/reasons/shared
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    return { state, weekOf: set.weekOf, count: set.count || members.length, tier: set.tier, members };
  } catch (e) {
    console.error("❌ getCuratedSet:", e);
    return { state: "empty", members: [], count: 0 };
  }
};

/** Ask the server to (re)generate this week's set. Returns the gate result. */
export const requestCuratedSet = async () => {
  const fn = httpsCallable(getFunctions(), "requestCuratedSet");
  const res = await fn({});
  return res.data;
};

/**
 * "Dejar de sugerir" — stop suggesting this person. This is NOT a block: they
 * simply won't appear in future curated sets. Removable later (a block lives in
 * the safety layer). Additive to matchExclusions/{me}.excluded.
 */
export const dontSuggest = async (otherUid) => {
  const me = uid();
  if (!me || !otherUid) return { success: false };
  try {
    await setDoc(
      doc(db, "matchExclusions", me),
      { ownerId: me, excluded: arrayUnion(otherUid), updatedAt: serverTimestamp() },
      { merge: true }
    );
    return { success: true };
  } catch (e) {
    console.error("❌ dontSuggest:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Request a double opt-in intro. PRIVATE: this never reveals interest. Only when
 * the other person also requests does the server form a mutual follow + open a
 * DM thread. Returns { matched, threadId? }.
 */
export const requestIntro = async (toUid) => {
  const fn = httpsCallable(getFunctions(), "requestMatchIntro");
  const res = await fn({ toUid });
  return res.data;
};
