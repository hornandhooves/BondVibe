#!/usr/bin/env node
/**
 * KIN-275 cleanup — sweeps everything e2e-wall-post-follow.yaml touches:
 *   1. users/{targetUid} — the qaSeed-tagged QA follow target this script seeded.
 *   2. follows/{hostUid}_{targetUid} — written live by followUser()
 *      (followService.js:21-32) when the flow taps Follow. Doc id is
 *      deterministic ({followerId}_{followeeId}), so no qaSeed tag needed to
 *      find it — same "found by parentage" pattern as roster/
 *      membershipReservations in the other cleanup scripts.
 *   3. posts where authorId==hostUid AND text=="Hello from Maestro e2e" — the
 *      exact literal the flow types (createPost, postService.js:80). Not
 *      tagged with qaSeed (the app writes it), matched by exact content
 *      instead — this text string is unique to this fixture and must stay in
 *      sync with .maestro/e2e-wall-post-follow.yaml's inputText.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev KINLO_EMAIL=<host email> \
 *   node scripts/e2e-cleanup-wall-post-follow.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();
const auth = admin.auth();

const QA_SEED = "KIN275-WALL-POST-FOLLOW";
const POST_TEXT = "Hello from Maestro e2e";

const hostEmail = process.env.KINLO_EMAIL;
if (!hostEmail) {
  console.error("ABORT: KINLO_EMAIL env var not set — need it to find the follow doc + post.");
  process.exit(1);
}

(async () => {
  const hostUid = (await auth.getUserByEmail(hostEmail)).uid;

  const targets = await db.collection("users").where("qaSeed", "==", QA_SEED).get();
  const posts = await db
    .collection("posts")
    .where("authorId", "==", hostUid)
    .where("text", "==", POST_TEXT)
    .get();

  const followRefs = targets.docs.map((d) => db.collection("follows").doc(`${hostUid}_${d.id}`));
  const followSnaps = await Promise.all(followRefs.map((r) => r.get()));
  const existingFollows = followSnaps.filter((s) => s.exists);

  console.log(
    "antes:",
    JSON.stringify({ users: targets.size, follows: existingFollows.length, posts: posts.size }),
  );

  for (const d of targets.docs) await d.ref.delete();
  for (const s of existingFollows) await s.ref.delete();
  for (const d of posts.docs) await d.ref.delete();

  const afterTargets = await db.collection("users").where("qaSeed", "==", QA_SEED).get();
  const afterPosts = await db
    .collection("posts")
    .where("authorId", "==", hostUid)
    .where("text", "==", POST_TEXT)
    .get();
  const afterFollowSnaps = await Promise.all(followRefs.map((r) => r.get()));
  const afterFollows = afterFollowSnaps.filter((s) => s.exists).length;

  console.log(
    "después:",
    JSON.stringify({ users: afterTargets.size, follows: afterFollows, posts: afterPosts.size }),
  );
  console.log(
    afterTargets.size + afterFollows + afterPosts.size === 0 ? "LIMPIEZA COMPLETA" : "QUEDAN RESTOS",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
