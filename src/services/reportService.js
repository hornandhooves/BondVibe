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

/**
 * KIN-114: reporte iniciado por el usuario desde ReportScreen. Pasa por el
 * mismo helper que reportProhibitedContent/reportUserBlock — es lo que
 * garantiza reporterId (exigido por firestore.rules) y createdAt de servidor.
 * targetUserId/targetEventId son mutuamente excluyentes; ambos null es un
 * reporte general (entrada desde el Centro de Seguridad).
 */
export const reportUserOrEvent = ({
  targetUserId, targetEventId, targetName, reason, details,
}) =>
  report({
    type: targetUserId ? "user" : targetEventId ? "event" : "general",
    targetUserId: targetUserId || null,
    targetEventId: targetEventId || null,
    targetName: targetName || null,
    reason: String(reason || "").slice(0, 500),
    details: String(details || "").slice(0, 2000),
  });
