/**
 * businessAgendaService — the per-staff 24h Agenda (kinlo_business/05 §F).
 * A staff member's day is a MERGED read of their classes + private sessions +
 * host-defined block-off ("Unavailable") time. Block-off lives in its own
 * subcollection so it never collides with real bookings.
 *
 * Data: businesses/{bizId}/agendaBlocks/{blockId}
 *   staffUid, start(ISO), end(ISO), type:'blocked'|'busy', label?, createdAt
 */
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { getMyBizId } from "./businessService";
import { listClasses, classesOnWeekday } from "./businessClassesService";
import { listBookings, BOOKING_STATUS } from "./businessSessionsService";

export const AGENDA_BLOCK_TYPE = { BLOCKED: "blocked", BUSY: "busy" };
export const AGENDA_ITEM_KIND = { CLASS: "class", SESSION: "session", BLOCKED: "blocked" };

const blocksCol = (bizId) => collection(db, "businesses", bizId, "agendaBlocks");
const blockRef = (bizId, id) => doc(db, "businesses", bizId, "agendaBlocks", id);

const timeToMin = (t) => {
  const [h, m] = String(t || "0:0").split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
};
const atTime = (date, time) => {
  const d = new Date(date);
  const [h, m] = String(time || "0:0").split(":").map((n) => parseInt(n, 10) || 0);
  d.setHours(h, m, 0, 0);
  return d;
};
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// ── Block-off (Unavailable) ──────────────────────────────────────────────────
export async function listAgendaBlocks(staffUid, bizId = getMyBizId()) {
  if (!bizId || !staffUid) return [];
  try {
    const snap = await getDocs(query(blocksCol(bizId), where("staffUid", "==", staffUid)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("listAgendaBlocks failed:", e?.message || e);
    return [];
  }
}

export async function createAgendaBlock({ staffUid, start, end, label, type }, bizId = getMyBizId()) {
  if (!bizId || !staffUid) throw new Error("bad_args");
  const payload = {
    staffUid,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    type: type === AGENDA_BLOCK_TYPE.BUSY ? AGENDA_BLOCK_TYPE.BUSY : AGENDA_BLOCK_TYPE.BLOCKED,
    label: (label || "").trim() || null,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(blocksCol(bizId), payload);
  return { id: ref.id, ...payload };
}

export async function deleteAgendaBlock(id, bizId = getMyBizId()) {
  if (!bizId || !id) return;
  await deleteDoc(blockRef(bizId, id));
}

/**
 * Every item on a staff member's day, normalized to
 * { id, kind, start(Date), end(Date), title, subtitle?, label?, color? }.
 * @param {string} staffUid @param {string} staffName @param {Date} date
 */
export async function getDayItems(staffUid, staffName, date, bizId = getMyBizId()) {
  if (!bizId || !staffUid) return [];
  const isOwner = staffUid === bizId; // owner uid === bizId in v1
  const nameKey = (staffName || "").trim().toLowerCase();
  const items = [];

  const [classes, bookings, blocks] = await Promise.all([
    listClasses(bizId),
    listBookings(bizId),
    listAgendaBlocks(staffUid, bizId),
  ]);

  // Classes on this weekday taught by this staff (matched by instructor name,
  // or all unassigned classes fall under the owner).
  classesOnWeekday(classes, date.getDay()).forEach((c) => {
    const inst = (c.instructor || "").trim().toLowerCase();
    const mine = inst ? inst === nameKey : isOwner;
    if (!mine) return;
    const start = atTime(date, c.time || "18:00");
    const end = new Date(start.getTime() + (c.durationMin || 60) * 60000);
    const cap = (c.capacity || 0);
    const booked = Array.isArray(c.roster) ? c.roster.length : 0;
    items.push({
      id: `class_${c.id}`,
      kind: AGENDA_ITEM_KIND.CLASS,
      start,
      end,
      title: c.title || "Class",
      subtitle: [c.location, cap ? `${booked}/${cap}` : null].filter(Boolean).join(" · "),
    });
  });

  // Private sessions (confirmed bookings) for this staff on this date. Bookings
  // may carry staffUid; unassigned ones fall under the owner.
  bookings
    .filter((b) => b.status === BOOKING_STATUS.CONFIRMED)
    .filter((b) => (b.staffUid ? b.staffUid === staffUid : isOwner))
    .forEach((b) => {
      const start = new Date(b.start);
      if (!sameDay(start, date)) return;
      const end = new Date(start.getTime() + (b.durationMin || 60) * 60000);
      items.push({
        id: `booking_${b.id}`,
        kind: AGENDA_ITEM_KIND.SESSION,
        start,
        end,
        title: (b.members || []).map((m) => m.name).join(", ") || b.sessionTypeName || "Session",
        subtitle: [b.location, b.sessionTypeName].filter(Boolean).join(" · "),
        bookingId: b.id,
      });
    });

  // Host-defined block-off on this date.
  blocks.forEach((bl) => {
    const start = new Date(bl.start);
    if (!sameDay(start, date)) return;
    items.push({
      id: bl.id,
      kind: AGENDA_ITEM_KIND.BLOCKED,
      start,
      end: new Date(bl.end),
      title: bl.label || "Unavailable",
      label: bl.label || null,
    });
  });

  return items.sort((a, b) => a.start - b.start);
}

export { timeToMin };
