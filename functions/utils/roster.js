/**
 * Event roster helper (fix/privacy-event-roster).
 *
 * The attendee roster moved OFF the world-readable events/{id}.attendees array
 * (anyone could read + de-anonymize it) INTO a gated subcollection
 * events/{id}/roster/{uid}, with capacity tracked by an integer participantCount
 * on the event doc. This module is the SINGLE source of truth for every money /
 * capacity write, so oversell + waitlist semantics live in exactly one place.
 *
 * Roster doc:  { uid, eventId, status: 'active'|'waitlist', joinedAt }
 *   - `uid` (field, not just doc id) → collectionGroup('roster').where('uid','==',me).
 *   - `status` → active counts toward capacity; waitlist does NOT.
 *   - `joinedAt` → FIFO order for waitlist promotion.
 * participantCount = number of ACTIVE roster docs (the oversell source of truth).
 *
 * All writes are Admin SDK (rules make the subcollection server-only), so these
 * bypass rules by design.
 *
 * Firestore requires all reads before all writes in a transaction, so the API is
 * split: `joinRosterTx` is for callers whose tx has done NO writes yet (it reads
 * the roster doc then writes); `writeActiveRoster` is a PURE write for callers
 * that pre-read capacity themselves; `removeFromRoster` / `promoteOldestWaitlist`
 * run their own transaction (idempotent, safe for non-tx callers).
 */
const {FieldValue} = require("firebase-admin/firestore");

const eventRef = (db, eventId) => db.collection("events").doc(eventId);
const rosterRef = (db, eventId, uid) =>
  eventRef(db, eventId).collection("roster").doc(uid);
const rosterCol = (db, eventId) => eventRef(db, eventId).collection("roster");

const maxOf = (e) => e.maxAttendees || e.maxPeople || 0;

/**
 * Join `uid` INSIDE a caller's transaction that has done NO writes yet, honoring
 * capacity: active if participantCount < max, else waitlist. Idempotent.
 * @param {FirebaseFirestore.Transaction} tx caller's transaction (pre-write)
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} eventId the event
 * @param {object} eventData the event doc data (already read by the caller)
 * @param {string} uid the joiner
 * @return {Promise<'active'|'waitlist'|'already'>} placement
 */
async function joinRosterTx(tx, db, eventId, eventData, uid) {
  const rRef = rosterRef(db, eventId, uid);
  const existing = await tx.get(rRef);
  if (existing.exists) return "already";
  const max = maxOf(eventData);
  const count = eventData.participantCount || 0;
  const status = max && count >= max ? "waitlist" : "active";
  tx.set(rRef, {uid, eventId, status, joinedAt: FieldValue.serverTimestamp()});
  if (status === "active") {
    tx.update(eventRef(db, eventId), {participantCount: FieldValue.increment(1)});
  }
  return status;
}

/**
 * PURE WRITE: add `uid` as an ACTIVE participant + increment participantCount.
 * The caller MUST have already read the roster doc (to guard against a double
 * count) and decided the user is not already active. Use when the caller checked
 * capacity itself (e.g. membership join, which rejects rather than waitlists).
 * @param {FirebaseFirestore.Transaction} tx caller's transaction
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} eventId the event
 * @param {string} uid the joiner
 * @return {void}
 */
function writeActiveRoster(tx, db, eventId, uid) {
  tx.set(rosterRef(db, eventId, uid), {
    uid, eventId, status: "active", joinedAt: FieldValue.serverTimestamp(),
  });
  tx.update(eventRef(db, eventId), {participantCount: FieldValue.increment(1)});
}

/**
 * Remove `uid` from the roster in its own transaction (idempotent — a second call
 * is a no-op, so participantCount can't be double-decremented). Decrements only if
 * the doc was ACTIVE (waitlist never counted). Safe for non-transactional callers
 * (leave/refund/release/delete-account).
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} eventId the event
 * @param {string} uid the leaver
 * @return {Promise<{removed:boolean, wasActive:boolean}>} outcome
 */
async function removeFromRoster(db, eventId, uid) {
  return db.runTransaction(async (tx) => {
    const rRef = rosterRef(db, eventId, uid);
    const s = await tx.get(rRef);
    if (!s.exists) return {removed: false, wasActive: false};
    const wasActive = s.data().status === "active";
    tx.delete(rRef);
    if (wasActive) {
      tx.update(eventRef(db, eventId), {participantCount: FieldValue.increment(-1)});
    }
    return {removed: true, wasActive};
  });
}

/**
 * Whether `uid` is on the roster (any status). Point read.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} eventId the event
 * @param {string} uid the user
 * @return {Promise<boolean>} true if a roster doc exists
 */
async function isOnRoster(db, eventId, uid) {
  return (await rosterRef(db, eventId, uid).get()).exists;
}

/**
 * Promote the oldest waitlisted roster doc to active IF there is capacity — the
 * FIFO waitlist promotion, run from the roster trigger after an active leaver.
 * Its own transaction re-reads capacity + the candidate so concurrent leaves
 * can't over-promote. Returns the promoted uid or null.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} eventId the event
 * @return {Promise<string|null>} the promoted uid, or null if none / no room
 */
async function promoteOldestWaitlist(db, eventId) {
  const head = await rosterCol(db, eventId)
    .where("status", "==", "waitlist")
    .orderBy("joinedAt", "asc")
    .limit(1)
    .get();
  if (head.empty) return null;
  const candidateUid = head.docs[0].id;

  return db.runTransaction(async (tx) => {
    const eSnap = await tx.get(eventRef(db, eventId));
    if (!eSnap.exists) return null;
    const e = eSnap.data();
    if (e.status === "cancelled") return null;
    const max = maxOf(e);
    if (max && (e.participantCount || 0) >= max) return null; // no room
    const cRef = rosterRef(db, eventId, candidateUid);
    const cSnap = await tx.get(cRef);
    if (!cSnap.exists || cSnap.data().status !== "waitlist") return null; // raced
    tx.update(cRef, {status: "active", promotedAt: FieldValue.serverTimestamp()});
    tx.update(eventRef(db, eventId), {participantCount: FieldValue.increment(1)});
    return candidateUid;
  });
}

module.exports = {
  eventRef,
  rosterRef,
  rosterCol,
  maxOf,
  joinRosterTx,
  writeActiveRoster,
  removeFromRoster,
  isOnRoster,
  promoteOldestWaitlist,
};
