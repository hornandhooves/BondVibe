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
import { listStaff, getWorkingHours } from "./businessStaffService";

export const AGENDA_BLOCK_TYPE = { BLOCKED: "blocked", BUSY: "busy" };
export const AGENDA_ITEM_KIND = { EVENT: "event", CLASS: "class", SESSION: "session", BLOCKED: "blocked" };

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

/** Events the host created (their own events carry creatorId === bizId). */
async function listHostEvents(bizId) {
  try {
    const snap = await getDocs(query(collection(db, "events"), where("creatorId", "==", bizId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}

/**
 * Every item on ONE instructor's day, merged from events + classes + private
 * sessions + block-off, normalized to
 * { id, kind, start(Date), end(Date), title, subtitle?, label?, instructorUid, instructorName }.
 * @param {string} instructorUid @param {string} instructorName @param {Date} date
 */
export async function getDayItems(instructorUid, instructorName, date, bizId = getMyBizId()) {
  if (!bizId || !instructorUid) return [];
  const isOwner = instructorUid === bizId; // owner uid === bizId in v1
  const nameKey = (instructorName || "").trim().toLowerCase();
  const items = [];

  const [events, classes, bookings, blocks] = await Promise.all([
    listHostEvents(bizId),
    listClasses(bizId),
    listBookings(bizId),
    listAgendaBlocks(instructorUid, bizId),
  ]);

  const mine = (uid, legacyName) => {
    if (uid) return uid === instructorUid;
    if (legacyName) return legacyName.trim().toLowerCase() === nameKey;
    return isOwner; // unassigned → the owner's day
  };
  const tag = { instructorUid, instructorName };

  // Real events (kind !== 'class') for this instructor on this date.
  events
    .filter((e) => e.kind !== "class")
    .filter((e) => mine(e.instructorUid))
    .forEach((e) => {
      const start = new Date(e.date);
      if (!sameDay(start, date)) return;
      const end = new Date(start.getTime() + (e.durationMinutes || 180) * 60000);
      items.push({
        id: `event_${e.id}`, kind: AGENDA_ITEM_KIND.EVENT, start, end,
        title: e.title || "Event",
        subtitle: [e.location, e.maxPeople ? `${(e.attendees || []).length}/${e.maxPeople}` : null].filter(Boolean).join(" · "),
        ...tag,
      });
    });

  // Classes on this weekday for this instructor (uid, else legacy name).
  classesOnWeekday(classes, date.getDay()).forEach((c) => {
    if (!mine(c.instructorUid, c.instructor)) return;
    const start = atTime(date, c.time || "18:00");
    const end = new Date(start.getTime() + (c.durationMin || 60) * 60000);
    const cap = c.capacity || 0;
    const booked = Array.isArray(c.roster) ? c.roster.length : 0;
    items.push({
      id: `class_${c.id}`, kind: AGENDA_ITEM_KIND.CLASS, start, end,
      title: c.title || "Class",
      subtitle: [c.location, cap ? `${booked}/${cap}` : null].filter(Boolean).join(" · "),
      ...tag,
    });
  });

  // Private sessions (confirmed bookings) for this instructor on this date.
  bookings
    .filter((b) => b.status === BOOKING_STATUS.CONFIRMED)
    .filter((b) => mine(b.instructorUid || b.staffUid))
    .forEach((b) => {
      const start = new Date(b.start);
      if (!sameDay(start, date)) return;
      const end = new Date(start.getTime() + (b.durationMin || 60) * 60000);
      items.push({
        id: `booking_${b.id}`, kind: AGENDA_ITEM_KIND.SESSION, start, end,
        title: (b.members || []).map((m) => m.name).join(", ") || b.sessionTypeName || "Session",
        subtitle: [b.location, b.sessionTypeName].filter(Boolean).join(" · "),
        bookingId: b.id, ...tag,
      });
    });

  // Host-defined block-off on this date.
  blocks.forEach((bl) => {
    const start = new Date(bl.start);
    if (!sameDay(start, date)) return;
    items.push({
      id: bl.id, kind: AGENDA_ITEM_KIND.BLOCKED, start, end: new Date(bl.end),
      title: bl.label || "Unavailable", label: bl.label || null, ...tag,
    });
  });

  return items.sort((a, b) => a.start - b.start);
}

const hmToMin = (t) => {
  const [h, m] = String(t || "0:0").split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
};

/**
 * Whether an instructor is free for the window [start, start+durationMin)
 * (round-5 BUG 6). Tests the FULL window for overlap against every non-blocked
 * item on that instructor's day, plus the staff member's working-hours range
 * AND working day.
 * @param {{instructorUid:string, instructorName?:string, start:Date, durationMin:number}} p
 * @param {string} [bizId]
 * @returns {Promise<{conflict:boolean, conflictItem:object|null, outOfHours:boolean}>}
 */
export async function checkInstructorAvailability(
  { instructorUid, instructorName, start, durationMin },
  bizId = getMyBizId()
) {
  const result = { conflict: false, conflictItem: null, outOfHours: false, workingHours: null };
  if (!bizId || !instructorUid || !(start instanceof Date) || Number.isNaN(start.getTime())) {
    return result;
  }
  const dur = Math.max(5, parseInt(durationMin, 10) || 60);
  const startMs = start.getTime();
  const endMs = startMs + dur * 60000;

  const [items, staff] = await Promise.all([
    getDayItems(instructorUid, instructorName, start, bizId),
    listStaff(bizId).catch(() => []),
  ]);

  const conflictItem = items.find((it) => {
    if (it.kind === AGENDA_ITEM_KIND.BLOCKED) return false; // non-blocked items only
    const s = new Date(it.start).getTime();
    const e = new Date(it.end).getTime();
    return startMs < e && endMs > s;
  });
  if (conflictItem) {
    result.conflict = true;
    result.conflictItem = conflictItem;
  }

  const wh = getWorkingHours((staff || []).find((s) => s.id === instructorUid));
  result.workingHours = { start: wh.start, end: wh.end };
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = startMin + dur;
  const workingDay = Array.isArray(wh.days) ? wh.days.includes(start.getDay()) : true;
  if (!workingDay || startMin < hmToMin(wh.start) || endMin > hmToMin(wh.end)) {
    result.outOfHours = true;
  }
  return result;
}

/**
 * Per-day item counts for one instructor across a date range (Week/Month/Year
 * calendar views, kinlo_business/07 FIX 5). One fetch; classes expand across the
 * range via their weekdays. Returns a map { 'YYYY-MM-DD': count }.
 */
export async function getRangeCounts(instructorUid, instructorName, fromDate, toDate, bizId = getMyBizId()) {
  const counts = {};
  if (!bizId || !instructorUid) return counts;
  const isOwner = instructorUid === bizId;
  const nameKey = (instructorName || "").trim().toLowerCase();
  const mine = (uid, legacyName) => {
    if (uid) return uid === instructorUid;
    if (legacyName) return legacyName.trim().toLowerCase() === nameKey;
    return isOwner;
  };
  const key = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const inRange = (d) => d >= fromDate && d <= toDate;
  const bump = (d) => { const k = key(d); counts[k] = (counts[k] || 0) + 1; };

  const [events, classes, bookings, blocks] = await Promise.all([
    listHostEvents(bizId), listClasses(bizId), listBookings(bizId), listAgendaBlocks(instructorUid, bizId),
  ]);

  events.filter((e) => e.kind !== "class" && mine(e.instructorUid)).forEach((e) => {
    const d = new Date(e.date);
    if (inRange(d)) bump(d);
  });
  bookings.filter((b) => b.status === BOOKING_STATUS.CONFIRMED && mine(b.instructorUid || b.staffUid)).forEach((b) => {
    const d = new Date(b.start);
    if (inRange(d)) bump(d);
  });
  blocks.forEach((bl) => { const d = new Date(bl.start); if (inRange(d)) bump(d); });
  // Classes: expand recurrence day by day across the range.
  const myClasses = classes.filter((c) => mine(c.instructorUid, c.instructor));
  if (myClasses.length) {
    const cur = new Date(fromDate);
    while (cur <= toDate) {
      const onDay = classesOnWeekday(myClasses, cur.getDay()).length;
      if (onDay) counts[key(cur)] = (counts[key(cur)] || 0) + onDay;
      cur.setDate(cur.getDate() + 1);
    }
  }
  return counts;
}
const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Director view (kinlo_business/06 FIX 5): every instructor's day merged, each
 * item tagged with its instructor. Returns { staff:[{uid,name}], items:[] }.
 */
export async function getAllDayItems(date, bizId = getMyBizId()) {
  if (!bizId) return { staff: [], items: [] };
  const staff = await listStaff(bizId);
  const instructors = staff.filter((s) => s.role === "owner" || s.role === "instructor");
  const perDay = await Promise.all(
    instructors.map((s) => getDayItems(s.id, s.name, date, bizId))
  );
  return {
    staff: instructors.map((s) => ({ uid: s.id, name: s.name })),
    items: perDay.flat().sort((a, b) => a.start - b.start),
  };
}

export { timeToMin };
