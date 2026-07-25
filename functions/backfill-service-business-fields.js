// backfill-service-business-fields.js — one-off.
// KIN-92: denormaliza businessName/businessVerified en los docs de sessionTypes
// existentes (creados antes del fix), para que ServiceDetailScreen deje de
// necesitar un read directo de businesses/{bizId} — ese doc es staff/owner-only
// en firestore.rules, así que cualquier otro cliente firmado recibía un
// permission-denied sin manejar que dejaba el spinner de detalle colgado para
// siempre. Idempotente: re-correrlo salta los docs que ya tienen el campo.
//   cd ~/bondvibe/functions && GOOGLE_CLOUD_PROJECT=kinlo-app-dev node backfill-service-business-fields.js
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

(async () => {
  const snap = await db.collectionGroup("sessionTypes").get();
  const bizCache = new Map();
  let scanned = 0;
  let patched = 0;
  for (const docSnap of snap.docs) {
    scanned++;
    if (docSnap.get("businessName") !== undefined) continue;
    const bizId = docSnap.ref.parent.parent.id;
    if (!bizCache.has(bizId)) {
      const bizSnap = await db.collection("businesses").doc(bizId).get();
      bizCache.set(bizId, bizSnap.exists ? bizSnap.data() : {});
    }
    const biz = bizCache.get(bizId);
    await docSnap.ref.set(
      {businessName: biz.name || "", businessVerified: biz.verified === true},
      {merge: true},
    );
    patched++;
  }
  console.log(`DONE. scanned=${scanned} patched=${patched}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
