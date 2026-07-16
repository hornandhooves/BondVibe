/**
 * Wall v2 · Moments purge (P3). Ephemeral 24h media is deleted SERVER-SIDE — not
 * merely hidden by the client. Runs hourly over the `items` collection group and
 * removes anything past its expiresAt. (A native Firestore TTL policy on
 * items.expiresAt can replace this later; the scheduled purge guarantees
 * deletion regardless.)
 */
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const db = admin.firestore();

const purgeExpiredMoments = onSchedule(
  {schedule: "every 1 hours"},
  async () => {
    const now = admin.firestore.Timestamp.now();
    const snap = await db
      .collectionGroup("items")
      .where("expiresAt", "<", now)
      .limit(400)
      .get();
    if (snap.empty) {
      console.log("moments purge: nothing expired");
      return;
    }
    let deleted = 0;
    let batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
      deleted++;
      if (deleted % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    await batch.commit();
    console.log(`moments purge: deleted ${deleted}`);
  },
);

module.exports = {purgeExpiredMoments};
