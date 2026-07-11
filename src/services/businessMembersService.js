/**
 * businessMembersService — the CRM core (kinlo_business/01 §1–2).
 * Manual-first: every member is creatable & editable by hand; app signups /
 * QR check-ins later auto-populate the SAME records. A cash/walk-in client with
 * no app account is a first-class member.
 *
 * Data: businesses/{bizId}/members/{memberId}
 *   name, phone?, email?, status, tags[], notes[], planId?, creditBalance,
 *   branchId?, inviteCode?, linkedUid?, redeemedAt?, qrPassId?,
 *   smsConsent:{granted,at,purpose,source}, source:'manual'|'csv'|'app', createdAt
 *
 * All reads/writes are staff-scoped by Firestore rules.
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
  where,
  orderBy,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { getMyBizId } from "./businessService";

/**
 * The signed-in user's pricing tier at a given host (kinlo_business/05 §A/C/G).
 * Reads their own linked member record under that business (allowed by rules on
 * linkedUid). Defaults 'general' when they're not a linked member.
 * @returns {Promise<'local'|'general'>}
 */
export async function getMyPricingTierForHost(hostId) {
  const uid = auth.currentUser?.uid;
  if (!uid || !hostId) return "general";
  try {
    const snap = await getDocs(
      query(collection(db, "businesses", hostId, "members"), where("linkedUid", "==", uid))
    );
    const m = snap.docs[0]?.data();
    return m?.pricingTier === "local" ? "local" : "general";
  } catch (e) {
    return "general";
  }
}

export const MEMBER_STATUS = {
  ACTIVE: "active",
  AT_RISK: "at_risk",
  INACTIVE: "inactive",
};

// Two-tier pricing (kinlo_business/05 §A): a member is charged the host's Local
// or General price. Default general; locals get the special rate at checkout.
export const PRICING_TIER = {
  LOCAL: "local",
  GENERAL: "general",
};

// Guest-code alphabet excludes ambiguous chars (0/O, 1/I/L) for read-aloud/SMS.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const membersCol = (bizId) => collection(db, "businesses", bizId, "members");
const memberRef = (bizId, id) => doc(db, "businesses", bizId, "members", id);

/** Public member doc ref (used by packages/attendance services). */
export const memberRefFor = (bizId, id) => doc(db, "businesses", bizId, "members", id);

/**
 * Generate a short, human-shareable guest code, e.g. "RITMO-7F3K".
 * Prefix derived from the business name; 4 random unambiguous chars.
 */
export function generateGuestCode(businessName = "") {
  const prefix =
    (businessName || "KINLO")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6) || "KINLO";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `${prefix}-${suffix}`;
}

/**
 * Build the SMS-consent record (LFPDPPP: explicit, timestamped, purposeful).
 * granted defaults to false — never assume consent.
 */
export function buildSmsConsent(granted, source = "enrollment") {
  return {
    granted: granted === true,
    at: granted === true ? new Date().toISOString() : null,
    purpose: "class_and_account_notifications",
    source,
  };
}

/** Whether we're allowed to SMS this member (Block 8 send-gate honors this). */
export const canSms = (member) =>
  !!(member && member.smsConsent && member.smsConsent.granted === true && member.phone);

/**
 * Birthday privacy (dashboard handoff §Birthdays, HARD rule): we store the full
 * DOB but NEVER expose the year or an age. These two exposers are the only
 * sanctioned read path — MM-DD for matching, a localized day+month for display.
 * UTC-pinned (consistent with the length-picker UTC fix) so "today" doesn't drift.
 */
export const birthdayMMDD = (member) => {
  if (!member?.dob) return null;
  const d = new Date(member.dob);
  if (!isFinite(d.getTime())) return null;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

export const birthdayLabel = (member, locale = "es-MX") => {
  if (!member?.dob) return null;
  const d = new Date(member.dob);
  if (!isFinite(d.getTime())) return null;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
};

/**
 * List members (newest first). Search / status / tag filtering is applied
 * client-side so no composite index is needed for typical member counts.
 * @param {{search?:string, status?:string, tag?:string}} opts
 */
export async function listMembers(opts = {}, bizId = getMyBizId()) {
  if (!bizId) return [];
  const { search = "", status = null, tag = null } = opts;
  try {
    const snap = await getDocs(query(membersCol(bizId), orderBy("createdAt", "desc")));
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (status) rows = rows.filter((m) => (m.status || MEMBER_STATUS.ACTIVE) === status);
    if (tag) rows = rows.filter((m) => Array.isArray(m.tags) && m.tags.includes(tag));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.phone || "").includes(q) ||
          (m.email || "").toLowerCase().includes(q)
      );
    }
    return rows;
  } catch (e) {
    console.error("listMembers failed:", e?.message || e);
    return [];
  }
}

/** Count active/at-risk/total for the filter chips. */
export function summarizeMembers(members) {
  const total = members.length;
  const active = members.filter((m) => (m.status || "active") === MEMBER_STATUS.ACTIVE).length;
  const atRisk = members.filter((m) => m.status === MEMBER_STATUS.AT_RISK).length;
  return { total, active, atRisk };
}

export async function getMember(memberId, bizId = getMyBizId()) {
  if (!bizId || !memberId) return null;
  const snap = await getDoc(memberRef(bizId, memberId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Create a member manually. Generates a guest code so the host can convert a
 * cash client into an app member later without duplicating the record.
 * @param {object} data { name, phone?, email?, tags?, notes?, status?, smsConsentGranted?, source? }
 */
export async function createMember(data = {}, businessName = "", bizId = getMyBizId()) {
  if (!bizId) throw new Error("no_business");
  const source = data.source || "manual";
  const payload = {
    name: (data.name || "").trim(),
    businessName: businessName || null, // denormalized so a linked attendee can read it
    phone: (data.phone || "").trim() || null,
    email: (data.email || "").trim() || null,
    // Full DOB stored; exposed only as MM-DD via birthdayMMDD/birthdayLabel.
    dob: data.dob || null,
    status: data.status || MEMBER_STATUS.ACTIVE,
    tags: Array.isArray(data.tags) ? data.tags : [],
    notes: data.notes ? [{ text: String(data.notes).trim(), at: new Date().toISOString() }] : [],
    planId: data.planId || null,
    creditBalance: 0,
    pricingTier: data.pricingTier === PRICING_TIER.LOCAL ? PRICING_TIER.LOCAL : PRICING_TIER.GENERAL,
    balanceOwedCents: Math.max(0, Math.round(data.balanceOwedCents || 0)),
    branchId: data.branchId || null,
    inviteCode: generateGuestCode(businessName),
    linkedUid: null,
    redeemedAt: null,
    qrPassId: null,
    smsConsent: buildSmsConsent(data.smsConsentGranted, source),
    source,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(membersCol(bizId), payload);
  try {
    await updateDoc(doc(db, "businesses", bizId), { memberCount: increment(1) });
  } catch (e) {
    /* count is best-effort */
  }
  return { id: ref.id, ...payload };
}

/**
 * Patch a member. Pass `appendNote` to add a timestamped note to the timeline.
 */
export async function updateMember(memberId, patch = {}, bizId = getMyBizId()) {
  if (!bizId || !memberId) return;
  const clean = { ...patch, updatedAt: serverTimestamp() };
  // One read covers both the note-append and the status-change log.
  const needsExisting = clean.appendNote || clean.status !== undefined;
  const existing = needsExisting ? await getMember(memberId, bizId) : null;
  if (clean.appendNote) {
    const notes = Array.isArray(existing?.notes) ? existing.notes : [];
    clean.notes = [
      { text: String(clean.appendNote).trim(), at: new Date().toISOString() },
      ...notes,
    ];
    delete clean.appendNote;
  }
  // Status-change log (dashboard handoff §Status-log): real churn (→inactive) and
  // recovered (inactive→active) come from these transitions, not a snapshot count.
  // Log ONLY an actual change, capped so the doc can't grow unbounded.
  if (clean.status !== undefined && existing && (existing.status || MEMBER_STATUS.ACTIVE) !== clean.status) {
    const log = Array.isArray(existing.statusLog) ? existing.statusLog : [];
    clean.statusLog = [
      { from: existing.status || MEMBER_STATUS.ACTIVE, to: clean.status, at: new Date().toISOString() },
      ...log,
    ].slice(0, 50);
  }
  await updateDoc(memberRef(bizId, memberId), clean);
}

export async function regenerateInviteCode(memberId, businessName = "", bizId = getMyBizId()) {
  const code = generateGuestCode(businessName);
  await updateMember(memberId, { inviteCode: code, redeemedAt: null, linkedUid: null }, bizId);
  return code;
}

export async function deleteMember(memberId, bizId = getMyBizId()) {
  if (!bizId || !memberId) return;
  await deleteDoc(memberRef(bizId, memberId));
  try {
    await updateDoc(doc(db, "businesses", bizId), { memberCount: increment(-1) });
  } catch (e) {
    /* best-effort */
  }
}

/**
 * Minimal, robust CSV parser (handles quoted fields with commas/quotes/newlines).
 * Returns { headers:string[], rows:string[][] }. No external dependency.
 */
export function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  return { headers: nonEmpty[0].map((h) => h.trim()), rows: nonEmpty.slice(1) };
}

/** Truthy CSV consent cell → explicit opt-in ("yes/si/sí/true/1/x"). */
const consentTruthy = (v) =>
  ["yes", "y", "si", "sí", "true", "1", "x"].includes(String(v || "").trim().toLowerCase());

/**
 * Bulk-create members from parsed CSV rows using a column→field mapping.
 * Imported members get smsConsent.granted=false UNLESS a consent column is
 * mapped and truthy (never assume consent on a migrated list — LFPDPPP).
 * @param {string[][]} rows
 * @param {{name:number, phone?:number, email?:number, tags?:number, sms_consent?:number}} map
 * @returns {Promise<{created:number, skipped:number}>}
 */
export async function bulkImportMembers(rows, map, businessName = "", bizId = getMyBizId()) {
  if (!bizId || !Array.isArray(rows)) return { created: 0, skipped: 0 };
  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    const name = (r[map.name] || "").trim();
    if (!name) {
      skipped++;
      continue;
    }
    const tags =
      map.tags != null && r[map.tags]
        ? String(r[map.tags])
            .split(/[;|]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const smsConsentGranted = map.sms_consent != null ? consentTruthy(r[map.sms_consent]) : false;
    try {
      await createMember(
        {
          name,
          phone: map.phone != null ? r[map.phone] : "",
          email: map.email != null ? r[map.email] : "",
          tags,
          smsConsentGranted,
          source: "csv",
        },
        businessName,
        bizId
      );
      created++;
    } catch (e) {
      skipped++;
    }
  }
  return { created, skipped };
}
