#!/usr/bin/env node
/**
 * KIN-275 seed — e2e-join-event.yaml. Seeds ONE free, upcoming, publicly
 * listed event that must land as the FIRST result in Events -> Discover
 * search (SearchEventsScreen.js: server query is
 * where(date >= todayStart) + orderBy(date, "asc"), no default city/category
 * filter). "First" means earliest `date` among all upcoming events — so this
 * script reads the current earliest upcoming event before picking a date,
 * instead of guessing a fixed offset.
 *
 * Every doc: qaSeed:"KIN275-JOIN-EVENT", id prefix qa275je_. Cleanup target:
 * scripts/e2e-cleanup-join-event.mjs.
 *
 * COLLISION WARNING: e2e-seed-membership-redeem.mjs also seeds an event and
 * also needs to be the earliest upcoming event, for the same search screen.
 * Running both seeds' full cycles (seed -> maestro -> cleanup) concurrently
 * will race for the "first result" slot and make one of the two flows flaky.
 * In .eas/workflows/e2e-full.yml these two flows' jobs must be chained
 * (membership-redeem's seed job `needs` join-event's cleanup job), not left
 * parallel like the other independent jobs.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-seed-join-event.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

const QA_SEED = "KIN275-JOIN-EVENT";
const stamp = Date.now();
const hostId = `qa275je_host_${stamp}`;
const eventId = `qa275je_evt_${stamp}`;

const MIN_LEAD_MINUTES = 2; // don't seed something already "about to start"

(async () => {
  // Read the current earliest upcoming event (same query SearchEventsScreen
  // runs) so we know what "first result" actually requires today, instead of
  // assuming a fixed lead time is enough.
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
      // The real earliest upcoming event is already inside our minimum lead
      // window — there is no safe gap to seed into without risking a race
      // against something that might start any second. Fail loud instead of
      // seeding a fixture that silently loses the ordering race.
      console.error(
        `ABORT: existing earliest upcoming event (${earliestSnap.docs[0].id}) starts at ` +
          `${earliestSnap.docs[0].data().date}, less than ${MIN_LEAD_MINUTES}min from now. ` +
          `No safe gap to seed the "first result" fixture. Retry in a few minutes.`,
      );
      process.exit(1);
    }
    // Sit comfortably before the current earliest, but never before our own
    // minimum lead time.
    startsAtMs = Math.min(startsAtMs, existingEarliest - 60 * 1000);
  }

  const startsAt = new Date(startsAtMs);

  await db.collection("events").doc(eventId).set({
    qaSeed: QA_SEED,
    title: "QA275 evento gratis (join)",
    description: "Fixture desechable para e2e-join-event.yaml.",
    creatorId: hostId,
    date: startsAt.toISOString(),
    durationMinutes: 60,
    status: "active",
    price: 0,
    maxAttendees: 20,
    participantCount: 0,
    city: "tulum",
    category: "social",
    listedPublicly: true, // MUST be discoverable — opposite of the KIN-212 fixture
    createdAt: Timestamp.now(),
  });

  console.log(
    JSON.stringify({ eventId, hostId, startsAt: startsAt.toISOString() }, null, 1),
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
