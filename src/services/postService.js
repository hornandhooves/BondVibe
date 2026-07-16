/**
 * Social posts — feed, likes and comments. The feed is posts from people you
 * follow (plus yourself), newest first, with blocked users filtered out.
 * likeCount/commentCount are maintained server-side (functions/social).
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as qLimit,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { getFollowing } from "./followService";
import { getBlockedIds } from "./blockService";
import { stripUndefined } from "../utils/firestoreClean";

const uid = () => auth.currentUser?.uid || null;

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/** Create a post authored by the current user. */
/**
 * Create a post. Wall v2 (P0) enriches it — but stays backward compatible: old
 * posts without communityId/authorFunnyTag/mediaType still render fine, and the
 * legacy `images` array is preserved alongside the new `mediaUrls`.
 * @param {object} p { text, images?, mediaUrls?, mediaType?, communityId?,
 *   authorFunnyTag?, cta?, isHostPost? }
 */
export const createPost = async ({
  text,
  images = [],
  mediaUrls,
  mediaType = "photo",
  communityId = null,
  authorFunnyTag,
  cta = null,
  isHostPost = false,
}) => {
  const me = uid();
  const body = (text || "").trim();
  const media = Array.isArray(mediaUrls) && mediaUrls.length ? mediaUrls : images;
  if (!me || (!body && media.length === 0)) return { success: false };
  try {
    const userSnap = await getDoc(doc(db, "users", me));
    const u = userSnap.exists() ? userSnap.data() : {};
    // Denormalize the author's headline funny tag (from their match profile) so
    // the card can show context without an extra read. Explicit arg wins.
    const funnyTag =
      authorFunnyTag ?? (u.matchProfile?.funnyTags?.[0] ?? null);
    const resolvedMediaType = media.length > 1 ? "carousel" : mediaType;
    const ref = await addDoc(
      collection(db, "posts"),
      stripUndefined({
        authorId: me,
        authorName: u.fullName || u.name || "Someone",
        authorAvatar: u.avatar ?? null,
        text: body,
        images: media, // legacy field kept for backcompat
        mediaUrls: media, // v2 canonical
        mediaType: resolvedMediaType,
        communityId,
        authorFunnyTag: funnyTag,
        isHostPost: !!isHostPost,
        cta: cta || null,
        likeCount: 0,
        commentCount: 0,
        createdAt: serverTimestamp(),
      })
    );
    return { success: true, id: ref.id };
  } catch (e) {
    console.error("❌ createPost:", e);
    return { success: false, error: e.message };
  }
};

/** Feed = posts from people you follow (+ yourself), newest first. */
export const getFeed = async (max = 50) => {
  const me = uid();
  if (!me) return [];
  try {
    const [following, blocked] = await Promise.all([getFollowing(), getBlockedIds()]);
    const authorIds = Array.from(new Set([me, ...following])).filter(
      (id) => !blocked.includes(id)
    );
    const groups = chunk(authorIds, 10);
    const snaps = await Promise.all(
      groups.map((g) =>
        getDocs(
          query(
            collection(db, "posts"),
            where("authorId", "in", g),
            orderBy("createdAt", "desc"),
            qLimit(max)
          )
        )
      )
    );
    // Recap posts route to ATTENDEES (not followers): you were there, you
    // see the recap. No orderBy → no composite index; merged + sorted below.
    const recapSnap = await getDocs(
      query(
        collection(db, "posts"),
        where("attendeeIds", "array-contains", me),
        qLimit(20)
      )
    ).catch(() => null);
    const recaps = recapSnap
      ? recapSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      : [];

    const seen = new Set();
    const posts = [
      ...snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      ...recaps,
    ]
      .filter((p) => (seen.has(p.id) ? false : seen.add(p.id)))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    return posts.slice(0, max);
  } catch (e) {
    console.error("❌ getFeed:", e);
    return [];
  }
};

/** Posts by a single user (their profile grid). */
export const getUserPosts = async (userId, max = 50) => {
  try {
    const snap = await getDocs(
      query(
        collection(db, "posts"),
        where("authorId", "==", userId),
        orderBy("createdAt", "desc"),
        qLimit(max)
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("❌ getUserPosts:", e);
    return [];
  }
};

export const getPost = async (postId) => {
  const s = await getDoc(doc(db, "posts", postId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};

export const deletePost = async (postId) => {
  try {
    await deleteDoc(doc(db, "posts", postId));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// ---- Likes -----------------------------------------------------------------
const likeRef = (postId, u) => doc(db, "posts", postId, "likes", u);

export const hasLiked = async (postId) => {
  const me = uid();
  if (!me) return false;
  const s = await getDoc(likeRef(postId, me));
  return s.exists();
};

export const likePost = async (postId) => {
  const me = uid();
  if (!me) return { success: false };
  await setDoc(likeRef(postId, me), { uid: me, createdAt: serverTimestamp() });
  return { success: true };
};

export const unlikePost = async (postId) => {
  const me = uid();
  if (!me) return { success: false };
  await deleteDoc(likeRef(postId, me));
  return { success: true };
};

// ---- Comments --------------------------------------------------------------
export const addComment = async (postId, text) => {
  const me = uid();
  const body = (text || "").trim();
  if (!me || !body) return { success: false };
  try {
    const userSnap = await getDoc(doc(db, "users", me));
    const u = userSnap.exists() ? userSnap.data() : {};
    await addDoc(collection(db, "posts", postId, "comments"), {
      authorId: me,
      authorName: u.fullName || u.name || "Someone",
      authorAvatar: u.avatar ?? null,
      text: body,
      createdAt: serverTimestamp(),
    });
    return { success: true };
  } catch (e) {
    console.error("❌ addComment:", e);
    return { success: false, error: e.message };
  }
};

export const subscribeComments = (postId, cb) =>
  onSnapshot(
    query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error("❌ subscribeComments:", err)
  );

export const deleteComment = async (postId, commentId) => {
  try {
    await deleteDoc(doc(db, "posts", postId, "comments", commentId));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
