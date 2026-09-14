#!/usr/bin/env node
/**
 * KIN-275 seed — e2e-dm-send.yaml. Ensures the test user (KINLO_EMAIL) has at
 * least one 1:1 DM thread, and that it is the MOST RECENT (so it sorts first
 * in InboxScreen's list — getMyThreads orderBy("updatedAt","desc"),
 * src/services/dmService.js:52).
 *
 * UNLIKE rental-pay/service-pay: this DOES have a real orderBy field
 * (updatedAt), so this uses the same self-check pattern as
 * e2e-seed-join-event.mjs instead of the ID-prefix heuristic — no
 * [Assumption] risk here, this is deterministic.
 *
 * threadId must be the canonical sorted-uid-pair id firestore.rules enforces
 * (firestore.rules:986-994: users[0] < users[1], threadId ==
 * users[0]+'_'+users[1]) — built the same way dmService.threadIdFor() does.
 * The "other" participant does not need a real Firebase Auth account:
 * InboxScreen.js:92 reads users/{otherUid} for display name/avatar but
 * defaults to a generic name if the doc is missing (InboxScreen.js:94-97) —
 * this script still seeds a minimal users/{otherUid} doc for hygiene and
 * clean ownership, not because the flow requires it.
 *
 * Every doc: qaSeed:"KIN275-DM-SEND". Cleanup target:
 * scripts/e2e-cleanup-dm-send.mjs.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev KINLO_EMAIL=<host email> \
 *   node scripts/e2e-seed-dm-send.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();
const auth = admin.auth();
const { Timestamp } = admin.firestore;

const QA_SEED = "KIN275-DM-SEND";

const myEmail = process.env.KINLO_EMAIL;
if (!myEmail) {
  console.error("ABORT: KINLO_EMAIL env var not set — need it to resolve the test user's uid.");
  process.exit(1);
}

(async () => {
  const myUid = (await auth.getUserByEmail(myEmail)).uid;
  const stamp = Date.now();
  const otherUid = `qa275ds_other_${stamp}`;
  const users = [myUid, otherUid].sort();
  const threadId = users.join("_");

  const mostRecentSnap = await db
    .collection("dms")
    .where("users", "array-contains", myUid)
    .orderBy("updatedAt", "desc")
    .limit(1)
    .get();

  const now = Timestamp.now();
  if (!mostRecentSnap.empty && mostRecentSnap.docs[0].data().updatedAt.toMillis() >= now.toMillis()) {
    console.error(
      `ABORT: an existing thread (${mostRecentSnap.docs[0].id}) has updatedAt in the future ` +
        `relative to now — cannot guarantee our fixture sorts first. Investigate that thread ` +
        `before retrying.`,
    );
    process.exit(1);
  }

  await db.collection("users").doc(otherUid).set({
    qaSeed: QA_SEED,
    role: "user",
    fullName: "QA275 DM Fixture",
  });

  await db.collection("dms").doc(threadId).set({
    qaSeed: QA_SEED,
    users,
    createdAt: now,
    updatedAt: now,
    lastMessage: "",
  });

  console.log(JSON.stringify({ threadId, myUid, otherUid }, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
