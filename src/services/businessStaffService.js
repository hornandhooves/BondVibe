/**
 * businessStaffService — staff roles (kinlo_business/01 §7). Invite staff by
 * email (server resolves the account + grants a scoped role); list and remove.
 * Roles: owner (all) · instructor · reception (check-in only, no finance —
 * enforced in Firestore rules).
 */
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, where,
  writeBatch, serverTimestamp,
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

/**
 * Request an ownership transfer to a validated host (BUG 32.4). Server verifies
 * the caller is the owner and the recipient is a host. Returns { ok, transferId? }.
 */
export async function requestOwnerTransfer(toUid, bizId = getMyBizId()) {
  try {
    const fn = httpsCallable(getFunctions(), "requestOwnerTransfer");
    const res = await fn({ bizId, toUid });
    return { ok: true, ...(res.data || {}) };
  } catch (e) {
    const code = e?.code || "";
    let error = "failed";
    if (code.includes("failed-precondition")) error = "not_host";
    else if (code.includes("already-exists")) error = "pending";
    else if (code.includes("permission-denied")) error = "not_owner";
    return { ok: false, error };
  }
}

/** Admin: approve or reject an ownership transfer (BUG 32.4). */
export async function approveOwnerTransfer(transferId, approve) {
  try {
    const fn = httpsCallable(getFunctions(), "approveOwnerTransfer");
    const res = await fn({ transferId, approve: !!approve });
    return { ok: true, ...(res.data || {}) };
  } catch (e) {
    return { ok: false };
  }
}

export async function updateStaffRole(staffUid, role, bizId = getMyBizId()) {
  if (!bizId || !staffUid) return;
  await updateDoc(doc(db, "businesses", bizId, "staff", staffUid), { role });
}

/**
 * Set a staff member's display name (BUG 32.3, owner action). Falls in front of
 * the account fullName/email so the owner can label any row — including their own.
 */
export async function setStaffName(staffUid, displayName, bizId = getMyBizId()) {
  if (!bizId || !staffUid) return;
  await updateDoc(doc(db, "businesses", bizId, "staff", staffUid), {
    displayName: (displayName || "").trim(),
  });
}

/** The best display name for a staff record (BUG 32.3 fallback chain). */
export function staffDisplayName(s, fallback = "Staff member") {
  return (
    (s && (s.displayName || s.name || s.fullName || s.email)) || fallback
  );
}

export async function removeStaff(staffUid, bizId = getMyBizId()) {
  if (!bizId || !staffUid) return;
  await deleteDoc(doc(db, "businesses", bizId, "staff", staffUid));
}

// ── Placeholder staff (KIN-190) ──────────────────────────────────────────────
// A staff doc's ID is normally the member's real Firebase Auth uid, because the
// rules read it as an exact path (staff/{request.auth.uid}), not as a query. A
// placeholder deliberately breaks that: it has a GENERATED id and no `uid`
// field, so it can name a real person who has no account yet without ever
// looking like an authenticated member. It can be pointed at by an event
// (instructorUid is an opaque string to getInstructorEventsOnDate, so Agenda
// conflict detection works on placeholders too) but it can never authenticate
// or be granted anything.
//
// Same id shape as branchId() in businessService.js — one generator pattern in
// this codebase, not two.
const placeholderStaffId = () => `st_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Create a named placeholder for someone who isn't in the app yet.
 * @param {string} name
 * @param {string} [role]
 * @param {string} [bizId]
 * @returns {Promise<{id:string,name:string,role:string}|null>} null without a bizId
 */
export async function addPlaceholderStaff(name, role = "instructor", bizId = getMyBizId()) {
  if (!bizId) return null;
  const clean = (name || "").trim();
  if (!clean) return null;
  const id = placeholderStaffId();
  // No `uid` field at all — its absence is what marks this doc unauthenticatable.
  await setDoc(doc(db, "businesses", bizId, "staff", id), {
    name: clean,
    role,
    claimed: false,
    createdAt: serverTimestamp(),
  });
  return { id, name: clean, role };
}

/**
 * Replace a placeholder with a real staff doc once the person has an account.
 *
 * The placeholder is NOT annotated in place: every business rule keys off the
 * staff doc's ID being the acting user's real uid, so the record has to be
 * re-created at staff/{realUid} and the placeholder dropped. Both writes go in
 * ONE batch — a half-applied claim would leave either a duplicate (person
 * listed twice) or an orphan (event pointing at a deleted placeholder).
 *
 * @param {string} placeholderId
 * @param {string} realUid
 * @param {string} [role] explicit role for the real doc; falls back to the
 *   placeholder's. Passed by the caller because claiming someone who is
 *   ALREADY staff here must not silently change the role they were given.
 * @param {string} [bizId]
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function claimPlaceholderStaff(placeholderId, realUid, role = null, bizId = getMyBizId()) {
  if (!bizId || !placeholderId || !realUid) return { ok: false, error: "missing_args" };
  const phRef = doc(db, "businesses", bizId, "staff", placeholderId);
  const snap = await getDoc(phRef);
  if (!snap.exists()) return { ok: false, error: "not_found" };

  // claimed/createdAt describe the PLACEHOLDER's lifecycle, not the person's —
  // they're replaced below rather than carried over.
  const { claimed, createdAt, role: placeholderRole, ...carried } = snap.data();
  const batch = writeBatch(db);
  // merge:true so claiming someone who is ALREADY staff here adds the carried
  // fields instead of wiping what they already have (working hours, etc.).
  batch.set(
    doc(db, "businesses", bizId, "staff", realUid),
    { ...carried, role: role || placeholderRole, uid: realUid, claimed: true, claimedAt: serverTimestamp() },
    { merge: true },
  );
  batch.delete(phRef);
  await batch.commit();
  return { ok: true };
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
