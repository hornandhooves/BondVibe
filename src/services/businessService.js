/**
 * businessService — Kinlo for Business (host ERP/CRM) root data layer.
 * (kinlo_business/01_ERP_CORE.md · additive, Pro-gated, all-vertical.)
 *
 * v1: one business per host owner, so `bizId === ownerUid` (deterministic,
 * trivial rules, no lookup). Multi-owner/transfer is future work and this
 * layout doesn't preclude it. The whole module lives under
 * `businesses/{bizId}/…` subcollections, isolated from existing collections.
 */
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { DEFAULT_VERTICAL, VERTICAL_IDS } from "../constants/businessVerticals";

export { VERTICAL_IDS, DEFAULT_VERTICAL };

/** The current host's business id. v1: one business per owner → bizId = uid. */
export const getMyBizId = () => auth.currentUser?.uid || null;

const bizRef = (bizId) => doc(db, "businesses", bizId);

/**
 * Load the current host's business, or null if not set up yet.
 * @returns {Promise<object|null>}
 */
export async function getBusiness(bizId = getMyBizId()) {
  if (!bizId) return null;
  try {
    const snap = await getDoc(bizRef(bizId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.error("getBusiness failed:", e?.message || e);
    return null;
  }
}

/** True if the host has already created their business. */
export async function hasBusiness(bizId = getMyBizId()) {
  return (await getBusiness(bizId)) != null;
}

/**
 * Create the business on first setup (idempotent). Also writes the owner's
 * staff record so Firestore rules recognize them immediately.
 * @param {{name:string, vertical:string}} args
 * @returns {Promise<object|null>} the business doc
 */
export async function createBusiness({ name, vertical }) {
  const uid = getMyBizId();
  if (!uid) return null;
  const v = VERTICAL_IDS.includes(vertical) ? vertical : DEFAULT_VERTICAL;
  const existing = await getBusiness(uid);
  if (existing) return existing;

  await setDoc(bizRef(uid), {
    ownerUid: uid,
    name: (name || "").trim() || "My business",
    vertical: v,
    branches: [],
    settings: {},
    memberCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Owner staff record (role 'owner' = full permissions). Rules key off this.
  await setDoc(doc(db, "businesses", uid, "staff", uid), {
    uid,
    role: "owner",
    branchIds: [],
    createdAt: serverTimestamp(),
  });
  return await getBusiness(uid);
}

/**
 * Patch the business (name / vertical / settings / branches). Merge-safe.
 * @param {object} patch
 */
export async function updateBusiness(patch = {}) {
  const uid = getMyBizId();
  if (!uid) return;
  const clean = { ...patch };
  if (clean.vertical && !VERTICAL_IDS.includes(clean.vertical)) {
    clean.vertical = DEFAULT_VERTICAL;
  }
  await updateDoc(bizRef(uid), { ...clean, updatedAt: serverTimestamp() });
}

// ── Branches (multi-branch, kinlo_business/01 §7) ─────────────────────────────
const branchId = () => `br_${Math.random().toString(36).slice(2, 8)}`;

export async function listBranches() {
  const biz = await getBusiness();
  return Array.isArray(biz?.branches) ? biz.branches : [];
}

export async function addBranch({ name, address }) {
  const branches = await listBranches();
  const branch = { id: branchId(), name: (name || "").trim(), address: (address || "").trim() || null };
  await updateBusiness({ branches: [...branches, branch] });
  return branch;
}

export async function updateBranch(id, patch) {
  const branches = await listBranches();
  await updateBusiness({ branches: branches.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
}

export async function removeBranch(id) {
  const branches = await listBranches();
  await updateBusiness({ branches: branches.filter((b) => b.id !== id) });
}
