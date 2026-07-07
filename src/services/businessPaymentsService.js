/**
 * businessPaymentsService — Finance (kinlo_business/01 §6). Manual-first: record
 * cash/transfer/online payments by hand; app/online flows populate the SAME
 * ledger later. Revenue by method, per-member history, receipts, and a light
 * manual outstanding-balance (member.balanceOwedCents) the host controls.
 *
 * Data: businesses/{bizId}/payments/{paymentId}
 *   memberId?, memberName, amountCents, method, note?, packageId?, date(ISO)
 */
import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db } from "./firebase";
import { getMyBizId } from "./businessService";
import { listMembers, memberRefFor } from "./businessMembersService";
import { formatCentavos } from "../utils/pricing";

export const PAYMENT_METHODS = ["cash", "transfer", "stripe", "mercadopago", "other"];

const paymentsCol = (bizId) => collection(db, "businesses", bizId, "payments");

export async function createPayment(data = {}, bizId = getMyBizId()) {
  if (!bizId) throw new Error("no_business");
  const payload = {
    memberId: data.memberId || null,
    memberName: data.memberName || "",
    amountCents: Math.max(0, Math.round((parseFloat(data.amount) || 0) * 100)),
    method: PAYMENT_METHODS.includes(data.method) ? data.method : "cash",
    note: (data.note || "").trim() || null,
    packageId: data.packageId || null,
    date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(paymentsCol(bizId), payload);
  // Optionally reduce the member's outstanding balance.
  if (data.applyToBalance && data.memberId && payload.amountCents > 0) {
    try {
      await updateDoc(memberRefFor(bizId, data.memberId), {
        balanceOwedCents: increment(-payload.amountCents),
      });
    } catch (e) {
      /* best-effort */
    }
  }
  return { id: ref.id, ...payload };
}

export async function listPaymentsInRange(fromIso, toIso, bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(
      query(paymentsCol(bizId), where("date", ">=", fromIso), where("date", "<=", toIso), orderBy("date", "desc"))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("listPaymentsInRange failed:", e?.message || e);
    return [];
  }
}

export async function listMemberPayments(memberId, bizId = getMyBizId()) {
  if (!bizId || !memberId) return [];
  try {
    const snap = await getDocs(query(paymentsCol(bizId), where("memberId", "==", memberId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (e) {
    console.error("listMemberPayments failed:", e?.message || e);
    return [];
  }
}

/** Sum revenue for a set of payments, and a breakdown per method. */
export function revenueSummary(payments) {
  const byMethod = {};
  let total = 0;
  for (const p of payments) {
    const c = p.amountCents || 0;
    total += c;
    byMethod[p.method] = (byMethod[p.method] || 0) + c;
  }
  return { total, byMethod };
}

/** Members with a manual outstanding balance the host has set. */
export async function listOutstanding(bizId = getMyBizId()) {
  const members = await listMembers({}, bizId);
  return members
    .filter((m) => (m.balanceOwedCents || 0) > 0)
    .sort((a, b) => (b.balanceOwedCents || 0) - (a.balanceOwedCents || 0));
}

/** A shareable plain-text receipt for one payment. */
export function receiptText(payment, businessName, methodLabel) {
  const lines = [
    businessName || "Kinlo",
    "————————————",
    payment.memberName || "",
    `${formatCentavos(payment.amountCents)} · ${methodLabel}`,
    new Date(payment.date).toLocaleString(),
  ];
  if (payment.note) lines.push(payment.note);
  return lines.filter(Boolean).join("\n");
}
