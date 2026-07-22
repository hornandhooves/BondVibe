/**
 * Wall v2 · post reach stats (P2, Kinlo Pro). Impressions and CTA taps are
 * incremented server-side so a host can't inflate their own reach; the stats doc
 * is readable only by the post's author (rules).
 *
 * SECURITY (fix/security-functions-4a): the increment used to fire on EVERY call,
 * so any signed-in user could loop recordPostEvent and inflate (or deflate the
 * value of) a post's reach — including a rival deflating the signal's meaning, or
 * a host juicing their own numbers from a second account. Reach is now deduped
 * per viewer: the first view / first ctaClick from a given uid counts, repeats
 * no-op. The marker lives at postStats/{postId}/viewers/{uid} and the whole
 * check-and-increment is one transaction so concurrent calls can't double-count.
 */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();

const recordPostEvent = onCall(async (request) => {
  const me = request.auth && request.auth.uid;
  if (!me) throw new HttpsError("unauthenticated", "Sign in required.");
  const {postId, type} = request.data || {};
  if (!postId || (type !== "view" && type !== "ctaClick")) {
    throw new HttpsError("invalid-argument", "Bad postId/type.");
  }
  const postSnap = await db.collection("posts").doc(postId).get();
  if (!postSnap.exists) throw new HttpsError("not-found", "Post not found.");

  const field = type === "view" ? "views" : "ctaClicks";
  const statsRef = db.collection("postStats").doc(postId);
  const viewerRef = statsRef.collection("viewers").doc(me);

  const counted = await db.runTransaction(async (tx) => {
    const vSnap = await tx.get(viewerRef);
    // Already counted this event type for this viewer → no-op.
    if (vSnap.exists && vSnap.data()[field] === true) return false;
    tx.set(viewerRef, {
      [field]: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(statsRef, {
      postId,
      authorId: postSnap.data().authorId || null,
      [field]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return true;
  });
  return {ok: true, counted};
});

module.exports = {recordPostEvent};
