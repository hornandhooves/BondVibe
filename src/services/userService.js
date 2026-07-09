/**
 * Public user search + handle resolution (spec 10). Returns a PUBLIC projection
 * only — { uid, handle, name, avatar, city } — never email/phone (those live in
 * Auth / the private subcollection). Respects blocks.
 */
import { collection, query, where, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { getBlockedIds } from "./blockService";

// Firestore prefix-range high sentinel (a very high private-use code point).
const HIGH = String.fromCharCode(0xf8ff);

const publicProjection = (uid, d) => ({
  uid,
  handle: d.handle || d.handleLower || "",
  handleLower: d.handleLower || "",
  name: d.fullName || d.name || "",
  avatar: d.avatar || null,
  city: d.city || d.location || null,
});

/**
 * Find people by @handle prefix (or a bare prefix). Prefix range query on the
 * auto-indexed `handleLower` field. Filters out blocked users + myself.
 * @param {string} raw prefix (with or without a leading @)
 * @returns {Promise<Array<{uid,handle,name,avatar,city}>>}
 */
export const searchUsers = async (raw) => {
  const q = String(raw || "").trim().toLowerCase().replace(/^@+/, "");
  if (q.length < 2) return [];
  const me = auth.currentUser?.uid;
  try {
    const snap = await getDocs(
      query(
        collection(db, "users"),
        where("handleLower", ">=", q),
        where("handleLower", "<=", q + HIGH),
        limit(20)
      )
    );
    const blocked = new Set(await getBlockedIds().catch(() => []));
    return snap.docs
      .filter((d) => d.id !== me && !blocked.has(d.id))
      .map((d) => publicProjection(d.id, d.data()));
  } catch (e) {
    return [];
  }
};

/**
 * Resolve an exact @handle → public user (for DM/follow/group-add/invite/CRM).
 * Uses the handles/{handleLower} reservation doc → uid → user doc.
 * @param {string} handle
 * @returns {Promise<{uid,handle,name,avatar,city}|null>}
 */
export const findUserByHandle = async (handle) => {
  const h = String(handle || "").trim().toLowerCase().replace(/^@+/, "");
  if (!h) return null;
  try {
    const hSnap = await getDoc(doc(db, "handles", h));
    if (!hSnap.exists() || !hSnap.data().uid) return null;
    const uid = hSnap.data().uid;
    const uSnap = await getDoc(doc(db, "users", uid));
    return uSnap.exists() ? publicProjection(uid, uSnap.data()) : null;
  } catch (e) {
    return null;
  }
};
