#!/usr/bin/env node
/**
 * Migrate packages + membershipPlans → the unified businesses/{bizId}/plans.
 *
 * ADDITIVE AND NON-DESTRUCTIVE, on purpose:
 *   - It only ever CREATES docs in `plans`. The source collections are left
 *     exactly as they are, so the old screens keep working until they're gone
 *     and a bad run is undone by deleting `plans`, not by restoring anything.
 *   - Nobody's activePackage is touched. Those reference a package by id and are
 *     the member's actual entitlement — rewriting them is how people lose credits
 *     they paid for. The plan doc records `migratedFrom` so a plan can be traced
 *     back to what it came from.
 *
 * The channel is the only thing being inferred, and it's inferable exactly
 * because the split WAS the channel:
 *   - packages         → paymentModes: ['manual']  (they were assigned by hand)
 *   - membershipPlans  → paymentModes: ['online']  (they were sold via Stripe)
 *
 * DRY RUN BY DEFAULT. `--apply` writes. Per CLAUDE.md §2 this is not to be run
 * against kinlo-app-dev until the new screens are verified in a build — a plan
 * that exists before the UI can edit it is just an orphan.
 *
 * Usage:
 *   node scripts/migrate-plans.mjs                 # dry run, prints the diff
 *   node scripts/migrate-plans.mjs --apply         # writes
 *   node scripts/migrate-plans.mjs --biz <bizId>   # limit to one business
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const bizFlag = process.argv.indexOf("--biz");
const ONLY_BIZ = bizFlag > -1 ? process.argv[bizFlag + 1] : null;
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./kinlo-app-dev-fcm-sa.json";

const sa = JSON.parse(readFileSync(KEY, "utf8"));
if (sa.project_id !== "kinlo-app-dev") {
  // The dead bondvibe-dev key used to sit in this same directory. Refuse rather
  // than migrate someone else's project.
  console.error(`Refusing to run: key is for "${sa.project_id}", expected kinlo-app-dev.`);
  process.exit(1);
}
initializeApp({ credential: cert(sa) });
const db = getFirestore();

/**
 * Keep every field the runtime already reads; only add the channel.
 *
 * The two sources don't share a vocabulary — packages say credits/priceCents and
 * carry `kind`; membershipPlans say creditsIncluded/priceCentavos and carry
 * `type` (always CREDITS). Reading only one set would migrate plans with a null
 * price and no credits: products that look fine in a list and are broken the
 * moment anyone buys one.
 */
const toPlan = (src, paymentModes, from) => ({
  name: src.name ?? "",
  // membershipPlans have no kind — they were always credit bundles.
  kind: src.kind ?? "class",
  credits: src.credits ?? src.creditsIncluded ?? null,
  unlimited: src.unlimited === true,
  validityDays: src.validityDays ?? null,
  priceCents: src.priceCents ?? src.priceCentavos ?? 0,
  audienceTier: src.audienceTier ?? "both",
  description: src.description ?? "",
  terms: src.terms ?? "",
  active: src.active !== false,
  paymentModes,
  // Off unless a host turns it on per plan — never inferred from old data.
  loyaltyReward: null,
  migratedFrom: from, // { collection, id } — the audit trail back to the source
  createdAt: src.createdAt ?? new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const summary = { businesses: 0, packages: 0, membershipPlans: 0, skipped: 0 };

/**
 * One audit line per doc: source → dest, and the exact field mapping that mattered
 * when it silently went wrong before (credits/price, whose field names differ
 * between the two sources). This is what a human reads before --apply to confirm
 * the real "10" package maps the way they expect.
 */
function auditLine(src, plan, from) {
  const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
  const creditsFrom =
    src.credits != null ? "credits" : src.creditsIncluded != null ? "creditsIncluded" : "(none)";
  const priceFrom =
    src.priceCents != null ? "priceCents" : src.priceCentavos != null ? "priceCentavos" : "(none)";
  return (
    `      credits: ${plan.unlimited ? "unlimited" : plan.credits} (from ${creditsFrom})` +
    ` · price: ${money(plan.priceCents)} (from ${priceFrom})` +
    ` · validity: ${plan.validityDays ?? "—"}d · audience: ${plan.audienceTier}`
  );
}

const alreadyMigrated = async (bizId, from) => {
  const dupe = await db
    .collection("businesses").doc(bizId).collection("plans")
    .where("migratedFrom.collection", "==", from.collection)
    .where("migratedFrom.id", "==", from.id)
    .limit(1)
    .get();
  return !dupe.empty; // idempotent: re-running must not duplicate anyone's plans
};

const write = async (bizId, plan) => {
  if (!APPLY) return;
  await db.collection("businesses").doc(bizId).collection("plans").add(plan);
};

const bizSnap = ONLY_BIZ
  ? [await db.collection("businesses").doc(ONLY_BIZ).get()]
  : (await db.collection("businesses").get()).docs;

for (const biz of bizSnap) {
  if (!biz.exists) continue;
  summary.businesses++;
  const bizId = biz.id;

  // packages → manual
  const pkgs = await db.collection("businesses").doc(bizId).collection("packages").get();
  for (const p of pkgs.docs) {
    const from = { collection: "packages", id: p.id };
    if (await alreadyMigrated(bizId, from)) { summary.skipped++; continue; }
    // Build once, then log exactly what gets written.
    const plan = toPlan(p.data(), ["manual"], from);
    console.log(`  ${bizId} · packages/${p.id} "${p.data().name}" → plans [manual]`);
    console.log(auditLine(p.data(), plan, from));
    await write(bizId, plan);
    summary.packages++;
  }

  // membershipPlans → online.
  //
  // A ROOT collection with no bizId: a plan is tied to a person, via hostId, and
  // businessOwnerUid when staff created it on the owner's behalf. Since
  // bizId === ownerUid (v1, CLAUDE.md §2), the business's own id is what those
  // fields hold. Querying `bizId` would have matched nothing and reported a
  // clean run — a silent no-op that reads as success.
  const byOwner = await db.collection("membershipPlans").where("businessOwnerUid", "==", bizId).get();
  const byHost = await db.collection("membershipPlans").where("hostId", "==", bizId).get();
  // A staff-created plan matches BOTH queries; de-dupe by doc id.
  const mps = new Map();
  [...byOwner.docs, ...byHost.docs].forEach((d) => mps.set(d.id, d));

  for (const m of mps.values()) {
    // Skip a plan whose businessOwnerUid points elsewhere: hostId matched, but
    // it belongs to that owner's business, and they'll get it in their own pass.
    const owner = m.data().businessOwnerUid;
    if (owner && owner !== bizId) { summary.skipped++; continue; }

    const from = { collection: "membershipPlans", id: m.id };
    if (await alreadyMigrated(bizId, from)) { summary.skipped++; continue; }
    const plan = toPlan(m.data(), ["online"], from);
    console.log(`  ${bizId} · membershipPlans/${m.id} "${m.data().name}" → plans [online]`);
    console.log(auditLine(m.data(), plan, from));
    await write(bizId, plan);
    summary.membershipPlans++;
  }
}

console.log(
  `\n${APPLY ? "APPLIED" : "DRY RUN — nothing written"}: ` +
  `${summary.businesses} businesses · ${summary.packages} packages → manual · ` +
  `${summary.membershipPlans} membershipPlans → online · ${summary.skipped} already migrated`
);
if (!APPLY) {
  console.log("Re-run with --apply to write. Sources are never modified.");
} else {
  // The fallback stops firing the moment this succeeds, which means it will look
  // harmless forever while keeping a dead read alive. Say so here, because this
  // is the one moment someone is looking.
  console.log(
    "\nNEXT: remove the transitional fallback in src/screens/HostMembershipsScreen.js\n" +
    "      (grep TRANSITIONAL — REMOVE AFTER PLANS MIGRATION). It reads the legacy\n" +
    "      membershipPlans only while `plans` is empty — which is no longer true."
  );
}
