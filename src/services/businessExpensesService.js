/**
 * businessExpensesService — the missing half of Finance (dashboard handoff §8).
 * Mirrors businessPaymentsService: record business expenses by hand so the host
 * can finally drop Excel. Net P&L = revenue (payments) − expenses over a range.
 *
 * Data: businesses/{bizId}/expenses/{expenseId}
 *   amountCents, category, method, note?, receiptUrl?, date(ISO), createdAt
 */
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { getMyBizId } from "./businessService";
import { PAYMENT_METHODS } from "./businessPaymentsService";

export const EXPENSE_CATEGORIES = [
  "rent",
  "staff",
  "marketing",
  "supplies",
  "utilities",
  "other",
];

const expensesCol = (bizId) => collection(db, "businesses", bizId, "expenses");

export async function createExpense(data = {}, bizId = getMyBizId()) {
  if (!bizId) throw new Error("no_business");
  const payload = {
    amountCents: Math.max(0, Math.round((parseFloat(data.amount) || 0) * 100)),
    category: EXPENSE_CATEGORIES.includes(data.category) ? data.category : "other",
    method: PAYMENT_METHODS.includes(data.method) ? data.method : "cash",
    note: (data.note || "").trim() || null,
    receiptUrl: data.receiptUrl || null,
    date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(expensesCol(bizId), payload);
  return { id: ref.id, ...payload };
}

export async function listExpensesInRange(fromIso, toIso, bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(
      query(expensesCol(bizId), where("date", ">=", fromIso), where("date", "<=", toIso), orderBy("date", "desc")),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("listExpensesInRange failed:", e?.message || e);
    return [];
  }
}

/** Total expenses + breakdown by category and by method. */
export function expenseSummary(expenses) {
  const byCategory = {};
  const byMethod = {};
  let total = 0;
  for (const x of expenses) {
    const c = x.amountCents || 0;
    total += c;
    byCategory[x.category] = (byCategory[x.category] || 0) + c;
    byMethod[x.method] = (byMethod[x.method] || 0) + c;
  }
  return { total, byCategory, byMethod };
}

/**
 * Profit / loss for a range. revenueCents from revenueSummary(payments).total.
 * @returns {{ revenue:number, expenses:number, net:number, marginPct:number|null }}
 */
export function profitLoss(revenueCents, expenseCents) {
  const revenue = revenueCents || 0;
  const expenses = expenseCents || 0;
  const net = revenue - expenses;
  const marginPct = revenue > 0 ? Math.round((net / revenue) * 100) : null;
  return { revenue, expenses, net, marginPct };
}
