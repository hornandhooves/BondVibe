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
 * returned (never invented as zero) and `truncated` is set on the overall
 * result.
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

/**
 * Held escrow across a ledger collection (paymentLedger or giftLedger).
 * "held" always counts (money not paid out yet). "released" only counts if
 * still frozen (active dispute) or within the dispute window — otherwise
 * it's settled and no longer this account's problem.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} collectionName "paymentLedger" | "giftLedger"
 * @param {string} userId the hostUid being previewed
 * @param {number} disputeWindowDays dispute window, already resolved
 * @return {Promise<{count: number, amountMinor: number, truncated: boolean}>}
 */
async function heldEscrowInCollection(db, collectionName, userId, disputeWindowDays) {
  const now = Date.now();
  const windowMs = disputeWindowDays * 24 * 60 * 60 * 1000;
  const coll = db.collection(collectionName);

  const fold = (acc, doc) => {
    const l = doc.data();
    acc.count++;
    acc.amountMinor += l.grossAmount || 0;
    return acc;
  };

  const held = await paginate(
    coll.where("hostUid", "==", userId).where("state", "==", "held"),
    fold, {count: 0, amountMinor: 0},
  );

  const releasedFold = (acc, doc) => {
    const l = doc.data();
    const releasedMs = l.releasedAt && l.releasedAt.toMillis ? l.releasedAt.toMillis() : NaN;
    const withinDisputeWindow = Number.isFinite(releasedMs) && (now - releasedMs) <= windowMs;
    if (l.frozen === true || withinDisputeWindow) {
      acc.count++;
      acc.amountMinor += l.grossAmount || 0;
    }
    return acc;
  };
  const released = await paginate(
    coll.where("hostUid", "==", userId).where("state", "==", "released"),
    releasedFold, {count: 0, amountMinor: 0},
  );

  return {
    count: held.result.count + released.result.count,
    amountMinor: held.result.amountMinor + released.result.amountMinor,
    truncated: held.truncated || released.truncated,
  };
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
 * no businessOwnerUid variant needed (a booking's owner IS the business owner).
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
 * queue to know what it needs to reconcile.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId the account being previewed for deletion
 * @return {Promise<object>} see module header for the exact shape
 */
async function previewDeletionImpact(db, userId) {
  const disputeWindowDays = await readDisputeWindowDays(db);

  const [
    heldLedger, heldGifts, events, rentals, memberships, bookings,
  ] = await Promise.all([
    heldEscrowInCollection(db, "paymentLedger", userId, disputeWindowDays),
    heldEscrowInCollection(db, "giftLedger", userId, disputeWindowDays),
    futurePaidEvents(db, userId),
    activeRentals(db, userId),
    activeMemberships(db, userId),
    activeBookings(db, userId),
  ]);

  return {
    futureEvents: {
      count: events.count, attendees: events.attendees, amountMinor: events.amountMinor,
    },
    heldLedger: {count: heldLedger.count, amountMinor: heldLedger.amountMinor},
    heldGifts: {count: heldGifts.count, amountMinor: heldGifts.amountMinor},
    bookings: {count: bookings.count, amountMinor: bookings.amountMinor},
    activeRentals: {count: rentals.count},
    memberships: {count: memberships.count},
    truncated: events.truncated || rentals.truncated || memberships.truncated ||
      heldLedger.truncated || heldGifts.truncated || bookings.truncated,
  };
}

module.exports = {previewDeletionImpact, readDisputeWindowDays, DEFAULT_DISPUTE_WINDOW_DAYS};
