#!/usr/bin/env node
/**
 * KIN-275 seed — e2e-service-pay.yaml. Ensures ONE public, paid, slot-based
 * marketplace listing exists and sorts FIRST across the collectionGroup
 * `sessionTypes` query, so `service-listing-card-0` lands on our fixture.
 *
 * SAME heuristic and SAME risk as e2e-seed-rental-pay.mjs — read that file's
 * header before touching this one. getMarketplaceListings
 * (src/services/marketplaceService.js:37-39) has NO orderBy either.
 *
 * ONE DIFFERENCE FROM rental-pay: this is a collectionGroup query. Without an
 * explicit orderBy, ordering is unspecified — but if this script instead
 * self-checks via orderBy(documentId()), Firestore compares the FULL document
 * PATH ("businesses/{bizId}/sessionTypes/{id}"), so the bizId segment sorts
 * before the sessionType id segment. Both are given the "00_" prefix here so
 * the heuristic has its best shot either way.
 *
 * Admin SDK bypasses firestore.rules, so no parent businesses/{bizId} doc is
 * required to exist for this write. It's also not required for reads: per
 * businessSessionsService.js's bizDenorm() comment (KIN-92), businessName/
 * businessVerified are denormalized onto the sessionType doc itself — the
 * marketplace list/detail screens never read businesses/{bizId} directly.
 * locationMode is kept "at_business" (not "at_customer") specifically to
 * avoid firestore.rules' bizVerifiedInsured(bizId) gate, which would require
 * a real verified+insured business doc.
 *
 * BREAKS SILENTLY THE DAY KIN-185 (Featured Services) or an explicit
 * alphabetical/price orderBy ships — see the KIN-275 + KIN-185 comments
 * (13-sep-2026). Migrate to that real field then.
 *
 * Every doc: qaSeed:"KIN275-SERVICE-PAY". Cleanup target:
 * scripts/e2e-cleanup-service-pay.mjs.
 *
 * Run: GOOGLE_CLOUD_PROJECT=kinlo-app-dev node scripts/e2e-seed-service-pay.mjs
 */
import admin from "firebase-admin";

admin.initializeApp({ projectId: "kinlo-app-dev" });
const db = admin.firestore();

const QA_SEED = "KIN275-SERVICE-PAY";
const ID_PREFIX = "00_qa275sp_";

(async () => {
  const stamp = Date.now();
  const bizId = `${ID_PREFIX}biz_${stamp}`;
  const sessionTypeId = `${ID_PREFIX}svc_${stamp}`;
  const fullPath = `businesses/${bizId}/sessionTypes/${sessionTypeId}`;

  const lowestSnap = await db
    .collectionGroup("sessionTypes")
    .where("publicListing", "==", true)
    .orderBy(admin.firestore.FieldPath.documentId(), "asc")
    .limit(1)
    .get();

  if (!lowestSnap.empty && lowestSnap.docs[0].ref.path < fullPath) {
    console.error(
      `ABORT: an existing public listing (${lowestSnap.docs[0].ref.path}) already sorts ` +
        `before our fixture path (${fullPath}). See e2e-seed-rental-pay.mjs's header for ` +
        `why — same heuristic, same limit reached.`,
    );
    process.exit(1);
  }

  await db
    .collection("businesses")
    .doc(bizId)
    .collection("sessionTypes")
    .doc(sessionTypeId)
    .set({
      qaSeed: QA_SEED,
      name: "QA275 Service Fixture",
      capacityMax: 1,
      durationMin: 60,
      priceCents: 30000,
      description: "Fixture desechable para e2e-service-pay.yaml.",
      publicListing: true,
      vertical: "beauty",
      locationMode: "at_business",
      bookingMode: "slot",
      photos: [],
      city: "tulum",
      planPackageId: null,
      businessName: "QA275 Fixture Business",
      businessVerified: false,
      createdAt: admin.firestore.Timestamp.now(),
    });

  console.log(JSON.stringify({ bizId, sessionTypeId, fullPath }, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
