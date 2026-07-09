/**
 * @handle claiming — server-only. Uniqueness is guaranteed by a reservation
 * doc `handles/{handleLower}` whose id IS the handle: a transaction that creates
 * it iff it doesn't exist can never let two users hold the same handle. Handles
 * are permanent (no self-change) and never recycled (deletion tombstones the
 * doc; admin reassign tombstones the old one).
 */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {validateHandle} = require("./lib/handles");
const {isAdminUid} = require("./lib/auth");

const db = admin.firestore();

const MESSAGES = {
  format: "Handles are 3–30 letters or underscores, must include a letter, " +
    "and can't start/end with or double an underscore.",
  reserved: "That handle is reserved.",
  profane: "Please choose a different handle.",
  taken: "That handle is already taken.",
};

/**
 * Simple per-user rate limit on claim attempts (stops enumeration/abuse).
 * @param {string} uid
 * @return {Promise<void>}
 */
async function enforceClaimRate(uid) {
  const ref = db.collection("handleAttempts").doc(uid);
  const now = Date.now();
  const WINDOW_MS = 60000;
  const MAX = 10;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists ? snap.data() : {};
    const fresh = now - (d.windowStart || 0) > WINDOW_MS;
    const count = fresh ? 0 : d.count || 0;
    if (count >= MAX) {
      throw new HttpsError("resource-exhausted", "Too many attempts — try again in a minute.");
    }
    tx.set(ref, {windowStart: fresh ? now : d.windowStart, count: count + 1}, {merge: true});
  });
}

const displayForm = (raw) => String(raw || "").trim().slice(0, 30);

/**
 * claimHandle({ handle }) — validate → reserve in a transaction → write the
 * user doc. Permanent: a user who already has a handle can't change it here.
 */
exports.claimHandle = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const v = validateHandle(request.data && request.data.handle);
  if (!v.ok) throw new HttpsError("invalid-argument", MESSAGES[v.error] || "Invalid handle.");

  await enforceClaimRate(uid);

  const handleRef = db.collection("handles").doc(v.handleLower);
  const userRef = db.collection("users").doc(uid);

  await db.runTransaction(async (tx) => {
    const [hSnap, uSnap] = await Promise.all([tx.get(handleRef), tx.get(userRef)]);
    // Permanent: once a user has a handle, it can't be changed (admin only).
    if (uSnap.exists && uSnap.data().handleLower) {
      if (uSnap.data().handleLower === v.handleLower) return; // idempotent no-op
      throw new HttpsError("failed-precondition", "Your handle is already set and can't be changed.");
    }
    if (hSnap.exists && hSnap.data().uid && hSnap.data().uid !== uid) {
      throw new HttpsError("already-exists", MESSAGES.taken);
    }
    tx.set(handleRef, {uid, claimedAt: admin.firestore.FieldValue.serverTimestamp()});
    tx.set(userRef, {handle: displayForm(request.data.handle), handleLower: v.handleLower}, {merge: true});
  });

  return {ok: true, handle: v.handleLower};
});

/**
 * checkHandle({ handle }) — lightweight availability probe for the live
 * onboarding UX. Returns validity + whether it's free (reveals existence only,
 * never the owner).
 */
exports.checkHandle = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const v = validateHandle(request.data && request.data.handle);
  if (!v.ok) return {available: false, error: v.error};

  const snap = await db.collection("handles").doc(v.handleLower).get();
  const taken = snap.exists && snap.data().uid && snap.data().uid !== uid;
  return {available: !taken, error: taken ? "taken" : null, handleLower: v.handleLower};
});

/**
 * adminReassignHandle({ uid, handle }) — the ONLY way to change a handle. Admin
 * only. Tombstones the target's old handle (never recycled) and claims the new.
 */
exports.adminReassignHandle = onCall(async (request) => {
  const caller = request.auth && request.auth.uid;
  if (!caller || !(await isAdminUid(caller))) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const targetUid = request.data && request.data.uid;
  const v = validateHandle(request.data && request.data.handle);
  if (!targetUid || !v.ok) throw new HttpsError("invalid-argument", "Invalid input.");

  const handleRef = db.collection("handles").doc(v.handleLower);
  const userRef = db.collection("users").doc(targetUid);

  await db.runTransaction(async (tx) => {
    const [hSnap, uSnap] = await Promise.all([tx.get(handleRef), tx.get(userRef)]);
    if (hSnap.exists && hSnap.data().uid && hSnap.data().uid !== targetUid) {
      throw new HttpsError("already-exists", MESSAGES.taken);
    }
    const oldLower = uSnap.exists ? uSnap.data().handleLower : null;
    if (oldLower && oldLower !== v.handleLower) {
      // Tombstone — a handle is never recycled to a different person.
      tx.set(
        db.collection("handles").doc(oldLower),
        {uid: null, releasedAt: admin.firestore.FieldValue.serverTimestamp(), formerUid: targetUid},
        {merge: true},
      );
    }
    tx.set(handleRef, {uid: targetUid, claimedAt: admin.firestore.FieldValue.serverTimestamp()});
    tx.set(userRef, {handle: displayForm(request.data.handle), handleLower: v.handleLower}, {merge: true});
  });

  return {ok: true};
});
