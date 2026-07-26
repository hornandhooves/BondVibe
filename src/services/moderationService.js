/**
 * Moderation console (KIN-117) — /reports triage + resolve.
 *
 * Unlike paymentLedger, `/reports` is admin-READABLE directly (firestore.rules
 * `isAdmin()`), so the queue + detail screens read Firestore straight — no
 * list callable needed. Only the two STATE-CHANGING actions (take case,
 * resolve) go through the admin-gated `moderateReport` callable, so
 * `reviewedBy`/`reviewedAt` are always server-stamped from the caller's own
 * token, never trusted from the client.
 *
 * Query is deliberately single-field (orderBy(createdAt desc) only — the
 * automatic index every field gets) — status/type filters are applied IN
 * MEMORY on the loaded page. Same no-composite-index precedent as
 * adminListPayouts (functions/index.js) — /reports is low-volume and this
 * avoids coupling the screen to firestore.indexes.json entirely.
 */
import {
  collection, query, orderBy, limit, startAfter, getDocs, doc, getDoc,
  getCountFromServer, where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebase";

const PAGE_SIZE = 25;
const MAX_SCAN = 200; // hard bound per call — /reports is low-volume (admin-only surface)

/**
 * Load a page of reports matching {status, type}, newest first. The
 * Firestore query itself is ALWAYS just orderBy(createdAt desc) — the
 * automatic single-field index every field gets — so it can never fail on a
 * missing/still-building composite index. status/type are filtered IN CODE
 * over a bounded forward scan, same no-composite-index precedent as
 * adminListPayouts (functions/index.js).
 * @param {object} opts
 * @param {string} [opts.status] filter on reports.status
 * @param {string} [opts.type] filter on reports.type
 * @param {import("firebase/firestore").QueryDocumentSnapshot|null} [opts.cursorDoc] resume the scan after this doc
 * @return {Promise<{reports: object[], lastDoc: object|null, hasMore: boolean}>}
 */
export const listReports = async ({ status, type, cursorDoc = null } = {}) => {
  const filtered = !!(status || type);
  const BATCH = filtered ? 50 : PAGE_SIZE; // over-fetch when filtering to fill a page
  const matched = [];
  let cursor = cursorDoc;
  let scanned = 0;
  let exhausted = false;

  while (matched.length < PAGE_SIZE && scanned < MAX_SCAN) {
    let q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(BATCH));
    if (cursor) {
      q = query(collection(db, "reports"), orderBy("createdAt", "desc"), startAfter(cursor), limit(BATCH));
    }
    const snap = await getDocs(q);
    if (snap.empty) {
      exhausted = true;
      break;
    }
    let pageFilled = false;
    for (const d of snap.docs) {
      scanned++;
      cursor = d;
      const data = d.data();
      if (status && data.status !== status) continue;
      if (type && data.type !== type) continue;
      matched.push({ id: d.id, ...data });
      if (matched.length >= PAGE_SIZE) {
        pageFilled = true;
        break;
      }
    }
    if (pageFilled) break;
    if (snap.size < BATCH) {
      exhausted = true;
      break;
    }
  }

  return { reports: matched, lastDoc: exhausted ? null : cursor, hasMore: !exhausted };
};

/** Count of reports in a given status — a single equality filter, no orderBy,
 * so it only ever needs the automatic single-field index (no composite). */
export const countReportsByStatus = async (status) => {
  const snap = await getCountFromServer(query(collection(db, "reports"), where("status", "==", status)));
  return snap.data().count;
};

/** Read a single report by id (used when landing from a push notification). */
export const getReport = async (reportId) => {
  const snap = await getDoc(doc(db, "reports", reportId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/**
 * Honest-null target name resolution for report_type user_block (the only
 * writer that doesn't already carry targetName). Never invents a name.
 * @return {Promise<string|null>}
 */
export const getUserName = async (userId) => {
  if (!userId) return null;
  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return d.fullName || d.name || null;
};

/** Take the case (status -> in_review, reviewedBy/reviewedAt server-stamped). */
export const takeReportCase = (reportId) => {
  const fn = httpsCallable(getFunctions(), "moderateReport");
  return fn({ reportId, action: "take" }).then((r) => r.data);
};

/** Resolve the case. `resolution`: "action_taken" | "no_violation" | "duplicate". */
export const resolveReportCase = (reportId, resolution, adminNotes) => {
  const fn = httpsCallable(getFunctions(), "moderateReport");
  return fn({ reportId, action: "resolve", resolution, adminNotes: adminNotes || "" }).then((r) => r.data);
};
