/**
 * businessStaffService — staff roles (kinlo_business/01 §7). Invite staff by
 * email (server resolves the account + grants a scoped role); list and remove.
 * Roles: owner (all) · instructor · reception (check-in only, no finance —
 * enforced in Firestore rules).
 */
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { getMyBizId } from "./businessService";
import { DEFAULT_ROLES, roleAllows } from "../constants/businessRoles";

export const STAFF_ROLES = ["owner", "instructor", "reception"];

// Weekly working hours frame the Agenda's default visible range
// (kinlo_business/06 FIX 4). days: 0=Sun … 6=Sat.
export const DEFAULT_WORKING_HOURS = { days: [1, 2, 3, 4, 5, 6], start: "07:00", end: "20:00" };

/** Valid 24-hour HH:MM (00–23 : 00–59), single or double-digit hour. */
export const isValidHM = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t || "").trim());

/** A staff member's working hours, falling back to the sensible default. */
export function getWorkingHours(staff) {
  const wh = staff?.workingHours;
  if (!wh || !wh.start || !wh.end) return DEFAULT_WORKING_HOURS;
  return {
    days: Array.isArray(wh.days) ? wh.days : DEFAULT_WORKING_HOURS.days,
    start: wh.start,
    end: wh.end,
  };
}

/** Set a staff member's working hours (owner action). */
export async function setWorkingHours(staffUid, workingHours, bizId = getMyBizId()) {
  if (!bizId || !staffUid) return;
  await updateDoc(doc(db, "businesses", bizId, "staff", staffUid), { workingHours });
}

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

/**
 * Add a staff member by @handle (spec 10) — resolves an existing app user
 * server-side and adds them directly. Returns { ok, name?, uid?, error? }.
 */
export async function inviteStaffByHandle(handle, role) {
  try {
    const fn = httpsCallable(getFunctions(), "inviteBusinessStaff");
    const res = await fn({ handle: (handle || "").trim(), role });
    return { ok: true, ...(res.data || {}) };
  } catch (e) {
    const code = e?.code || "";
    let error = "failed";
    if (code.includes("not-found")) error = "not_found";
    else if (code.includes("already-exists")) error = "self";
    return { ok: false, error };
  }
}

/**
 * Respond to a staff invite (BUG 32.1). Accept → active + membership; decline →
 * removed. Server verifies the caller is the invitee. Returns { ok, status? }.
 */
export async function respondToStaffInvite(bizId, accept) {
  try {
    const fn = httpsCallable(getFunctions(), "respondToStaffInvite");
    const res = await fn({ bizId, accept: !!accept });
    return { ok: true, ...(res.data || {}) };
  } catch (e) {
    return { ok: false };
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

// ── Roles & permissions (kinlo_business/07 FIX 4) ────────────────────────────
const rolesCol = (bizId) => collection(db, "businesses", bizId, "roles");

/** List the business's roles, seeding the defaults on first read. */
export async function listRoles(bizId = getMyBizId()) {
  if (!bizId) return DEFAULT_ROLES;
  try {
    const snap = await getDocs(rolesCol(bizId));
    if (snap.empty) {
      await seedDefaultRoles(bizId);
      return DEFAULT_ROLES.map((r) => ({ ...r }));
    }
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return DEFAULT_ROLES.map((r) => ({ ...r }));
  }
}

/** Seed the four default roles (idempotent — only writes missing ones). */
export async function seedDefaultRoles(bizId = getMyBizId()) {
  if (!bizId) return;
  await Promise.all(
    DEFAULT_ROLES.map((r) => {
      const { id, ...data } = r;
      return setDoc(doc(rolesCol(bizId), id), data, { merge: true });
    })
  );
}

/** Rename a role and/or update its permission matrix (owner action). */
export async function saveRole(roleId, patch, bizId = getMyBizId()) {
  if (!bizId || !roleId) return;
  await updateDoc(doc(rolesCol(bizId), roleId), patch);
}

/** Add a custom role. */
export async function addRole({ name, perms }, bizId = getMyBizId()) {
  if (!bizId) return null;
  const payload = { name: (name || "").trim() || "New role", editableName: true, removable: true, perms: perms || {} };
  const ref = await addDoc(rolesCol(bizId), payload);
  return { id: ref.id, ...payload };
}

export async function removeRole(roleId, bizId = getMyBizId()) {
  if (!bizId || !roleId || roleId === "owner") return;
  await deleteDoc(doc(rolesCol(bizId), roleId));
}

/**
 * The current user's permission map for a business. Ownership is determined by
 * the staff role "owner" (BUG 32.2 — no longer the uid === bizId coincidence, so
 * it survives an ownership transfer). The owner gets every area (null = all); a
 * staff member gets their role's perms.
 */
export async function getMyRolePerms(bizId = getMyBizId()) {
  const uid = auth.currentUser?.uid;
  if (!uid || !bizId) return null;
  try {
    const staffSnap = await getDoc(doc(db, "businesses", bizId, "staff", uid));
    const roleId = staffSnap.exists() ? staffSnap.data().role : null;
    if (!roleId || roleId === "owner") return null; // owner → all allowed
    const roleSnap = await getDoc(doc(rolesCol(bizId), roleId));
    return roleSnap.exists() ? roleSnap.data().perms || null : null;
  } catch (e) {
    return null;
  }
}

/** The current user's staff role at a business ("owner" | role id | null). */
export async function getMyStaffRole(bizId = getMyBizId()) {
  const uid = auth.currentUser?.uid;
  if (!uid || !bizId) return null;
  try {
    const snap = await getDoc(doc(db, "businesses", bizId, "staff", uid));
    return snap.exists() ? snap.data().role || null : null;
  } catch (e) {
    return null;
  }
}

// ── Pending invites (auto-link on signup) ────────────────────────────────────
/** Pending invites this owner sent that haven't been claimed yet. */
export async function listStaffInvites(bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(
      query(collection(db, "staffInvites"), where("bizId", "==", bizId), where("status", "==", "pending"))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

/** Claim any pending invites for the signed-in user's email (call on login). */
export async function claimStaffInvites() {
  try {
    const fn = httpsCallable(getFunctions(), "claimStaffInvites");
    const res = await fn({});
    return { ok: true, ...(res.data || {}) };
  } catch (e) {
    return { ok: false, claimed: 0 };
  }
}

export { roleAllows };
