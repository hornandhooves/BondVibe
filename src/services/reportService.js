/**
 * Moderation reports sent to the Kinlo admin: off-platform payment attempts
 * (#4) and host-initiated user blocks with evidence (#10).
 */
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

const report = async (fields) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return { success: false };
  try {
    const ref = await addDoc(collection(db, "reports"), {
      reporterId: uid,
      status: "open",
      createdAt: serverTimestamp(),
      ...fields,
    });
    return { success: true, id: ref.id };
  } catch (e) {
    console.error("❌ report:", e);
    return { success: false, error: e.message };
  }
};

/** Auto-report a blocked off-platform payment message. */
export const reportProhibitedContent = ({ reason, content, groupId, eventId }) =>
  report({
    type: "prohibited_content",
    reason: reason || "bank_details",
    content: String(content || "").slice(0, 500),
    groupId: groupId || null,
    eventId: eventId || null,
  });

/** Host blocks a user in a group, with a reason + optional evidence image. */
export const reportUserBlock = ({ groupId, targetUserId, reason, evidenceUrl }) =>
  report({
    type: "user_block",
    groupId: groupId || null,
    targetUserId: targetUserId || null,
    reason: String(reason || "").slice(0, 500),
    evidenceUrl: evidenceUrl || null,
  });
