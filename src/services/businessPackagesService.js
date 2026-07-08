/**
 * businessPackagesService — packages/products & member credits
 * (kinlo_business/01 §3). Manual-first: the host assigns a package to a member
 * and can adjust credits by hand (+/-) with a reason. QR / booking check-ins
 * auto-deduct through businessAttendanceService, hitting the SAME balance.
 *
 * Every package is credit-based (kinlo_business/05 §G): a fixed credit count +
 * a required expiry, with an audienceTier (local/general/both) enforced at
 * assignment. No "unlimited".
 *
 * Data:
 *   businesses/{bizId}/packages/{packageId}  name, kind:'event'|'class'|'session',
 *                                            credits(int>0), priceCents,
 *                                            validityDays(required), audienceTier,
 *                                            active, createdAt
 * A member's current grant lives ON the member record (one active package in
 * v1): member.activePackage {packageId,name,kind,creditsTotal,creditsRemaining,
 * expiresAt,audienceTier,assignedAt} · member.creditBalance mirrors
 * creditsRemaining for quick display · member.creditLog [{delta,reason,at}].
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
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { getMyBizId } from "./businessService";
import { memberRefFor } from "./businessMembersService";
import { MEMBERSHIP_AUDIENCE, audienceAllows } from "../utils/membershipUtils";

export const PACKAGE_KIND = { EVENT: "event", CLASS: "class", SESSION: "session" };

const packagesCol = (bizId) => collection(db, "businesses", bizId, "packages");
const packageRef = (bizId, id) => doc(db, "businesses", bizId, "packages", id);

export async function listPackages({ activeOnly = false } = {}, bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(query(packagesCol(bizId), orderBy("createdAt", "desc")));
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (activeOnly) rows = rows.filter((p) => p.active !== false);
    return rows;
  } catch (e) {
    console.error("listPackages failed:", e?.message || e);
    return [];
  }
}

export async function getPackage(packageId, bizId = getMyBizId()) {
  if (!bizId || !packageId) return null;
  const snap = await getDoc(packageRef(bizId, packageId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createPackage(data = {}, bizId = getMyBizId()) {
  if (!bizId) throw new Error("no_business");
  const credits = Math.max(1, parseInt(data.credits, 10) || 0);
  const validityDays = Math.max(1, parseInt(data.validityDays, 10) || 0);
  const audienceTier = [
    MEMBERSHIP_AUDIENCE.LOCAL,
    MEMBERSHIP_AUDIENCE.GENERAL,
    MEMBERSHIP_AUDIENCE.BOTH,
  ].includes(data.audienceTier)
    ? data.audienceTier
    : MEMBERSHIP_AUDIENCE.BOTH;
  const kind = [PACKAGE_KIND.EVENT, PACKAGE_KIND.CLASS, PACKAGE_KIND.SESSION].includes(data.kind)
    ? data.kind
    : PACKAGE_KIND.CLASS;
  const payload = {
    name: (data.name || "").trim(),
    kind,
    credits, // always a finite count (>0); no unlimited
    priceCents: Math.max(0, Math.round((parseFloat(data.price) || 0) * 100)),
    validityDays, // required (>0)
    audienceTier,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(packagesCol(bizId), payload);
  return { id: ref.id, ...payload };
}

export async function updatePackage(packageId, patch = {}, bizId = getMyBizId()) {
  if (!bizId || !packageId) return;
  const clean = { ...patch, updatedAt: serverTimestamp() };
  if (clean.price != null) {
    clean.priceCents = Math.max(0, Math.round((parseFloat(clean.price) || 0) * 100));
    delete clean.price;
  }
  await updateDoc(packageRef(bizId, packageId), clean);
}

export async function deletePackage(packageId, bizId = getMyBizId()) {
  if (!bizId || !packageId) return;
  await deleteDoc(packageRef(bizId, packageId));
}

const addDays = (days) => {
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

/** Whether a member's active package has lapsed (expiry passed). */
export const isPackageExpired = (pkg) =>
  !!(pkg && pkg.expiresAt && new Date(pkg.expiresAt).getTime() < Date.now());

/**
 * Assign a package to a member (host action). Sets the member's active package,
 * credit balance and expiry; logs the grant.
 */
export async function assignPackage(memberId, packageId, bizId = getMyBizId()) {
  if (!bizId || !memberId || !packageId) return;
  const pkg = await getPackage(packageId, bizId);
  if (!pkg) throw new Error("package_not_found");
  const existing = await getMemberDoc(memberId, bizId);
  // Audience scope (kinlo_business/05 §G): a local-only package can't go to a
  // general member, and vice-versa.
  if (!audienceAllows(pkg.audienceTier, existing?.pricingTier)) {
    throw new Error("audience_mismatch");
  }
  const credits = pkg.credits || 0;
  const activePackage = {
    packageId: pkg.id,
    name: pkg.name,
    kind: pkg.kind,
    creditsTotal: credits,
    creditsRemaining: credits,
    expiresAt: addDays(pkg.validityDays),
    audienceTier: pkg.audienceTier || MEMBERSHIP_AUDIENCE.BOTH,
    assignedAt: new Date().toISOString(),
  };
  const log = Array.isArray(existing?.creditLog) ? existing.creditLog : [];
  await updateDoc(memberRefFor(bizId, memberId), {
    activePackage,
    creditBalance: credits,
    creditLog: [{ delta: credits, reason: `assign:${pkg.name}`, at: new Date().toISOString() }, ...log].slice(0, 30),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Manually adjust a member's credits (+/-) with a reason (host action).
 * Clamped at 0. Keeps activePackage.creditsRemaining in sync.
 */
export async function adjustCredits(member, delta, reason, bizId = getMyBizId()) {
  if (!bizId || !member?.id || !delta) return;
  const current = typeof member.creditBalance === "number" ? member.creditBalance : 0;
  const next = Math.max(0, current + delta);
  const log = Array.isArray(member.creditLog) ? member.creditLog : [];
  const patch = {
    creditBalance: next,
    creditLog: [{ delta, reason: reason || "manual", at: new Date().toISOString() }, ...log].slice(0, 30),
    updatedAt: serverTimestamp(),
  };
  if (member.activePackage) {
    patch.activePackage = { ...member.activePackage, creditsRemaining: next };
  }
  await updateDoc(memberRefFor(bizId, member.id), patch);
  return next;
}

async function getMemberDoc(memberId, bizId) {
  const snap = await getDoc(memberRefFor(bizId, memberId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
