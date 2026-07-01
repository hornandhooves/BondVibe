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
  limit,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";

// Invite code: short, unambiguous (no 0/O/1/I).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = () =>
  Array.from(
    { length: 6 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join("");

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
      inviteCode: genCode(),
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
 * Clear this user's unread group_message notifications for a group (drops the
 * Home bell badge). Reuses the userId+read index; filters type/group client-side.
 */
export const markGroupNotificationsRead = async (groupId) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    const snap = await getDocs(
      query(
        collection(db, "notifications"),
        where("userId", "==", uid),
        where("read", "==", false)
      )
    );
    const batch = writeBatch(db);
    let n = 0;
    snap.forEach((d) => {
      const data = d.data();
      if (data.type === "group_message" && data.metadata?.groupId === groupId) {
        batch.update(d.ref, { read: true });
        n++;
      }
    });
    if (n > 0) await batch.commit();
  } catch (e) {
    console.error("❌ markGroupNotificationsRead:", e);
  }
};

/**
 * Mark group messages (not mine, not already read by me) as read — drives the
 * blue read ✓✓ on the sender's side. Self-terminating: once I'm in readBy the
 * next snapshot has nothing left to mark.
 */
export const markGroupMessagesRead = async (groupId, messages) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const toMark = (messages || []).filter(
    (m) => m.senderId !== uid && !(Array.isArray(m.readBy) && m.readBy.includes(uid))
  );
  if (toMark.length === 0) return;
  try {
    const batch = writeBatch(db);
    toMark.forEach((m) => {
      batch.update(doc(db, "hostGroups", groupId, "messages", m.id), {
        readBy: arrayUnion(uid),
      });
    });
    await batch.commit();
  } catch (e) {
    console.error("❌ markGroupMessagesRead:", e);
  }
};

/**
 * Ensure a group has an invite code (older groups created before codes existed).
 * Host only. Returns the code.
 */
export const ensureInviteCode = async (group) => {
  if (group.inviteCode) return group.inviteCode;
  const code = genCode();
  await updateDoc(doc(db, "hostGroups", group.id), { inviteCode: code });
  return code;
};

/** Host regenerates the invite code (invalidates the old link). */
export const regenerateInviteCode = async (groupId) => {
  const code = genCode();
  await updateDoc(doc(db, "hostGroups", groupId), { inviteCode: code });
  return code;
};

/**
 * Join a group by its invite code (any signed-in user). Runs server-side
 * because members can't write the group doc directly.
 * @param {string} code
 * @returns {Promise<{success:boolean, groupId?:string, error?:string}>}
 */
export const joinGroupByCode = async (code) => {
  try {
    const fn = httpsCallable(getFunctions(), "joinGroupByCode");
    const res = await fn({ code: (code || "").trim().toUpperCase() });
    return { success: true, ...res.data };
  } catch (e) {
    console.error("❌ joinGroupByCode:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Find a user by exact email (for adding to a group).
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export const findUserByEmail = async (email) => {
  try {
    const e = (email || "").trim().toLowerCase();
    if (!e) return null;
    const snap = await getDocs(
      query(collection(db, "users"), where("email", "==", e), limit(1))
    );
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (err) {
    console.error("❌ findUserByEmail:", err);
    return null;
  }
};

/**
 * Find a user by phone number (normalized to digits/+). Matches the format
 * stored on the profile.
 * @param {string} phone
 * @returns {Promise<object|null>}
 */
export const findUserByPhone = async (phone) => {
  try {
    const p = (phone || "").replace(/[^0-9+]/g, "");
    if (!p) return null;
    const snap = await getDocs(
      query(collection(db, "users"), where("phone", "==", p), limit(1))
    );
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (err) {
    console.error("❌ findUserByPhone:", err);
    return null;
  }
};

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
