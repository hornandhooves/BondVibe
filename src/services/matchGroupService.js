/**
 * Matchmaking v2 — match groups (client data layer, P3). Groups are formed on
 * the server (functions/matching/groups.js); the client lists the groups it's a
 * candidate for, joins via a Cloud Function (transactional cap + chat gate), and
 * — once the group chat is active (3+ joined) — reads/writes the group messages.
 *
 * Firestore model (see firestore.rules · "MATCHMAKING V2"):
 *   matchGroups/{groupId}            — { community, weekOf, candidates[], joined[],
 *                                        chatActive, memberCount } (server-written)
 *   matchGroups/{groupId}/messages   — group chat (joined members, chat active)
 */
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";

const uid = () => auth.currentUser?.uid || null;

/** Groups the current user has been suggested into (is a candidate for). */
export const getMyMatchGroups = async () => {
  const me = uid();
  if (!me) return [];
  try {
    const snap = await getDocs(
      query(collection(db, "matchGroups"), where("candidates", "array-contains", me))
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.weekOf || "").localeCompare(a.weekOf || ""));
  } catch (e) {
    console.error("❌ getMyMatchGroups:", e);
    return [];
  }
};

/** Join a suggested group (server caps at 6, flips the chat on at 3+ joined). */
export const joinMatchGroup = async (groupId) => {
  const fn = httpsCallable(getFunctions(), "joinMatchGroup");
  const res = await fn({ groupId });
  return res.data;
};

export const subscribeGroupMessages = (groupId, cb) =>
  onSnapshot(
    query(collection(db, "matchGroups", groupId, "messages"), orderBy("createdAt", "asc")),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error("❌ subscribeGroupMessages:", err)
  );

export const sendGroupMessage = async (groupId, text) => {
  const me = uid();
  const body = (text || "").trim();
  if (!me || !body) return { success: false };
  try {
    await addDoc(collection(db, "matchGroups", groupId, "messages"), {
      senderId: me,
      text: body,
      createdAt: serverTimestamp(),
    });
    await setDoc(
      doc(db, "matchGroups", groupId),
      { lastMessage: body, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return { success: true };
  } catch (e) {
    console.error("❌ sendGroupMessage:", e);
    return { success: false, error: e.message };
  }
};
