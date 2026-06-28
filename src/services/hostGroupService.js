/**
 * Host Groups — WhatsApp-style persistent groups a host curates for frequent
 * attendees. Each group has its own message stream (text + event invitations).
 *
 * Data:
 *   hostGroups/{groupId}: hostId, name, description, memberIds[], lastMessage,
 *                         lastMessageAt, createdAt, updatedAt
 *   hostGroups/{groupId}/messages/{id}: senderId, type, text, data, createdAt
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

/** Create a group owned by the current host. */
export const createGroup = async (name, description, memberIds = []) => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return { success: false, error: "Not signed in." };
    if (!name?.trim()) return { success: false, error: "Group name is required." };
    const members = Array.from(new Set([...memberIds]));
    const ref = await addDoc(collection(db, "hostGroups"), {
      hostId: uid,
      name: name.trim(),
      description: description?.trim() || "",
      memberIds: members,
      lastMessage: "",
      lastMessageAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { success: true, groupId: ref.id };
  } catch (e) {
    console.error("❌ createGroup:", e);
    return { success: false, error: e.message };
  }
};

export const updateGroup = async (groupId, updates) => {
  await updateDoc(doc(db, "hostGroups", groupId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const addMembers = async (groupId, uids) => {
  await updateDoc(doc(db, "hostGroups", groupId), {
    memberIds: arrayUnion(...uids),
    updatedAt: serverTimestamp(),
  });
};

export const removeMember = async (groupId, uid) => {
  await updateDoc(doc(db, "hostGroups", groupId), {
    memberIds: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
};

export const deleteGroup = async (groupId) => {
  await deleteDoc(doc(db, "hostGroups", groupId));
};

export const getGroup = async (groupId) => {
  const s = await getDoc(doc(db, "hostGroups", groupId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};

/** Groups owned by a host (management list). */
export const getHostGroups = async (hostId = null) => {
  try {
    const uid = hostId || auth.currentUser?.uid;
    if (!uid) return [];
    const q = query(
      collection(db, "hostGroups"),
      where("hostId", "==", uid),
      orderBy("updatedAt", "desc")
    );
    const s = await getDocs(q);
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("❌ getHostGroups:", e);
    return [];
  }
};

/** Live groups the current user belongs to (member inbox). */
export const subscribeUserGroups = (cb) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  const q = query(
    collection(db, "hostGroups"),
    where("memberIds", "array-contains", uid)
  );
  return onSnapshot(
    q,
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => console.error("subscribeUserGroups:", e)
  );
};

/** Send a text message to a group. */
export const sendGroupMessage = async (groupId, text) => {
  const uid = auth.currentUser?.uid;
  const body = (text || "").trim();
  if (!uid || !body) return;
  await addDoc(collection(db, "hostGroups", groupId, "messages"), {
    senderId: uid,
    type: "text",
    text: body,
    createdAt: new Date().toISOString(),
  });
  await updateDoc(doc(db, "hostGroups", groupId), {
    lastMessage: body.length > 60 ? `${body.slice(0, 60)}…` : body,
    lastMessageAt: serverTimestamp(),
  });
};

/** Host posts an event invitation card to the group. */
export const sendEventInvite = async (groupId, event) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await addDoc(collection(db, "hostGroups", groupId, "messages"), {
    senderId: uid,
    type: "event_invite",
    text: `🎟️ Invitation: ${event.title || "an event"}`,
    data: { eventId: event.id, eventTitle: event.title || "" },
    createdAt: new Date().toISOString(),
  });
  await updateDoc(doc(db, "hostGroups", groupId), {
    lastMessage: `🎟️ Invited you to ${event.title || "an event"}`,
    lastMessageAt: serverTimestamp(),
  });
};

export const subscribeGroupMessages = (groupId, cb) =>
  onSnapshot(
    query(
      collection(db, "hostGroups", groupId, "messages"),
      orderBy("createdAt", "asc")
    ),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })))
  );

/**
 * Candidate members for a host: unique attendees across the host's events.
 * @returns {Promise<Array<{id, fullName, avatar}>>}
 */
export const getHostAttendeeCandidates = async (hostId = null) => {
  try {
    const uid = hostId || auth.currentUser?.uid;
    if (!uid) return [];
    const eventsSnap = await getDocs(
      query(collection(db, "events"), where("creatorId", "==", uid))
    );
    const ids = new Set();
    eventsSnap.forEach((e) => {
      (e.data().attendees || []).forEach((a) => {
        const id = typeof a === "string" ? a : a?.userId;
        if (id && id !== uid) ids.add(id);
      });
    });
    const users = await Promise.all(
      Array.from(ids).map(async (id) => {
        const u = await getDoc(doc(db, "users", id));
        return u.exists() ? { id, ...u.data() } : null;
      })
    );
    return users.filter(Boolean);
  } catch (e) {
    console.error("❌ getHostAttendeeCandidates:", e);
    return [];
  }
};
