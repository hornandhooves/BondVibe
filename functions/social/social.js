/**
 * Social layer — server-maintained aggregate counts.
 *
 * likeCount / commentCount on a post are written only here (Admin SDK), so
 * clients can't inflate them (rules block client writes to those fields).
 */
const {onDocumentWritten, onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const {sendBatchPushNotifications} = require("../notifications/pushService");

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

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

  const notifications = [];
  for (const userDoc of userDocs) {
    if (!userDoc.exists) continue;
    const token = userDoc.data().pushToken;
    if (!token || !token.startsWith("ExponentPushToken[")) continue;
    notifications.push({
      pushToken: token,
      title: authorName || "Someone",
      body: post.text
        ? post.text.slice(0, 100)
        : "shared a new post",
      data: {type: "NEW_POST", postId: event.params.postId, authorId},
    });
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

  // Write in-app notification
  await db.collection("notifications").add({
    userId: followeeId,
    type: "NEW_FOLLOWER",
    fromUserId: followerId,
    fromUserName: followerName,
    message: `${followerName} started following you`,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Send push notification to followee if they have a token
  const followeeDoc = await db.collection("users").doc(followeeId).get();
  if (!followeeDoc.exists) return;
  const pushToken = followeeDoc.data().pushToken;
  if (pushToken && pushToken.startsWith("ExponentPushToken[")) {
    await sendBatchPushNotifications([
      {
        pushToken,
        title: "New follower",
        body: `${followerName} started following you`,
        data: {type: "NEW_FOLLOWER", fromUserId: followerId},
      },
    ]);
  }
});

module.exports = {onPostLikeWritten, onPostCommentWritten, onPostCreated, onFollowCreated};
