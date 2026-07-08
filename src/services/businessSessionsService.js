/**
 * businessSessionsService — Agenda & private sessions (kinlo_business/03).
 * Session types (1:1 / couple / group), publishable availability, and bookings
 * with a request→confirm lifecycle. Session credits reuse the Packages feature
 * (a 'session'-kind package); confirming a booking settles it — deduct a credit
 * or record a payment on the SAME member records.
 *
 * Data (under businesses/{bizId}):
 *   sessionTypes/{id}  name, capacityMax, durationMin, priceCents, description
 *   availability/{id}  weekdays[], date?, time, durationMin, sessionTypeId,
 *                      location, capacity
 *   bookings/{id}      members[{memberId,name}], sessionTypeId, sessionTypeName,
 *                      start(ISO), durationMin, location, status, paidWith,
 *                      priceCents, reminderHostAt, reminderAttendeeAt, notes
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { getMyBizId } from "./businessService";
import { getMember } from "./businessMembersService";
import { adjustCredits } from "./businessPackagesService";
import { createPayment } from "./businessPaymentsService";

/**
 * Notify a booking's linked attendees (post-session hooks). Reuses the existing
 * notification pipeline; deep-links to the host profile (Follow = join the
 * community; rating nudge after a done session). Members without an app account
 * are skipped. Best-effort — never blocks the state change.
 */
async function notifyAttendees(booking, { title, body, kind }, bizId = getMyBizId()) {
  try {
    const fn = httpsCallable(getFunctions(), "createNotification");
    for (const m of booking.members || []) {
      if (!m.memberId) continue;
      const full = await getMember(m.memberId, bizId);
      if (!full?.linkedUid) continue;
      await fn({
        toUserId: full.linkedUid,
        type: `business_session_${kind}`,
        title,
        body,
        metadata: { screen: "UserProfile", userId: bizId },
      });
    }
  } catch (e) {
    /* best-effort */
  }
}

export const BOOKING_STATUS = {
  REQUESTED: "requested",
  CONFIRMED: "confirmed",
  DECLINED: "declined",
  DONE: "done",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
};
export const PAID_WITH = ["credit", "cash", "stripe", "mercadopago"];

const col = (bizId, name) => collection(db, "businesses", bizId, name);
const ref = (bizId, name, id) => doc(db, "businesses", bizId, name, id);

/** 1 = 1:1, 2 = couple, ≥3 = group. */
export const capacityKind = (n) => (n <= 1 ? "one" : n === 2 ? "couple" : "group");

// ── Session types ───────────────────────────────────────────────────────────
export async function listSessionTypes(bizId = getMyBizId()) {
  if (!bizId) return [];
  const snap = await getDocs(col(bizId, "sessionTypes"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function createSessionType(data, bizId = getMyBizId()) {
  const payload = {
    name: (data.name || "").trim(),
    capacityMax: Math.max(1, parseInt(data.capacityMax, 10) || 1),
    durationMin: parseInt(data.durationMin, 10) || 60,
    priceCents: Math.max(0, Math.round((parseFloat(data.price) || 0) * 100)),
    description: (data.description || "").trim() || null,
    createdAt: serverTimestamp(),
  };
  const r = await addDoc(col(bizId, "sessionTypes"), payload);
  return { id: r.id, ...payload };
}
export async function updateSessionType(id, patch, bizId = getMyBizId()) {
  const clean = { ...patch };
  if (clean.price != null) {
    clean.priceCents = Math.max(0, Math.round((parseFloat(clean.price) || 0) * 100));
    delete clean.price;
  }
  await updateDoc(ref(bizId, "sessionTypes", id), clean);
}
export async function deleteSessionType(id, bizId = getMyBizId()) {
  await deleteDoc(ref(bizId, "sessionTypes", id));
}

// ── Availability ──────────────────────────────────────────────────────────────
export async function listAvailability(bizId = getMyBizId()) {
  if (!bizId) return [];
  const snap = await getDocs(col(bizId, "availability"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function createAvailability(data, bizId = getMyBizId()) {
  const payload = {
    weekdays: Array.isArray(data.weekdays) ? data.weekdays : [],
    date: data.date || null,
    time: data.time || "10:00",
    durationMin: parseInt(data.durationMin, 10) || 60,
    sessionTypeId: data.sessionTypeId || null,
    sessionTypeName: data.sessionTypeName || "",
    location: (data.location || "").trim() || null,
    capacity: Math.max(1, parseInt(data.capacity, 10) || 1),
    createdAt: serverTimestamp(),
  };
  const r = await addDoc(col(bizId, "availability"), payload);
  return { id: r.id, ...payload };
}
export async function deleteAvailability(id, bizId = getMyBizId()) {
  await deleteDoc(ref(bizId, "availability", id));
}

// ── Bookings ──────────────────────────────────────────────────────────────────
export async function listBookings(bizId = getMyBizId()) {
  if (!bizId) return [];
  const snap = await getDocs(col(bizId, "bookings"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}
export async function getBooking(id, bizId = getMyBizId()) {
  if (!bizId || !id) return null;
  const snap = await getDoc(ref(bizId, "bookings", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createBooking(data, bizId = getMyBizId()) {
  const status = data.status || BOOKING_STATUS.CONFIRMED;
  const payload = {
    members: Array.isArray(data.members) ? data.members : [],
    sessionTypeId: data.sessionTypeId || null,
    sessionTypeName: data.sessionTypeName || "",
    start: data.start ? new Date(data.start).toISOString() : new Date().toISOString(),
    durationMin: parseInt(data.durationMin, 10) || 60,
    // Which staff member runs it (kinlo_business/06 FIX 3). Defaults to the
    // current user so a private session always lands on someone's Agenda.
    instructorUid: data.instructorUid || data.staffUid || auth.currentUser?.uid || null,
    location: (data.location || "").trim() || null,
    status,
    paidWith: data.paidWith || "credit",
    priceCents: data.priceCents || 0,
    reminderHostAt: null,
    reminderAttendeeAt: null,
    notes: (data.notes || "").trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const r = await addDoc(col(bizId, "bookings"), payload);
  const booking = { id: r.id, ...payload };
  if (status === BOOKING_STATUS.CONFIRMED) await settleBooking(booking, bizId);
  return booking;
}

export async function updateBooking(id, patch, bizId = getMyBizId()) {
  await updateDoc(ref(bizId, "bookings", id), { ...patch, updatedAt: serverTimestamp() });
}

/** Confirm a requested booking: settle payment/credit + schedule reminders. */
export async function confirmBooking(booking, bizId = getMyBizId()) {
  const start = new Date(booking.start).getTime();
  await updateBooking(
    booking.id,
    {
      status: BOOKING_STATUS.CONFIRMED,
      reminderAttendeeAt: new Date(start - 24 * 3600000).toISOString(),
      reminderHostAt: new Date(start - 3600000).toISOString(),
    },
    bizId
  );
  await settleBooking(booking, bizId);
  // Community hook: invite the attendee to join the host's community.
  const biz = await getDoc(doc(db, "businesses", bizId));
  const hostName = biz.exists() ? biz.data().name || "Kinlo" : "Kinlo";
  await notifyAttendees(
    booking,
    {
      title: hostName,
      body: `Your session is confirmed. Join ${hostName}'s community to stay in the loop.`,
      kind: "confirmed",
    },
    bizId
  );
}

export const declineBooking = (id, bizId = getMyBizId()) =>
  updateBooking(id, { status: BOOKING_STATUS.DECLINED }, bizId);
export const cancelBooking = (id, bizId = getMyBizId()) =>
  updateBooking(id, { status: BOOKING_STATUS.CANCELLED }, bizId);
export const markNoShow = (id, bizId = getMyBizId()) =>
  updateBooking(id, { status: BOOKING_STATUS.NO_SHOW }, bizId);

/**
 * Mark a session done. Fires the rating nudge to the attendee (post-session
 * hook); no-show never triggers a rating. Accepts the booking so we can notify.
 */
export async function markDone(booking, bizId = getMyBizId()) {
  const id = typeof booking === "string" ? booking : booking.id;
  await updateBooking(id, { status: BOOKING_STATUS.DONE }, bizId);
  if (typeof booking === "object") {
    const biz = await getDoc(doc(db, "businesses", bizId));
    const hostName = biz.exists() ? biz.data().name || "Kinlo" : "Kinlo";
    await notifyAttendees(
      booking,
      { title: hostName, body: `How was your session with ${hostName}? Tap to rate.`, kind: "rate" },
      bizId
    );
  }
}

/** Settle a confirmed booking: deduct a session credit or record a payment. */
async function settleBooking(booking, bizId = getMyBizId()) {
  for (const m of booking.members || []) {
    if (!m.memberId) continue;
    if (booking.paidWith === "credit") {
      const full = await getMember(m.memberId, bizId);
      if (full && (full.creditBalance || 0) > 0) {
        await adjustCredits({ ...full, id: m.memberId }, -1, "session", bizId);
      }
    } else if (booking.priceCents > 0) {
      await createPayment(
        {
          memberId: m.memberId,
          memberName: m.name,
          amount: booking.priceCents / 100,
          method: booking.paidWith,
          note: booking.sessionTypeName || "session",
        },
        bizId
      );
    }
  }
}
