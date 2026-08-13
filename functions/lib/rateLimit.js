/**
 * Shared fixed-window rate limiter (KIN-221).
 *
 * Lifted verbatim out of authEmails.js, which had been its only user. It moves
 * here because clientErrors.js needs the same thing, and a second hand-rolled
 * copy is how two limiters drift apart until one of them is subtly wrong.
 * Behaviour is unchanged — same signature, same Firestore backend
 * (rateLimit/{key}, server-only), same transaction.
 */
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

/**
 * Fixed-window rate limiter backed by Firestore (rateLimit/{key}, server-only).
 * @param {string} key bucket key (a hash, or a constant like "global_reset").
 * @param {number} limit max hits allowed per window.
 * @param {number} windowMs window length in ms.
 * @return {Promise<boolean>} true if over the limit (caller should skip).
 */
function overLimit(key, limit, windowMs) {
  const ref = admin.firestore().doc(`rateLimit/${key}`);
  const now = Date.now();
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = (snap.exists && snap.data()) || {};
    if (now - (d.windowStart || 0) >= windowMs) { // window elapsed → reset
      tx.set(ref, {windowStart: now, count: 1, updatedAt: FieldValue.serverTimestamp()});
      return false;
    }
    if ((d.count || 0) >= limit) return true;
    tx.set(ref, {count: (d.count || 0) + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return false;
  });
}

module.exports = {overLimit};
