/**
 * businessClassesService — scheduling (kinlo_business/01 §5). Recurring weekly
 * classes (or one-off), instructor, capacity + waitlist with auto-promote on a
 * cancellation. Roster booking is manual-first (host books members); marking
 * present flows through the attendance ledger (Block 2).
 *
 * Data: businesses/{bizId}/classes/{classId}
 *   title, instructor, weekdays[0-6], time"HH:MM", date?(ISO one-off),
 *   durationMin, capacity, location, roster:[{memberId,name}],
 *   waitlist:[{memberId,name}], public, branchId?
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
import { db } from "./firebase";
import { getMyBizId, getBusiness } from "./businessService";

const classesCol = (bizId) => collection(db, "businesses", bizId, "classes");
const classRef = (bizId, id) => doc(db, "businesses", bizId, "classes", id);

const timeToMin = (time) => {
  const [h, m] = String(time || "0:0").split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
};

export async function listClasses(bizId = getMyBizId()) {
  if (!bizId) return [];
  try {
    const snap = await getDocs(classesCol(bizId));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
  } catch (e) {
    console.error("listClasses failed:", e?.message || e);
    return [];
  }
}

/** Classes scheduled on a given weekday (0=Sun): recurring or one-off. */
export function classesOnWeekday(classes, weekday) {
  return classes.filter((c) => {
    if (Array.isArray(c.weekdays) && c.weekdays.includes(weekday)) return true;
    if (c.date && new Date(c.date).getDay() === weekday) return true;
    return false;
  });
}

export async function getClass(classId, bizId = getMyBizId()) {
  if (!bizId || !classId) return null;
  const snap = await getDoc(classRef(bizId, classId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createClass(data = {}, bizId = getMyBizId()) {
  if (!bizId) throw new Error("no_business");
  const payload = {
    title: (data.title || "").trim(),
    // Legacy free-text instructor kept for old readers; instructorUid is the
    // real staff reference used by the Agenda (kinlo_business/06 FIX 2/3).
    instructor: (data.instructorName || data.instructor || "").trim() || null,
    instructorUid: data.instructorUid || null,
    instructorName: data.instructorName || null,
    weekdays: Array.isArray(data.weekdays) ? data.weekdays : [],
    time: data.time || "18:00",
    date: data.date || null,
    durationMin: data.durationMin ? parseInt(data.durationMin, 10) : 60,
    capacity: Math.max(1, parseInt(data.capacity, 10) || 12),
    location: (data.location || "").trim() || null,
    roster: [],
    waitlist: [],
    public: data.public === true,
    city: data.city || null,
    branchId: data.branchId || null,
    // Full event-shaped fields so a class carries everything an event does.
    kind: "class",
    description: (data.description || "").trim() || null,
    category: data.category || null,
    languages: Array.isArray(data.languages) ? data.languages : [],
    images: Array.isArray(data.images) ? data.images : [],
    price: typeof data.price === "number" ? data.price : parseFloat(data.price) || 0,
    priceLocal: data.priceLocal != null ? data.priceLocal : null,
    twoTier: data.twoTier === true,
    currency: data.currency || "MXN",
    acceptsMembership: data.acceptsMembership === true,
    creditCost: data.creditCost || 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(classesCol(bizId), payload);
  return { id: ref.id, ...payload };
}

export async function updateClass(classId, patch = {}, bizId = getMyBizId()) {
  if (!bizId || !classId) return;
  await updateDoc(classRef(bizId, classId), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteClass(classId, bizId = getMyBizId()) {
  if (!bizId || !classId) return;
  await deleteDoc(classRef(bizId, classId));
}

/**
 * Book a member into a class. Adds to the roster if there's space, else to the
 * waitlist. Idempotent.
 * @returns {Promise<{status:'roster'|'waitlist'|'already'}>}
 */
export async function bookMember(cls, member, bizId = getMyBizId()) {
  if (!bizId || !cls?.id || !member?.id) return { status: "already" };
  const roster = Array.isArray(cls.roster) ? [...cls.roster] : [];
  const waitlist = Array.isArray(cls.waitlist) ? [...cls.waitlist] : [];
  if (roster.some((r) => r.memberId === member.id) || waitlist.some((w) => w.memberId === member.id)) {
    return { status: "already" };
  }
  const entry = { memberId: member.id, name: member.name || "" };
  let status;
  if (roster.length < (cls.capacity || 1)) {
    roster.push(entry);
    status = "roster";
  } else {
    waitlist.push(entry);
    status = "waitlist";
  }
  await updateClass(cls.id, { roster, waitlist }, bizId);
  return { status };
}

/**
 * Remove a member from the roster; auto-promote the first waitlisted member.
 * @returns {Promise<{promoted:object|null}>}
 */
export async function removeFromRoster(cls, memberId, bizId = getMyBizId()) {
  if (!bizId || !cls?.id) return { promoted: null };
  let roster = (cls.roster || []).filter((r) => r.memberId !== memberId);
  const waitlist = [...(cls.waitlist || [])];
  let promoted = null;
  if (waitlist.length > 0 && roster.length < (cls.capacity || 1)) {
    promoted = waitlist.shift();
    roster.push(promoted);
  }
  await updateClass(cls.id, { roster, waitlist }, bizId);
  return { promoted };
}

export async function removeFromWaitlist(cls, memberId, bizId = getMyBizId()) {
  if (!bizId || !cls?.id) return;
  const waitlist = (cls.waitlist || []).filter((w) => w.memberId !== memberId);
  await updateClass(cls.id, { waitlist }, bizId);
}

// ── Discovery bridge ─────────────────────────────────────────────────────────
// A public class is mirrored into the shared `events` collection so attendees
// find it in Home/Discovery. The mirror reuses the event doc shape (creatorId =
// the owner uid = bizId), so no server code or extra rules are needed — the
// existing events create rule already allows creatorId == auth.uid.

/** Map a business vertical to the closest discovery category. */
const VERTICAL_CATEGORY = {
  dance: "arts", gym: "sports", yoga: "wellness", retreat: "wellness",
  school: "learning", coaching: "learning", tours: "travel",
  nightlife: "nightlife", community: "social", events: "social", other: "social",
};

/**
 * The next real start Date for a class: a one-off date, or the next matching
 * weekday from `from`. Returns null if the class has no schedule / is in the past.
 */
export function nextClassOccurrence(cls, from = new Date()) {
  const [h, m] = String(cls.time || "18:00").split(":").map((n) => parseInt(n, 10) || 0);
  if (cls.date) {
    const d = new Date(cls.date);
    d.setHours(h, m, 0, 0);
    return d >= from ? d : null;
  }
  const days = Array.isArray(cls.weekdays) ? cls.weekdays : [];
  if (days.length === 0) return null;
  for (let i = 0; i < 14; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, h, m, 0, 0);
    if (days.includes(d.getDay()) && d > from) return d;
  }
  return null;
}

/**
 * Publish (or refresh) a public class as a discoverable Event. Idempotent: the
 * created event id is stored back on the class as `discoveryEventId`, so calling
 * again updates that same event instead of duplicating it.
 * @returns {Promise<string|null>} the event id, or null if it couldn't publish.
 */
export async function publishClassToDiscovery(cls, { city } = {}, bizId = getMyBizId()) {
  if (!bizId || !cls?.id) return null;
  const when = nextClassOccurrence(cls);
  if (!when) return null;
  const biz = await getBusiness(bizId);
  const cityId = city || cls.city || null;
  const eventData = {
    title: cls.title || "Class",
    description: cls.instructor ? `${cls.title} · ${cls.instructor}` : (cls.title || ""),
    category: VERTICAL_CATEGORY[biz?.vertical] || "wellness",
    languages: [],
    city: cityId || "",
    location: cls.location || "",
    locationCoords: null,
    durationMinutes: parseInt(cls.durationMin, 10) || 60,
    maxPeople: parseInt(cls.capacity, 10) || 12,
    price: 0,
    currency: "MXN",
    hostName: biz?.name || "Kinlo",
    creatorId: bizId,
    acceptsMembership: true,
    creditCost: 1,
    attendees: [],
    participantCount: 0,
    status: "active",
    isRecurring: Array.isArray(cls.weekdays) && cls.weekdays.length > 0,
    date: when.toISOString(),
    images: [],
    sourceBusinessId: bizId,
    sourceClassId: cls.id,
    updatedAt: serverTimestamp(),
  };
  try {
    if (cls.discoveryEventId) {
      await updateDoc(doc(db, "events", cls.discoveryEventId), eventData);
      if (cityId && cityId !== cls.city) await updateClass(cls.id, { city: cityId }, bizId);
      return cls.discoveryEventId;
    }
    const ref = await addDoc(collection(db, "events"), { ...eventData, createdAt: serverTimestamp() });
    await updateClass(cls.id, { discoveryEventId: ref.id, city: cityId }, bizId);
    return ref.id;
  } catch (e) {
    console.error("publishClassToDiscovery failed:", e?.message || e);
    return null;
  }
}

/** Remove a class's discovery listing (when the host unpublishes it). */
export async function unpublishClass(cls, bizId = getMyBizId()) {
  if (!cls?.discoveryEventId) return;
  try {
    await deleteDoc(doc(db, "events", cls.discoveryEventId));
  } catch (e) {
    /* already gone — ignore */
  }
  await updateClass(cls.id, { discoveryEventId: null }, bizId);
}
