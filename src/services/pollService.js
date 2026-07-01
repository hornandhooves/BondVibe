/**
 * Polls inside a conversation (event chat OR host group).
 *
 * A poll is a live, mutable object stored in `{...parent}/polls/{pollId}` with
 * per-user votes in a `votes/{userId}` subcollection (each user owns their
 * vote). A chat message of type "poll" references the poll by id, and the poll
 * card subscribes to it for live results.
 *
 * `parent` is the conversation path as an array of segments, e.g.
 * ["events", eventId] or ["hostGroups", groupId]. Single-choice for now.
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

const pollsCol = (parent) => collection(db, ...parent, "polls");
const pollDoc = (parent, pollId) => doc(db, ...parent, "polls", pollId);
const votesCol = (parent, pollId) =>
  collection(db, ...parent, "polls", pollId, "votes");
const voteDoc = (parent, pollId, uid) =>
  doc(db, ...parent, "polls", pollId, "votes", uid);
const messagesCol = (parent) => collection(db, ...parent, "messages");

/**
 * Create a poll and post a referencing message into the conversation.
 * @param {string[]} parent conversation path segments
 * @param {{question:string, options:string[]}} input
 */
export const createPoll = async (parent, { question, options, anonymous = false }) => {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return { success: false, error: "Not signed in." };
    const clean = (options || []).map((t) => (t || "").trim()).filter(Boolean);
    if (!question?.trim()) return { success: false, error: "Question is required." };
    if (clean.length < 2) return { success: false, error: "Add at least two options." };

    const pollRef = await addDoc(pollsCol(parent), {
      question: question.trim(),
      options: clean.map((text, i) => ({ id: String(i), text })),
      closed: false,
      anonymous: !!anonymous,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });

    await addDoc(messagesCol(parent), {
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

/** Cast/change the current user's vote. */
export const votePoll = async (parent, pollId, optionId) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(voteDoc(parent, pollId, uid), {
    optionId,
    votedAt: serverTimestamp(),
  });
};

/** Close a poll (host/creator only — enforced by rules). */
export const closePoll = async (parent, pollId) => {
  await updateDoc(pollDoc(parent, pollId), { closed: true });
};

export const subscribePoll = (parent, pollId, cb) =>
  onSnapshot(pollDoc(parent, pollId), (s) =>
    cb(s.exists() ? { id: s.id, ...s.data() } : null)
  );

export const subscribeVotes = (parent, pollId, cb) =>
  onSnapshot(votesCol(parent, pollId), (s) =>
    cb(s.docs.map((d) => ({ userId: d.id, ...d.data() })))
  );
