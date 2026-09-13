#!/usr/bin/env node
/**
 * KIN-275 seed — e2e-membership-redeem.yaml. Adapts the already-verified
 * kin212_smoke_seed.mjs pattern (membershipService.js reserveMembershipCredit
 * reads memberships by (userId, hostId), not a plan catalogue — a plan
 * document is not required for the reserve path this flow executes).
 *
 * Two differences from the KIN-212 fixture:
 *   1. listedPublicly:true here (KIN-212 deliberately used false — that test
 *      opened the event by direct id, this flow finds it via Search).
 *   2. memberUid is resolved from KINLO_EMAIL via Admin Auth
 *      (auth.getUserByEmail) instead of a CLI argument — this runs
 *      unattended in an EAS custom job, no one is there to pass an argv.
 *
 * SAME "first search result" requirement and the SAME collision risk as
 * e2e-seed-join-event.mjs — read that file's header before touching the
 * workflow's job graph. This script also self-checks against the current
 * earliest upcoming event and aborts loud rather than seeding a fixture that
 * loses the ordering race.
 *
 * Every doc: qaSeed:"KIN275-MEMBERSHIP-REDEEM", id prefix qa275mr_. Cleanup
 * target: scripts/e2e-cleanup-membership-redeem.mjs.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev KINLO_EMAIL=<host email> \
 *   node scripts/e2e-seed-membership-redeem.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();
const auth = admin.auth();
const { Timestamp } = admin.firestore;

const QA_SEED = "KIN275-MEMBERSHIP-REDEEM";
const MIN_LEAD_MINUTES = 2;

const memberEmail = process.env.KINLO_EMAIL;
if (!memberEmail) {
  console.error("ABORT: KINLO_EMAIL env var not set — need it to resolve the member's uid.");
  process.exit(1);
}

(async () => {
  const memberUid = (await auth.getUserByEmail(memberEmail)).uid;

  const nowIso = new Date().toISOString();
  const earliestSnap = await db
    .collection("events")
    .where("date", ">=", nowIso)
    .orderBy("date", "asc")
    .limit(1)
    .get();

  const now = Date.now();
  let startsAtMs = now + MIN_LEAD_MINUTES * 60 * 1000;

  if (!earliestSnap.empty) {
    const existingEarliest = new Date(earliestSnap.docs[0].data().date).getTime();
    if (existingEarliest - now < MIN_LEAD_MINUTES * 60 * 1000) {
      console.error(
        `ABORT: existing earliest upcoming event (${earliestSnap.docs[0].id}) starts at ` +
          `${earliestSnap.docs[0].data().date}, less than ${MIN_LEAD_MINUTES}min from now. ` +
          `No safe gap to seed the "first result" fixture. Retry in a few minutes, and make ` +
          `sure e2e-seed-join-event.mjs's own fixture was already cleaned up first — these ` +
          `two flows must not have live events seeded at the same time (see header note).`,
      );
      process.exit(1);
    }
    startsAtMs = Math.min(startsAtMs, existingEarliest - 60 * 1000);
  }

  const startsAt = new Date(startsAtMs);
  const stamp = Date.now();
  const hostId = `qa275mr_host_${stamp}`;
  const eventId = `qa275mr_evt_${stamp}`;
  const membershipId = `qa275mr_mem_${stamp}`;

  await db.collection("events").doc(eventId).set({
    qaSeed: QA_SEED,
    title: "QA275 clase con membresía",
    description: "Fixture desechable para e2e-membership-redeem.yaml.",
    creatorId: hostId,
    date: startsAt.toISOString(),
    durationMinutes: 60,
    status: "active",
    acceptsMembership: true,
    creditCost: 1,
    price: 0,
    maxAttendees: 20,
    participantCount: 0,
    city: "tulum",
    category: "sports",
    listedPublicly: true, // discoverable via Search — unlike the KIN-212 fixture
    createdAt: Timestamp.now(),
  });

  await db.collection("memberships").doc(membershipId).set({
    qaSeed: QA_SEED,
    userId: memberUid,
    hostId,
    type: "credits",
    status: "active",
    creditsRemaining: 3,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 864e5)),
    createdAt: Timestamp.now(),
  });

  console.log(
    JSON.stringify(
      { eventId, membershipId, hostId, memberUid, startsAt: startsAt.toISOString() },
      null,
      1,
    ),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
