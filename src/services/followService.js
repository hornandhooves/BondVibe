/**
 * Social graph (follows). Foundation for the future Instagram-style layer
 * (feed/posts/reactions/DMs). Doc id is `{followerId}_{followeeId}` so a follow
 * is idempotent and existence is a single get.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

const followId = (a, b) => `${a}_${b}`;

export const followUser = async (followeeId) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !followeeId || uid === followeeId) return { success: false };
  try {
    await setDoc(doc(db, "follows", followId(uid, followeeId)), {
      followerId: uid,
      followeeId,
      createdAt: serverTimestamp(),
    });
    return { success: true };
  } catch (e) {
    console.error("❌ followUser:", e);
    return { success: false, error: e.message };
  }
};

export const unfollowUser = async (followeeId) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !followeeId) return { success: false };
  try {
    await deleteDoc(doc(db, "follows", followId(uid, followeeId)));
    return { success: true };
  } catch (e) {
    console.error("❌ unfollowUser:", e);
    return { success: false, error: e.message };
  }
};

export const isFollowing = async (followeeId) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !followeeId) return false;
  const s = await getDoc(doc(db, "follows", followId(uid, followeeId)));
  return s.exists();
};

/** UIDs the current user follows. */
export const getFollowing = async (uid = null) => {
  const me = uid || auth.currentUser?.uid;
  if (!me) return [];
  try {
    const snap = await getDocs(
      query(collection(db, "follows"), where("followerId", "==", me))
    );
    return snap.docs.map((d) => d.data().followeeId).filter(Boolean);
  } catch (e) {
    console.error("❌ getFollowing:", e);
    return [];
  }
};

/** UIDs that follow the given user. */
export const getFollowers = async (uid = null) => {
  const target = uid || auth.currentUser?.uid;
  if (!target) return [];
  try {
    const snap = await getDocs(
      query(collection(db, "follows"), where("followeeId", "==", target))
    );
    return snap.docs.map((d) => d.data().followerId).filter(Boolean);
  } catch (e) {
    console.error("❌ getFollowers:", e);
    return [];
  }
};
