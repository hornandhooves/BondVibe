// backfill-business-public-profile.js — one-off.
// KIN-97: seeds businesses/{bizId}/public/profile for businesses that existed
// before the onBusinessPublicProfileWritten trigger. New/updated businesses
// get it automatically from the trigger; this covers the backlog. Idempotente:
// re-correrlo salta los negocios que ya tienen el sub-doc.
//   cd ~/bondvibe/functions && GOOGLE_CLOUD_PROJECT=kinlo-app-dev node backfill-business-public-profile.js
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

(async () => {
  const snap = await db.collection("businesses").get();
  let scanned = 0;
  let patched = 0;
  for (const bizSnap of snap.docs) {
    scanned++;
    const profileRef = bizSnap.ref.collection("public").doc("profile");
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) continue;

    const d = bizSnap.data();
    await profileRef.set({
      name: d.name || "",
      verified: d.verified === true,
      avatarUrl: d.avatarUrl || null,
      vertical: d.vertical || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    patched++;
  }
  console.log(`DONE. scanned=${scanned} patched=${patched}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
