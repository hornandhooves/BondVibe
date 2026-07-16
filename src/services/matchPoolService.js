/**
 * Matchmaking v2 — user-level cross-community pool (P3).
 *
 * v1 matching is event-scoped (matchProfiles/{eventId}/attendees). v2 adds a
 * SINGLE user-level profile, `matchPool/{uid}`, that spans every community the
 * user belongs to. The weekly curated-set generator (functions/matching/
 * curated.js) reads this pool; the "share ≥1 community" privacy rule is applied
 * there against each doc's denormalized `communities` list.
 *
 * A "community" is a hostGroup the user belongs to (as member OR host). We
 * denormalize those ids onto the pool doc so the server can gate visibility
 * without extra reads.
 */
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { arr, stripUndefined } from "../utils/firestoreClean";

const uid = () => auth.currentUser?.uid || null;

/** Every community (hostGroup id) the current user belongs to — member or host. */
export const getMyCommunities = async (me = null) => {
  const meId = me || uid();
  if (!meId) return [];
  try {
    const [asMember, asHost] = await Promise.all([
      getDocs(query(collection(db, "hostGroups"), where("memberIds", "array-contains", meId))),
      getDocs(query(collection(db, "hostGroups"), where("hostId", "==", meId))),
    ]);
    const ids = new Set();
    asMember.docs.forEach((d) => ids.add(d.id));
    asHost.docs.forEach((d) => ids.add(d.id));
    return [...ids];
  } catch (e) {
    console.error("❌ getMyCommunities:", e);
    return [];
  }
};

/**
 * Publish/refresh the current user's cross-community pool profile from their
 * canonical matchmaking fields (users/{me}.matchProfile) + communities. The pool
 * doc is only "enabled" while the user is an active participant (consent +
 * complete + enabled); otherwise it's written disabled so they stop appearing.
 * @return {Promise<{success:boolean, enabled?:boolean, communities?:number}>}
 */
export const syncMatchPool = async () => {
  const me = uid();
  if (!me) return { success: false };
  try {
    const snap = await getDoc(doc(db, "users", me));
    const u = snap.exists() ? snap.data() : {};
    const mm = u.matchmaking || {};
    const mp = u.matchProfile || {};
    const active = mm.consentAt != null && mm.profileComplete === true && mm.enabled !== false;
    const communities = await getMyCommunities(me);

    await setDoc(
      doc(db, "matchPool", me),
      stripUndefined({
        userId: me,
        enabled: active,
        // Display (real photo + name — no emoji, context-first cards).
        displayName: u.fullName ?? u.name ?? "Guest",
        photoUrl: u.avatar ?? null,
        // Matching signals (mirror of the canonical matchProfile). Arrays are
        // coerced so a partial matchProfile can never write undefined.
        interests: arr(mp.interests),
        funnyTags: arr(mp.funnyTags),
        lookingFor: arr(mp.lookingFor),
        energy: mp.energy ?? null,
        groupPref: mp.groupPref ?? null,
        pro: mp.pro ?? null,
        personality: mp.personality ?? u.personality ?? null,
        communities: arr(communities),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    return { success: true, enabled: active, communities: communities.length };
  } catch (e) {
    console.error("❌ syncMatchPool:", e);
    return { success: false, error: e.message };
  }
};

/** Remove the user from the cross-community pool entirely (P4 disable). */
export const removeFromMatchPool = async () => {
  const me = uid();
  if (!me) return { success: false };
  try {
    await deleteDoc(doc(db, "matchPool", me));
    return { success: true };
  } catch (e) {
    console.error("❌ removeFromMatchPool:", e);
    return { success: false, error: e.message };
  }
};
