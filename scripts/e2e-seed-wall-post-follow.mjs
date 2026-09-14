#!/usr/bin/env node
/**
 * KIN-275 seed — e2e-wall-post-follow.yaml. Ensures a dedicated, findable QA
 * target user exists to follow — NOT a real kinlo-app-dev account.
 *
 * WHY A DEDICATED USER (Carlos, 13-sep-2026): the flow searches "Find people"
 * and follows whatever the query matches. searchUsers() (userService.js:31-32)
 * range-queries handleLower by prefix and requires >= 2 chars — the flow
 * originally typed "a" (1 char), which never even calls searchUsers (returns
 * [] before the Firestore read). Fixed in the SAME change as this script:
 * .maestro/e2e-wall-post-follow.yaml now types "qa275" instead of "a" — a
 * prefix unique to this session's qa275* fixture convention, so the search
 * can only match our seeded user, never a real person's account (following/
 * unfollowing a stranger from an automated test would pollute their real
 * social graph).
 *
 * `user-search-result` (UserSearchField.js:67) is a LITERAL testID, not
 * indexed — every result row carries the same id, so Maestro taps whichever
 * renders first. Since "qa275" should match only this one seeded user, that
 * ambiguity is moot in practice.
 *
 * Every doc: qaSeed:"KIN275-WALL-POST-FOLLOW". Cleanup target:
 * scripts/e2e-cleanup-wall-post-follow.mjs (also sweeps the post + follow doc
 * the flow itself creates live).
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-seed-wall-post-follow.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();

const QA_SEED = "KIN275-WALL-POST-FOLLOW";

(async () => {
  const stamp = Date.now();
  const targetUid = `qa275wf_target_${stamp}`;
  const handle = `qa275wf${stamp}`;

  await db.collection("users").doc(targetUid).set({
    qaSeed: QA_SEED,
    role: "user",
    fullName: "QA275 Wall Follow Target",
    handle,
    handleLower: handle.toLowerCase(),
    avatar: null,
    city: null,
  });

  console.log(JSON.stringify({ targetUid, handle }, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
