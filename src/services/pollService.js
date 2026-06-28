/**
 * Polls inside the event chat.
 *
 * A poll is a live, mutable object stored in `events/{eventId}/polls/{pollId}`
 * with per-user votes in a `votes/{userId}` subcollection (so each user owns
 * their vote and rules stay simple). A chat message of type "poll" references
 * the poll by id, and the poll card subscribes to it for live results.
 *
 * Single-choice for now (a user has one vote they can change).
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

/**
 * Create a poll and post a referencing message into the event chat.
 * @param {string} eventId
 * @param {{question:string, options:string[]}} input
 * @returns {Promise<{success:boolean, pollId?:string, error?:string}>}
 */
export const createPoll = async (eventId, { question, options }) => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return { success: false, error: "Not signed in." };
    const clean = (options || [])
      .map((t) => (t || "").trim())
      .filter(Boolean);
    if (!question?.trim()) return { success: false, error: "Question is required." };
    if (clean.length < 2) return { success: false, error: "Add at least two options." };

    const pollRef = await addDoc(collection(db, "events", eventId, "polls"), {
      question: question.trim(),
      options: clean.map((text, i) => ({ id: String(i), text })),
      closed: false,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });

    // Post the chat message that renders the poll card. ISO string createdAt
    // to stay consistent with the rest of the message stream ordering.
    await addDoc(collection(db, "events", eventId, "messages"), {
      senderId: uid,
      type: "poll",
      text: `📊 ${question.trim()}`,
      data: { pollId: pollRef.id },
      createdAt: new Date().toISOString(),
      deliveredTo: {},
      readBy: {},
    });

    return { success: true, pollId: pollRef.id };
  } catch (e) {
    console.error("❌ createPoll:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Cast/change the current user's vote.
 * @param {string} eventId
 * @param {string} pollId
 * @param {string} optionId
 */
export const votePoll = async (eventId, pollId, optionId) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(doc(db, "events", eventId, "polls", pollId, "votes", uid), {
    optionId,
    votedAt: serverTimestamp(),
  });
};

/**
 * Close a poll (host only — also enforced by rules).
 * @param {string} eventId
 * @param {string} pollId
 */
export const closePoll = async (eventId, pollId) => {
  await updateDoc(doc(db, "events", eventId, "polls", pollId), { closed: true });
};

/**
 * Subscribe to a poll document.
 * @returns unsubscribe fn
 */
export const subscribePoll = (eventId, pollId, cb) =>
  onSnapshot(doc(db, "events", eventId, "polls", pollId), (s) =>
    cb(s.exists() ? { id: s.id, ...s.data() } : null)
  );

/**
 * Subscribe to a poll's votes.
 * @returns unsubscribe fn
 */
export const subscribeVotes = (eventId, pollId, cb) =>
  onSnapshot(
    collection(db, "events", eventId, "polls", pollId, "votes"),
    (s) => cb(s.docs.map((d) => ({ userId: d.id, ...d.data() })))
  );
