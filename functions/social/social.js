/**
 * Social layer — server-maintained aggregate counts.
 *
 * likeCount / commentCount on a post are written only here (Admin SDK), so
 * clients can't inflate them (rules block client writes to those fields).
 */
const {onDocumentWritten, onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const {sendBatchPushNotifications} = require("../notifications/pushService");
const {tPush, baseLang} = require("../i18n");

const db = admin.firestore();

/**
 * +1 when a subdoc is created, -1 when deleted, 0 otherwise.
 * @param {object} event the Firestore write event
 * @return {number} the count delta
 */
function countDelta(event) {
  const before = event.data?.before?.exists;
  const after = event.data?.after?.exists;
  if (!before && after) return 1;
  if (before && !after) return -1;
  return 0;
}

const onPostLikeWritten = onDocumentWritten(
  "posts/{postId}/likes/{likeUid}",
  async (event) => {
    const delta = countDelta(event);
    if (!delta) return;
    await db
      .collection("posts")
      .doc(event.params.postId)
      .set({likeCount: FieldValue.increment(delta)}, {merge: true});
  },
);

const onPostCommentWritten = onDocumentWritten(
  "posts/{postId}/comments/{commentId}",
  async (event) => {
    const delta = countDelta(event);
    if (!delta) return;
    await db
      .collection("posts")
      .doc(event.params.postId)
      .set({commentCount: FieldValue.increment(delta)}, {merge: true});
  },
);

/**
 * Notify all followers when a new post is created.
 */
const onPostCreated = onDocumentCreated("posts/{postId}", async (event) => {
  const post = event.data?.data();
  if (!post) return;

  const {authorId, authorName} = post;
  if (!authorId) return;

  // Get followers of the author
  const followsSnap = await db
    .collection("follows")
    .where("followeeId", "==", authorId)
    .get();

  if (followsSnap.empty) return;

  const followerIds = followsSnap.docs.map((d) => d.data().followerId).filter(Boolean);

  // Fetch push tokens for all followers in parallel
  const userDocs = await Promise.all(
    followerIds.map((uid) => db.collection("users").doc(uid).get()),
  );

  // BUG 34: recipients = the author's followers (never the actor). The title is
  // the author's name and the body is the post text — both user content, left
  // as-is. Only the empty-post FALLBACK body is system copy → localized per
  // recipient via bodyKey (lang from the already-loaded follower doc).
  const notifications = [];
  for (const userDoc of userDocs) {
    if (!userDoc.exists) continue;
    const token = userDoc.data().pushToken;
    if (!token || !token.startsWith("ExponentPushToken[")) continue;
    const entry = {
      pushToken: token,
      uid: userDoc.id,
      title: authorName || "Someone",
      data: {type: "NEW_POST", postId: event.params.postId, authorId},
    };
    if (post.text) {
      entry.body = post.text.slice(0, 100); // user content
    } else {
      entry.lang = baseLang(userDoc.data().language);
      entry.bodyKey = "notifications.social.newPost.body";
    }
    notifications.push(entry);
  }

  if (notifications.length > 0) {
    await sendBatchPushNotifications(notifications);
  }
});

/**
 * Notify a user when someone starts following them.
 */
const onFollowCreated = onDocumentCreated("follows/{docId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const {followerId, followeeId} = data;
  if (!followerId || !followeeId) return;

  // Get follower's name
  const followerDoc = await db.collection("users").doc(followerId).get();
  if (!followerDoc.exists) return;
  const followerName = followerDoc.data().fullName || "Someone";

  // BUG 34: recipient = the FOLLOWED user (followeeId), never the actor.
  // key+params; English fallback from the catalog.
  const tk = "notifications.social.newFollower.title";
  const bk = "notifications.social.newFollower.body";
  const params = {name: followerName};

  // Write in-app notification. KIN-224: keep the id so tapping the push can
  // mark this same bubble read.
  const notifRef = await db.collection("notifications").add({
    userId: followeeId,
    type: "NEW_FOLLOWER",
    fromUserId: followerId,
    fromUserName: followerName,
    title: tPush(tk, "en", params),
    message: tPush(bk, "en", params),
    titleKey: tk,
    bodyKey: bk,
    params,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Send push to the followee if they have a token — lang read from the SAME doc.
  const followeeDoc = await db.collection("users").doc(followeeId).get();
  if (!followeeDoc.exists) return;
  const pushToken = followeeDoc.data().pushToken;
  if (pushToken && pushToken.startsWith("ExponentPushToken[")) {
    await sendBatchPushNotifications([
      {
        pushToken,
        uid: followeeId,
        lang: baseLang(followeeDoc.data().language),
        titleKey: tk,
        bodyKey: bk,
        params,
        data: {
          type: "NEW_FOLLOWER",
          fromUserId: followerId,
          notificationId: notifRef.id,
        },
      },
    ]);
  }
});

module.exports = {onPostLikeWritten, onPostCommentWritten, onPostCreated, onFollowCreated};
