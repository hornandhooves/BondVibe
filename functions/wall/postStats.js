/**
 * Wall v2 · post reach stats (P2, Kinlo Pro). Impressions and CTA taps are
 * incremented server-side so a host can't inflate their own reach; the stats doc
 * is readable only by the post's author (rules). Views can slightly over-count
 * (a card can re-enter the viewport) — acceptable for a reach signal.
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
  await db.collection("postStats").doc(postId).set(
    {
      postId,
      authorId: postSnap.data().authorId || null,
      [field]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return {ok: true};
});

module.exports = {recordPostEvent};
