/**
 * Moments — ephemeral 24h media (Wall v2 · P3). Reuses the post-image upload
 * pipeline. Each item lives at moments/{uid}/items/{id} with an `expiresAt`
 * 24h out; a scheduled Cloud Function (purgeExpiredMoments) deletes expired
 * items server-side, and clients also filter by expiresAt so nothing stale
 * shows even between purges. Never a client-only TTL.
 */
import {
  collection,
  collectionGroup,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as qLimit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { getDoc } from "firebase/firestore";
import { uploadPostImage } from "./storageService";
import { getFollowing } from "./followService";
import { getBlockedIds } from "./blockService";

const uid = () => auth.currentUser?.uid || null;
const MOMENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Upload + create a 24h moment for the current user. */
export const addMoment = async (localUri, mediaType = "photo") => {
  const me = uid();
  if (!me || !localUri) return { success: false };
  try {
    const url = await uploadPostImage(me, localUri);
    const uSnap = await getDoc(doc(db, "users", me));
    const u = uSnap.exists() ? uSnap.data() : {};
    await addDoc(collection(db, "moments", me, "items"), {
      authorId: me,
      authorName: u.fullName || u.name || "Someone",
      authorAvatar: u.avatar ?? null,
      url,
      mediaType,
      createdAt: serverTimestamp(),
      // Server-enforced lifetime — the purge CF deletes past this instant.
      expiresAt: Timestamp.fromMillis(Date.now() + MOMENT_TTL_MS),
    });
    return { success: true };
  } catch (e) {
    console.error("❌ addMoment:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Active moments from people you follow (and yourself), grouped by author.
 * Filters out expired items and blocked authors. Returns
 *   [{ authorId, authorName, authorAvatar, items:[...], isMine }]
 */
export const getMomentsFeed = async () => {
  const me = uid();
  if (!me) return [];
  try {
    const [following, blocked] = await Promise.all([getFollowing(), getBlockedIds()]);
    const allowed = new Set([me, ...following].filter((id) => !blocked.includes(id)));
    const snap = await getDocs(
      query(
        collectionGroup(db, "items"),
        where("expiresAt", ">", Timestamp.now()),
        orderBy("expiresAt", "asc"),
        qLimit(200)
      )
    );
    const byAuthor = new Map();
    snap.docs.forEach((d) => {
      const m = { id: d.id, ...d.data() };
      if (!m.authorId || !allowed.has(m.authorId)) return;
      if (!byAuthor.has(m.authorId)) {
        byAuthor.set(m.authorId, {
          authorId: m.authorId,
          authorName: m.authorName,
          authorAvatar: m.authorAvatar,
          isMine: m.authorId === me,
          items: [],
        });
      }
      byAuthor.get(m.authorId).items.push(m);
    });
    // Mine first, then the rest.
    return [...byAuthor.values()].sort((a, b) => (b.isMine ? 1 : 0) - (a.isMine ? 1 : 0));
  } catch (e) {
    console.error("❌ getMomentsFeed:", e);
    return [];
  }
};

/** Delete one of my moments early. */
export const deleteMoment = async (momentId) => {
  const me = uid();
  if (!me || !momentId) return { success: false };
  try {
    await deleteDoc(doc(db, "moments", me, "items", momentId));
    return { success: true };
  } catch (e) {
    console.error("❌ deleteMoment:", e);
    return { success: false, error: e.message };
  }
};
