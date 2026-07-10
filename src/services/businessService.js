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
import { DEFAULT_ROLES } from "../constants/businessRoles";

export { VERTICAL_IDS, DEFAULT_VERTICAL };

// BUG 32.2 — active-business context. A staff member's data lives under the
// OWNER's business, not their own uid, so `getMyBizId()` can no longer be the
// signed-in uid. BusinessContext sets this module-level active bizId on mount
// and on switch; every `bizId = getMyBizId()` default then targets the active
// business with no per-call change. Falls back to the user's own uid (their own
// business, or a not-yet-created one) when nothing is active.
let activeBizId = null;
export const setActiveBizId = (id) => { activeBizId = id || null; };
export const getActiveBizId = () => activeBizId;

/** The active business id (own business by default; a staff member's owner biz). */
export const getMyBizId = () => activeBizId || auth.currentUser?.uid || null;

/** This user's own business id (always their uid) — independent of active biz. */
export const getOwnBizId = () => auth.currentUser?.uid || null;

/**
 * The owner uid of the active business (BUG 32.6) — who should be paid for
 * things created in the current business context. null when there's no active
 * business (a casual host), so callers fall back to the creator. Reads the
 * business doc's ownerUid (source of truth, survives a transfer).
 * @returns {Promise<string|null>}
 */
export async function getActiveOwnerUid() {
  const bizId = activeBizId;
  if (!bizId) return null;
  const biz = await getBusiness(bizId);
  return biz?.ownerUid || bizId;
}

/**
 * The user's staff memberships (BUG 32.2) from `users/{uid}.staffOf`, an array
 * of `{ bizId, role }`. Written server-side when an invite is accepted (32.1).
 * @returns {Promise<Array<{bizId:string, role:string}>>}
 */
export async function getStaffMemberships(uid = auth.currentUser?.uid) {
  if (!uid) return [];
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const arr = snap.exists() ? snap.data().staffOf : null;
    return Array.isArray(arr) ? arr.filter((m) => m && m.bizId) : [];
  } catch (e) {
    return [];
  }
}

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
  // Always create under the user's OWN uid — never the active (staff) business.
  const uid = getOwnBizId();
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
  // Seed the default roles + permission matrix (kinlo_business/07 FIX 4).
  await Promise.all(
    DEFAULT_ROLES.map((r) => {
      const { id, ...data } = r;
      return setDoc(doc(db, "businesses", uid, "roles", id), data);
    })
  );
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
