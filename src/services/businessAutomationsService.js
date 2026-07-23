/**
 * businessAutomationsService — client for the lifecycle automations engine
 * (kinlo_business/04). Rules CRUD + "send now" (delegates to the server, which
 * resolves the channel per member and logs delivery). Never sends directly.
 *
 * Data: businesses/{bizId}/automations/{ruleId} · businesses/{bizId}/messages
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebase";
import { getMyBizId } from "./businessService";

export const TRIGGERS = ["welcome", "reminder", "expiring_credit", "renewal", "no_show", "birthday", "winback"];
export const AUDIENCE_TYPES = ["all", "active", "at_risk", "inactive", "tag"];
export const CHANNELS = ["push", "inapp", "whatsapp", "sms", "email"];
// Which triggers the scheduler runs automatically today (others are send-now).
export const SCHEDULED_TRIGGERS = ["expiring_credit"];

const rulesCol = (bizId) => collection(db, "businesses", bizId, "automations");

export async function listRules(bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(rulesCol(bizId));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("listRules failed:", e?.message || e);
    return [];
  }
}

export async function getRule(id, bizId = getMyBizId()) {
  if (!bizId || !id) return null;
  const snap = await getDoc(doc(db, "businesses", bizId, "automations", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createRule(data, bizId = getMyBizId()) {
  const payload = {
    trigger: data.trigger || "welcome",
    params: data.params || {},
    audience: data.audience || { type: "all" },
    message: (data.message || "").trim(),
    channels: Array.isArray(data.channels) && data.channels.length ? data.channels : ["push", "inapp"],
    active: data.active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const r = await addDoc(rulesCol(bizId), payload);
  return { id: r.id, ...payload };
}

export async function updateRule(id, patch, bizId = getMyBizId()) {
  await updateDoc(doc(db, "businesses", bizId, "automations", id), { ...patch, updatedAt: serverTimestamp() });
}
export async function deleteRule(id, bizId = getMyBizId()) {
  await deleteDoc(doc(db, "businesses", bizId, "automations", id));
}

/** Send a message to an audience now (server routes + logs). */
export async function sendNow({ message, audience, channels, ruleId }, bizId = getMyBizId()) {
  const fn = httpsCallable(getFunctions(), "sendBusinessMessage");
  const res = await fn({ bizId, message, audience, channels, ruleId });
  return res.data || { sent: 0, skipped: 0, total: 0 };
}

/** Recent delivery log. */
export async function listMessages(bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(query(collection(db, "businesses", bizId, "messages"), orderBy("ts", "desc"), limit(50)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("listMessages failed:", e?.message || e);
    return [];
  }
}
