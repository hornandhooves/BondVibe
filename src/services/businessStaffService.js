/**
 * businessStaffService — staff roles (kinlo_business/01 §7). Invite staff by
 * email (server resolves the account + grants a scoped role); list and remove.
 * Roles: owner (all) · instructor · reception (check-in only, no finance —
 * enforced in Firestore rules).
 */
import { collection, doc, getDocs, deleteDoc, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebase";
import { getMyBizId } from "./businessService";

export const STAFF_ROLES = ["owner", "instructor", "reception"];

export async function listStaff(bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(collection(db, "businesses", bizId, "staff"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("listStaff failed:", e?.message || e);
    return [];
  }
}

/**
 * Invite a staff member by email. Server-side (needs an auth lookup the client
 * can't do). Returns { ok, name?, error? }.
 */
export async function inviteStaff(email, role) {
  try {
    const fn = httpsCallable(getFunctions(), "inviteBusinessStaff");
    const res = await fn({ email: (email || "").trim(), role });
    return { ok: true, ...(res.data || {}) };
  } catch (e) {
    const code = e?.code || "";
    let error = "failed";
    if (code.includes("not-found")) error = "not_found";
    else if (code.includes("already-exists")) error = "self";
    return { ok: false, error };
  }
}

export async function updateStaffRole(staffUid, role, bizId = getMyBizId()) {
  if (!bizId || !staffUid) return;
  await updateDoc(doc(db, "businesses", bizId, "staff", staffUid), { role });
}

export async function removeStaff(staffUid, bizId = getMyBizId()) {
  if (!bizId || !staffUid) return;
  await deleteDoc(doc(db, "businesses", bizId, "staff", staffUid));
}
