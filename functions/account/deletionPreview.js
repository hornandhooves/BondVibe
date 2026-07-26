/**
 * KIN-108 phase 1 (Rev. 2.1) — previewDeletionImpact.
 *
 * READ-ONLY. Does not block, does not delete, does not touch money. It exists
 * so a client confirmation screen (KIN-111) can show the real radius of
 * impact ("you're about to cancel 3 events and refund $4,850 MXN to 12
 * people") before a user confirms account deletion, and so the settlement
 * queue (KIN-108's second PR, NOT this one) knows what it has to reconcile.
 *
 * Formerly checkOpenObligations (PR #97) — that version returned a `blocked`
 * boolean and was wired into deleteUserAccount as a 409 gate. Per Carlos's
 * 2026-07-25 product decision (KIN-108 comment 10038) that policy is dead:
 * deletion is never rejected. This module only detects; deleteUserAccount no
 * longer calls it.
 *
 * Every query here is paginated with a cursor and capped — this will be
 * called from the client's confirmation screen, so a single unbounded
 * collection .get() is not acceptable (QA review, KIN-108 comment 10039).
 * When a category's page cap is reached, its partial count is still
 * returned (never invented as zero) and that category's own `truncated`
 * flag is set (per-category, not a single root-level flag — a truncated
 * `pendingSettlement` must not read as if `memberships` were also unreliable).
 *
 * OVERLAP WARNING: futureEvents.amountMinor is an independent ESTIMATE
 * (price × participantCount) computed straight off the event doc, not
 * derived from escrow. It is NOT additive with pendingSettlement/
 * pendingGifts — an event ticket sold via Stripe shows up in BOTH
 * futureEvents (as an estimate) AND pendingSettlement (as the real ledger
 * amount) for the same sale. Summing all amountMinor fields double-counts
 * every Stripe-paid future event. futureEvents exists ONLY to catch the
 * MercadoPago gap pendingSettlement structurally cannot see (see
 * futurePaidEvents below) — render it as its own line, never folded into a
 * grand total with the ledger-derived categories.
 */

const {FieldPath} = require("firebase-admin/firestore");
const {dateToMillis} = require("../stripe/escrow");

const PAGE_SIZE = 200;
const MAX_PAGES = 5; // caps a single sub-query at 1000 examined docs

// Dispute window: how long after a payout releases a Stripe transfer reversal
// is still realistically actionable. NOT a settlement-queue window (those —
// the 24h undo / 72h proximity exception — are KIN-108's second PR and are
// deliberately not implemented here). Config-driven from the first commit,
// same settings/payouts doc escrow.js already reads retentionHours from.
// NOTE: 120 days is a placeholder matching typical card-network chargeback
// limits — it is not a number given anywhere in KIN-108/KIN-111 and needs
// explicit product sign-off; flagged in the PR description, not silently
// assumed correct.
const DEFAULT_DISPUTE_WINDOW_DAYS = 120;

/**
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @return {Promise<number>} dispute window in days (>= 0)
 */
async function readDisputeWindowDays(db) {
  try {
    const snap = await db.collection("settings").doc("payouts").get();
    const raw = snap.exists ? snap.data().disputeWindowDays : undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DISPUTE_WINDOW_DAYS;
  } catch (e) {
    return DEFAULT_DISPUTE_WINDOW_DAYS;
  }
}

/**
 * Page through a query (already filtered, NOT yet ordered/limited) up to
 * MAX_PAGES of PAGE_SIZE, folding each doc through `reduce`. Ordered by
 * document id so pagination needs no extra field in the composite index.
 * @param {FirebaseFirestore.Query} baseQuery filtered query, no orderBy/limit
 * @param {function(*, FirebaseFirestore.QueryDocumentSnapshot): *} reduce fold step
 * @param {*} initial seed for `reduce`
 * @return {Promise<{result: *, truncated: boolean}>}
 */
async function paginate(baseQuery, reduce, initial) {
  let acc = initial;
  let last = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = baseQuery.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) acc = reduce(acc, doc);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break; // exhausted, no more pages exist
    if (page === MAX_PAGES - 1) truncated = true; // cap hit, more may remain
  }
  return {result: acc, truncated};
}

/** @return {{count: number, amountMinor: number}} a fresh zeroed bucket */
const zeroBucket = () => ({count: 0, amountMinor: 0});

/**
 * Escrow still pending settlement across a ledger collection (paymentLedger
 * or giftLedger), broken down by state so a client can render "$X not yet
 * paid out" vs. "$Y still reversible" vs. "$Z actively disputed"
 * differently. Inclusion criteria are UNCHANGED from the prior single-count
 * version — held always counts; released counts only if frozen or within
 * the dispute window. Only the classification changed: `frozen` takes
 * priority over `held`/`releasedReversible` for a row that is both (a
 * disputed-but-not-yet-released row is still money not paid out, but frozen
 * is the more urgent fact to surface) — every row that was counted before is
 * still counted now, just placed in a specific bucket.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} collectionName "paymentLedger" | "giftLedger"
 * @param {string} userId the hostUid being previewed
 * @param {number} disputeWindowDays dispute window, already resolved
 * @return {Promise<{count: number, amountMinor: number, byState: object, truncated: boolean}>}
 */
async function pendingEscrowInCollection(db, collectionName, userId, disputeWindowDays) {
  const now = Date.now();
  const windowMs = disputeWindowDays * 24 * 60 * 60 * 1000;
  const coll = db.collection(collectionName);

  const addTo = (acc, key, l) => {
    acc.byState[key].count++;
    acc.byState[key].amountMinor += l.grossAmount || 0;
    return acc;
  };
  const initial = () => ({
    byState: {held: zeroBucket(), releasedReversible: zeroBucket(), frozen: zeroBucket()},
  });

  const heldFold = (acc, doc) => {
    const l = doc.data();
    return addTo(acc, l.frozen === true ? "frozen" : "held", l);
  };
  const held = await paginate(
    coll.where("hostUid", "==", userId).where("state", "==", "held"),
    heldFold, initial(),
  );

  const releasedFold = (acc, doc) => {
    const l = doc.data();
    const releasedMs = l.releasedAt && l.releasedAt.toMillis ? l.releasedAt.toMillis() : NaN;
    const withinDisputeWindow = Number.isFinite(releasedMs) && (now - releasedMs) <= windowMs;
    if (l.frozen === true) return addTo(acc, "frozen", l);
    if (withinDisputeWindow) return addTo(acc, "releasedReversible", l);
    return acc;
  };
  const released = await paginate(
    coll.where("hostUid", "==", userId).where("state", "==", "released"),
    releasedFold, initial(),
  );

  const byState = {
    held: held.result.byState.held,
    releasedReversible: released.result.byState.releasedReversible,
    frozen: {
      count: held.result.byState.frozen.count + released.result.byState.frozen.count,
      amountMinor: held.result.byState.frozen.amountMinor + released.result.byState.frozen.amountMinor,
    },
  };
  const count = byState.held.count + byState.releasedReversible.count + byState.frozen.count;
  const amountMinor = byState.held.amountMinor + byState.releasedReversible.amountMinor +
    byState.frozen.amountMinor;

  return {count, amountMinor, byState, truncated: held.truncated || released.truncated};
}

/**
 * Future paid events with attendees, checked INDEPENDENTLY of paymentLedger.
 * MercadoPago ticket sales (mercadopago.js → roster.joinRosterTx) keep
 * participantCount current but never write to paymentLedger/escrow at all —
 * this is the only way to catch a sold-out future event paid via MP (verified
 * against mercadopago.js:158-164; QA review KIN-108 comment 10039 confirmed
 * this reasoning and asked it be kept intact, not "simplified" onto the
 * ledger). amountMinor here is an ESTIMATE (price × participantCount) — there
 * is no per-ticket amount to sum for MP sales precisely because they never
 * reach the ledger, so an exact total isn't obtainable from this collection.
 * See the module header for why this must not be summed with
 * pendingSettlement/pendingGifts.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId creatorId or businessOwnerUid being previewed
 * @return {Promise<{count: number, attendees: number, amountMinor: number, truncated: boolean}>}
 */
async function futurePaidEvents(db, userId) {
  const now = Date.now();
  const events = db.collection("events");
  const seen = new Set();
  const fold = (acc, doc) => {
    if (seen.has(doc.id)) return acc;
    seen.add(doc.id);
    const ev = doc.data();
    const startMs = dateToMillis(ev.date);
    const isFuture = Number.isFinite(startMs) && startMs >= now;
    const attendees = ev.participantCount || 0;
    const hasPrice = (ev.price || 0) > 0 || (ev.priceLocal || 0) > 0;
    if (isFuture && hasPrice && attendees > 0) {
      acc.count++;
      acc.attendees += attendees;
      acc.amountMinor += Math.round((ev.price || 0) * 100) * attendees;
    }
    return acc;
  };
  const initial = {count: 0, attendees: 0, amountMinor: 0};
  const byCreator = await paginate(
    events.where("creatorId", "==", userId), fold, initial);
  const byBizOwner = await paginate(
    events.where("businessOwnerUid", "==", userId), fold, byCreator.result);
  return {...byBizOwner.result, truncated: byCreator.truncated || byBizOwner.truncated};
}

/**
 * Active rentals (reserved = paid awaiting pickup; active = handed over
 * awaiting return) — vehicles.rentals ownerId or businessOwnerUid.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId ownerId or businessOwnerUid being previewed
 * @return {Promise<{count: number, truncated: boolean}>}
 */
async function activeRentals(db, userId) {
  const rentals = db.collection("rentals");
  const seen = new Set();
  const fold = (acc, doc) => {
    if (seen.has(doc.id)) return acc;
    seen.add(doc.id);
    const status = doc.data().status;
    if (status === "reserved" || status === "active") acc.count++;
    return acc;
  };
  const initial = {count: 0};
  const byOwner = await paginate(rentals.where("ownerId", "==", userId), fold, initial);
  const byBizOwner = await paginate(
    rentals.where("businessOwnerUid", "==", userId), fold, byOwner.result);
  return {...byBizOwner.result, truncated: byOwner.truncated || byBizOwner.truncated};
}

/**
 * Still-valid sold memberships — immediate/non-refundable, never touch
 * escrow (same status+expiresAt check the membership-join flow already
 * uses). Schema confirmed live: paymentWebhook.js:742 writes expiresAt as a
 * Timestamp + status:"active".
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId hostId being previewed
 * @return {Promise<{count: number, truncated: boolean}>}
 */
async function activeMemberships(db, userId) {
  const now = Date.now();
  const fold = (acc, doc) => {
    const m = doc.data();
    const exp = m.expiresAt && m.expiresAt.toMillis ? m.expiresAt.toMillis() : 0;
    if (m.status !== "cancelled" && exp > now) acc.count++;
    return acc;
  };
  const {result, truncated} = await paginate(
    db.collection("memberships").where("hostId", "==", userId), fold, {count: 0});
  return {...result, truncated};
}

/**
 * Active/upcoming paid service bookings, queried DIRECTLY (collectionGroup)
 * instead of only inferred via paymentLedger — a booking paid through a
 * route that skipped the ledger would otherwise be invisible (QA review,
 * KIN-108 comment 10039, finding 5). Bookings live at
 * businesses/{bizId}/bookings/{id} with ownerUid == businesses/{bizId}.ownerUid
 * (verified in index.js reserveServiceBooking) — a single equality filter,
 * no businessOwnerUid variant needed (a booking's owner IS the business
 * owner). Needs the bookings.ownerUid COLLECTION_GROUP fieldOverride in
 * firestore.indexes.json — single-field automatic indexes default to
 * COLLECTION scope only, NOT COLLECTION_GROUP, so without that override this
 * query fails against real data despite passing in the emulator.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId the business owner uid being previewed
 * @return {Promise<{count: number, amountMinor: number, truncated: boolean}>}
 */
async function activeBookings(db, userId) {
  const now = Date.now();
  const fold = (acc, doc) => {
    const b = doc.data();
    const startMs = dateToMillis(b.start);
    const isUpcoming = !Number.isFinite(startMs) || startMs >= now;
    const isActive = b.status === "reserved" || b.status === "confirmed";
    if (isActive && isUpcoming) {
      acc.count++;
      acc.amountMinor += b.totalCentavos || b.priceCents || 0;
    }
    return acc;
  };
  const {result, truncated} = await paginate(
    db.collectionGroup("bookings").where("ownerUid", "==", userId),
    fold, {count: 0, amountMinor: 0},
  );
  return {...result, truncated};
}

/**
 * Read-only radius-of-impact preview for deleting `userId`'s account. Never
 * blocks, never deletes, never touches money — purely informational, for a
 * client confirmation screen and for the (separate, not-yet-built) settlement
 * queue to know what it needs to reconcile. See the module header for the
 * futureEvents/pendingSettlement/pendingGifts overlap warning.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId the account being previewed for deletion
 * @return {Promise<object>} { futureEvents:{count,attendees,amountMinor,
 *   isEstimate,truncated}, pendingSettlement:{count,amountMinor,byState,
 *   truncated}, pendingGifts:{count,amountMinor,byState,truncated},
 *   bookings:{count,amountMinor,truncated}, activeRentals:{count,truncated},
 *   memberships:{count,truncated} } — no root-level `truncated`; each
 *   category carries its own.
 */
async function previewDeletionImpact(db, userId) {
  const disputeWindowDays = await readDisputeWindowDays(db);

  const [
    pendingSettlement, pendingGifts, events, rentals, memberships, bookings,
  ] = await Promise.all([
    pendingEscrowInCollection(db, "paymentLedger", userId, disputeWindowDays),
    pendingEscrowInCollection(db, "giftLedger", userId, disputeWindowDays),
    futurePaidEvents(db, userId),
    activeRentals(db, userId),
    activeMemberships(db, userId),
    activeBookings(db, userId),
  ]);

  return {
    futureEvents: {
      count: events.count,
      attendees: events.attendees,
      amountMinor: events.amountMinor,
      isEstimate: true,
      truncated: events.truncated,
    },
    pendingSettlement: {
      count: pendingSettlement.count,
      amountMinor: pendingSettlement.amountMinor,
      byState: pendingSettlement.byState,
      truncated: pendingSettlement.truncated,
    },
    pendingGifts: {
      count: pendingGifts.count,
      amountMinor: pendingGifts.amountMinor,
      byState: pendingGifts.byState,
      truncated: pendingGifts.truncated,
    },
    bookings: {
      count: bookings.count, amountMinor: bookings.amountMinor, truncated: bookings.truncated,
    },
    activeRentals: {count: rentals.count, truncated: rentals.truncated},
    memberships: {count: memberships.count, truncated: memberships.truncated},
  };
}

module.exports = {previewDeletionImpact, readDisputeWindowDays, DEFAULT_DISPUTE_WINDOW_DAYS};
