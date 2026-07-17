/**
 * CRUD for the unified `plans` (businesses/{bizId}/plans).
 *
 * Deliberately mirrors businessPackagesService's shape and helpers — this is the
 * same product with the sales channel as a field, so it should read the same. The
 * credits/attendance/expiry runtime still lives there and is NOT duplicated here:
 * assigning or buying a plan produces the same activePackage it always did.
 */
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { getMyBizId } from "./businessService";
import {
  PLAN_KIND,
  PLAN_KINDS,
  MEMBERSHIP_AUDIENCE,
  sanitizePaymentModes,
  sanitizeLoyaltyReward,
  isSellableOnline,
  isAssignableManually,
} from "../constants/plans";

const plansCol = (bizId) => collection(db, "businesses", bizId, "plans");
const planRef = (bizId, id) => doc(db, "businesses", bizId, "plans", id);

/**
 * Coerce form input into a document Firestore will accept.
 *
 * Every optional field resolves to null rather than being left off: Firestore
 * rejects undefined outright, and a half-built plan from a partially-filled form
 * is the normal case, not the exception.
 */
function toDoc(data) {
  const unlimited = data.unlimited === true;
  const credits = unlimited ? null : Math.max(1, parseInt(data.credits, 10) || 1);
  const validityDays = Math.max(1, parseInt(data.validityDays, 10) || 1);
  const priceCents = Math.max(0, parseInt(data.priceCents, 10) || 0);

  return {
    name: (data.name || "").trim(),
    kind: PLAN_KINDS.includes(data.kind) ? data.kind : PLAN_KIND.CLASS,
    unlimited,
    credits,
    validityDays,
    priceCents,
    audienceTier: [
      MEMBERSHIP_AUDIENCE.LOCAL,
      MEMBERSHIP_AUDIENCE.GENERAL,
      MEMBERSHIP_AUDIENCE.BOTH,
    ].includes(data.audienceTier)
      ? data.audienceTier
      : MEMBERSHIP_AUDIENCE.BOTH,
    description: (data.description || "").trim(),
    terms: (data.terms || "").trim(),
    // The rules validate this too — a client is not where a contract lives.
    paymentModes: sanitizePaymentModes(data.paymentModes),
    loyaltyReward: sanitizeLoyaltyReward(data.loyaltyReward),
    active: data.active !== false,
  };
}

/**
 * @param {{activeOnly?: boolean}} [opts]
 * @returns {Promise<object[]>}
 */
export async function listPlans({ activeOnly = false } = {}, bizId = getMyBizId()) {
  if (!bizId) return [];
  const snap = await getDocs(plansCol(bizId));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return activeOnly ? rows.filter((p) => p.active !== false) : rows;
}

/**
 * The plans a member can buy for themselves, for a given business.
 *
 * Filters on paymentModes rather than trusting the caller: a manual-only plan is
 * the host's to hand out, and listing it with a Buy button would sell something
 * that has no online price path.
 *
 * @param {string} bizId
 * @returns {Promise<object[]>}
 */
export async function listOnlinePlans(bizId) {
  if (!bizId) return [];
  const snap = await getDocs(query(plansCol(bizId), where("active", "==", true)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(isSellableOnline);
}

/**
 * The plans a host can assign by hand. Kinlo Pro — but this is only the list;
 * the entitlement is enforced server-side where the write happens.
 * @returns {Promise<object[]>}
 */
export async function listManualPlans(bizId = getMyBizId()) {
  if (!bizId) return [];
  const rows = await listPlans({ activeOnly: true }, bizId);
  return rows.filter(isAssignableManually);
}

export async function getPlan(planId, bizId = getMyBizId()) {
  if (!bizId || !planId) return null;
  const snap = await getDoc(planRef(bizId, planId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createPlan(data = {}, bizId = getMyBizId()) {
  if (!bizId) throw new Error("no_business");
  const now = new Date().toISOString();
  const ref = await addDoc(plansCol(bizId), { ...toDoc(data), createdAt: now, updatedAt: now });
  return ref.id;
}

export async function updatePlan(planId, patch = {}, bizId = getMyBizId()) {
  if (!bizId || !planId) throw new Error("no_business");
  await updateDoc(planRef(bizId, planId), {
    ...toDoc(patch),
    updatedAt: new Date().toISOString(),
  });
}

export async function deletePlan(planId, bizId = getMyBizId()) {
  if (!bizId || !planId) throw new Error("no_business");
  await deleteDoc(planRef(bizId, planId));
}

export { isSellableOnline, isAssignableManually };
