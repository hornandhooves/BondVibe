/**
 * businessAttendanceService — attendance ledger (kinlo_business/01 §4).
 * Mark a member present by hand ("mark present" for non-app clients) or via a
 * QR scan of their business pass. A credit auto-deducts on check-in when the
 * member holds a package with credits left (audience-matched). Source flag qr|manual.
 *
 * Data: businesses/{bizId}/attendance/{recordId}
 *   memberId, memberName, classTitle?, date(ISO), source:'qr'|'manual',
 *   creditDeducted, createdAt
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
import { getMember } from "./businessMembersService";
import { adjustCredits, isPackageExpired } from "./businessPackagesService";
import { audienceAllows } from "../utils/membershipUtils";

export const ATTENDANCE_SOURCE = { QR: "qr", MANUAL: "manual" };

const attendanceCol = (bizId) => collection(db, "businesses", bizId, "attendance");

/**
 * Record attendance for a member and auto-deduct one credit when applicable.
 * @param {object} member the member record (must include id)
 * @param {{source?:string, classTitle?:string}} opts
 * @returns {Promise<{creditDeducted:boolean, remaining:number|null}>}
 */
export async function markPresent(member, opts = {}, bizId = getMyBizId()) {
  if (!bizId || !member?.id) throw new Error("bad_args");
  const source = opts.source === ATTENDANCE_SOURCE.QR ? ATTENDANCE_SOURCE.QR : ATTENDANCE_SOURCE.MANUAL;

  const pkg = member.activePackage;
  // Credit-based only; a local-only credit can't be used by a general member.
  const audienceOk = !pkg || audienceAllows(pkg.audienceTier, member.pricingTier);
  const hasCredits =
    pkg && audienceOk && !isPackageExpired(pkg) && (member.creditBalance || 0) > 0;

  await addDoc(attendanceCol(bizId), {
    memberId: member.id,
    memberName: member.name || "",
    classTitle: (opts.classTitle || "").trim() || null,
    date: new Date().toISOString(),
    source,
    creditDeducted: !!hasCredits,
    createdAt: serverTimestamp(),
  });

  let remaining = pkg ? member.creditBalance || 0 : null;
  if (hasCredits) {
    remaining = await adjustCredits(member, -1, "attendance", bizId);
  }
  // The member has a package but nothing could be deducted (expired, out of
  // credits, or audience mismatch): flag it so the host can renew / charge.
  const noCredit = !!pkg && !hasCredits;
  return { creditDeducted: !!hasCredits, remaining, noCredit };
}

/**
 * Check in from a scanned business pass (`bizpass:{bizId}:{memberId}`).
 * Validates the pass belongs to THIS host's business.
 * @returns {Promise<{success:boolean, name?:string, error?:string, creditDeducted?:boolean, remaining?:number|null}>}
 */
export async function checkInFromBusinessScan(raw, bizId = getMyBizId()) {
  const parts = (raw || "").trim().split(":");
  if (parts.length !== 3 || parts[0] !== "bizpass") {
    return { success: false, error: "not_a_pass" };
  }
  if (parts[1] !== bizId) return { success: false, error: "wrong_business" };
  const member = await getMember(parts[2], bizId);
  if (!member) return { success: false, error: "not_found" };
  const res = await markPresent(member, { source: ATTENDANCE_SOURCE.QR }, bizId);
  return { success: true, name: member.name || "", ...res };
}

/**
 * All attendance in a date window (for analytics). ISO date strings sort
 * lexicographically, so a range query on the single `date` field needs no
 * composite index.
 * @param {string} fromIso @param {string} toIso
 */
export async function listAttendanceInRange(fromIso, toIso, bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(
      query(
        attendanceCol(bizId),
        where("date", ">=", fromIso),
        where("date", "<=", toIso),
        orderBy("date", "asc")
      )
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("listAttendanceInRange failed:", e?.message || e);
    return [];
  }
}

/**
 * A member's attendance history (newest first). Queries by memberId only (auto
 * single-field index) and sorts client-side — no composite index needed.
 */
export async function listMemberAttendance(memberId, bizId = getMyBizId()) {
  if (!bizId || !memberId) return [];
  try {
    const snap = await getDocs(query(attendanceCol(bizId), where("memberId", "==", memberId)));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (e) {
    console.error("listMemberAttendance failed:", e?.message || e);
    return [];
  }
}
