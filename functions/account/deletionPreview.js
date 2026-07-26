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
 *
 * PARTIAL-FAILURE CONTRACT (KIN-108 AC #14). All eight categories run via
 * Promise.allSettled, NOT Promise.all — one category's query failing (e.g. a
 * composite/collection-group index still `CREATING`, verified live against
 * kinlo-app-dev, 26-jul-2026) must never abort the others, and must NEVER be
 * silently read as "nothing pending" (a false all-clear right before an
 * irreversible action) or as a reason to block deletion (Rev. 2's
 * deletion-never-rejected policy). A category whose query rejects returns
 * its NORMAL shape with every count/amount at 0 PLUS `unavailable: true` —
 * the only valid signal for "we couldn't verify this," distinct from a
 * verified zero. The underlying Firestore error (code, message) is logged
 * server-side only and never reaches the returned object. The root
 * `complete` boolean is `true` only when every category resolved; a caller
 * (e.g. KIN-111's confirmation screen) MUST check `complete` before treating
 * an all-zero result as a real "nothing pending" state.
 *
 * BUYER/COUNTERPARTY SIDE (KIN-108 Commit B2 / KIN-112). Everything above
 * models the SELLER (payout-recipient) role only. Deleting a uid that is a
 * BUYER (paid for something still held/reversible) or a gift's GIFTER/
 * RECIPIENT has its own radius of impact — that money doesn't stop being
 * relevant just because this uid isn't the one being paid out. `myPending
 * Payments` (paymentLedger.buyerUid) and `myPendingGifts` (giftLedger.
 * gifterId OR .recipientId) cover that side, with the identical byState
 * shape and partial-failure handling as the seller-side categories.
 *
 * RELEASED-MONEY CLASSIFICATION (KIN-108 Commit B5 / AC #12). Two DISTINCT
 * windows, both config-driven from settings/payouts, neither hardcoded:
 *  - reversalWindowDays (default 30): how long after release a Stripe
 *    transfer reversal is still realistically actionable. Governs THIS
 *    module's byState.releasedReversible / byState.notRecoverable split.
 *  - disputeWindowDays (default 120): a DIFFERENT decision — how long
 *    transaction evidence must be retained before purgeScheduledDeletions
 *    (KIN-108's second PR, not built here) may actually delete it. This
 *    module does not consume it for classification; it's kept here (read
 *    the same way, exported) so that future cron has it ready without
 *    re-deriving the pattern.
 * A `released` row outside reversalWindowDays is NOT hidden — it's shown
 * under byState.notRecoverable, informational-only (excluded from the
 * category's top-level count/amountMinor, which represent actionable
 * pending money) so a client can render "$X no longer recoverable, but the
 * event/gift still needs handling" instead of it silently vanishing.
 */

const {FieldPath, Timestamp} = require("firebase-admin/firestore");
const {dateToMillis} = require("../stripe/escrow");

const PAGE_SIZE = 200;
const MAX_PAGES = 5; // caps a single sub-query at 1000 examined docs

// KIN-108 AC #12 (confirmed by product, 26-jul-2026 — no longer a
// placeholder needing sign-off, unlike the earlier draft of this comment).
// Governs a DIFFERENT decision than reversalWindowDays below — see the
// module header's "RELEASED-MONEY CLASSIFICATION" section. Not consumed by
// previewDeletionImpact itself.
const DEFAULT_DISPUTE_WINDOW_DAYS = 120;

// KIN-108 AC #12 / Commit B5 — how long after a payout releases a Stripe
// transfer reversal is still realistically actionable. THIS is what
// previewDeletionImpact's released-money classification actually uses.
const DEFAULT_REVERSAL_WINDOW_DAYS = 30;

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
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @return {Promise<number>} reversal window in days (>= 0)
 */
async function readReversalWindowDays(db) {
  try {
    const snap = await db.collection("settings").doc("payouts").get();
    const raw = snap.exists ? snap.data().reversalWindowDays : undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_REVERSAL_WINDOW_DAYS;
  } catch (e) {
    return DEFAULT_REVERSAL_WINDOW_DAYS;
  }
}

/**
 * Page through a query (already filtered, NOT yet ordered/limited) up to
 * MAX_PAGES of PAGE_SIZE, folding each doc through `reduce`. Ordered by
 * document id by default (needs no extra index field); pass `dateField` for
 * a query with a range filter on that field — Firestore requires the first
 * orderBy to match a filtered range field, so this adds it as the primary
 * sort with document id as a tiebreaker (KIN-108 Commit B1: events/date,
 * paymentLedger & giftLedger released/releasedAt now push their filters
 * server-side instead of fetching-then-filtering in memory).
 * @param {FirebaseFirestore.Query} baseQuery filtered query, no orderBy/limit
 * @param {function(*, FirebaseFirestore.QueryDocumentSnapshot): *} reduce fold step
 * @param {*} initial seed for `reduce`
 * @param {string} [dateField] a field with a range filter already applied to baseQuery
 * @return {Promise<{result: *, truncated: boolean}>}
 */
async function paginate(baseQuery, reduce, initial, dateField) {
  let acc = initial;
  let last = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = dateField ?
      baseQuery.orderBy(dateField).orderBy(FieldPath.documentId()) :
      baseQuery.orderBy(FieldPath.documentId());
    q = q.limit(PAGE_SIZE);
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

/** @return {object} a fresh zeroed byState accumulator (4 buckets) */
const zeroByStateAcc = () => ({
  byState: {
    held: zeroBucket(), releasedReversible: zeroBucket(),
    frozen: zeroBucket(), notRecoverable: zeroBucket(),
  },
});

/**
 * Escrow at risk in a ledger collection (paymentLedger or giftLedger),
 * matched on a single field — `hostUid` for the seller/payout-recipient
 * role, or `buyerUid`/`gifterId`/`recipientId` for the buyer/counterparty
 * role (KIN-108 Commit B2). Broken down by state so a client can render "$X
 * not yet paid out" vs "$Y still reversible" vs "$Z actively disputed" vs
 * "$W no longer recoverable" as distinct lines.
 *
 * held: always counts (money not paid out yet) — checked with a single query
 * and classified in memory (small volume; unlike released rows below, which
 * push their filters server-side for scale, KIN-108 Commit B1). A held row
 * that's also frozen (disputed pre-release) is classified frozen, not held.
 *
 * released: split into three server-side-filtered queries instead of one
 * fetch-everything-then-classify pass (Commit B1): frozen (equality, an
 * active dispute overrides the reversal window regardless of age),
 * releasedAt >= cutoff (releasedReversible), releasedAt < cutoff
 * (notRecoverable — shown, not hidden; Commit B5). frozen is checked first
 * in each fold so a row that's both frozen AND inside/outside the window is
 * classified frozen, never double-counted across queries.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} collectionName "paymentLedger" | "giftLedger"
 * @param {string} matchField "hostUid" | "buyerUid" | "gifterId" | "recipientId"
 * @param {string} userId the uid being previewed
 * @param {number} reversalWindowDays reversal window in days, already resolved
 * @return {Promise<{count: number, amountMinor: number, byState: object, truncated: boolean}>}
 */
async function pendingEscrowInCollection(db, collectionName, matchField, userId, reversalWindowDays) {
  const now = Date.now();
  // releasedAt is written as FieldValue.serverTimestamp() (escrow.js
  // releaseOnePayout) — a Firestore Timestamp, NOT an ISO string like the
  // scheduling field `releaseAt` (no "d") that the release cron reads. The
  // comparison operand below must be a Timestamp too, or this range filter
  // matches nothing at all against real data (Firestore comparisons are
  // type-strict; a string operand never matches a Timestamp-typed field).
  const cutoffTs = Timestamp.fromMillis(now - reversalWindowDays * 24 * 60 * 60 * 1000);
  const coll = db.collection(collectionName);

  const addTo = (acc, key, l) => {
    acc.byState[key].count++;
    acc.byState[key].amountMinor += l.grossAmount || 0;
    return acc;
  };

  const heldFold = (acc, doc) => {
    const l = doc.data();
    return addTo(acc, l.frozen === true ? "frozen" : "held", l);
  };
  const held = await paginate(
    coll.where(matchField, "==", userId).where("state", "==", "held"),
    heldFold, zeroByStateAcc(),
  );

  const frozenFold = (acc, doc) => addTo(acc, "frozen", doc.data());
  const frozenReleased = await paginate(
    coll.where(matchField, "==", userId).where("state", "==", "released")
      .where("frozen", "==", true),
    frozenFold, zeroByStateAcc(),
  );

  const reversibleFold = (acc, doc) => {
    if (doc.data().frozen === true) return acc; // already counted via frozenReleased
    return addTo(acc, "releasedReversible", doc.data());
  };
  const reversible = await paginate(
    coll.where(matchField, "==", userId).where("state", "==", "released")
      .where("releasedAt", ">=", cutoffTs),
    reversibleFold, zeroByStateAcc(), "releasedAt",
  );

  const notRecoverableFold = (acc, doc) => {
    if (doc.data().frozen === true) return acc; // already counted via frozenReleased
    return addTo(acc, "notRecoverable", doc.data());
  };
  const notRecoverable = await paginate(
    coll.where(matchField, "==", userId).where("state", "==", "released")
      .where("releasedAt", "<", cutoffTs),
    notRecoverableFold, zeroByStateAcc(), "releasedAt",
  );

  const byState = {
    held: held.result.byState.held,
    releasedReversible: reversible.result.byState.releasedReversible,
    notRecoverable: notRecoverable.result.byState.notRecoverable,
    frozen: {
      count: held.result.byState.frozen.count + frozenReleased.result.byState.frozen.count,
      amountMinor: held.result.byState.frozen.amountMinor +
        frozenReleased.result.byState.frozen.amountMinor,
    },
  };
  // notRecoverable is informational only (Commit B5) — settled, no-longer-
  // reversible money isn't part of the actionable "pending" total.
  const count = byState.held.count + byState.releasedReversible.count + byState.frozen.count;
  const amountMinor = byState.held.amountMinor + byState.releasedReversible.amountMinor +
    byState.frozen.amountMinor;

  return {
    count, amountMinor, byState,
    truncated: held.truncated || frozenReleased.truncated || reversible.truncated ||
      notRecoverable.truncated,
  };
}

/**
 * giftLedger involvement for a uid as EITHER gifter (payer) or recipient
 * (beneficiary) — KIN-108 Commit B2. Two independent
 * pendingEscrowInCollection scans merged (summed, not deduped): a doc could
 * only land in both if gifterId === recipientId, which never happens in
 * practice (a gift always has a different sender and recipient).
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId the uid being previewed
 * @param {number} reversalWindowDays reversal window in days, already resolved
 * @return {Promise<{count: number, amountMinor: number, byState: object, truncated: boolean}>}
 */
async function myGiftInvolvement(db, userId, reversalWindowDays) {
  const [asGifter, asRecipient] = await Promise.all([
    pendingEscrowInCollection(db, "giftLedger", "gifterId", userId, reversalWindowDays),
    pendingEscrowInCollection(db, "giftLedger", "recipientId", userId, reversalWindowDays),
  ]);
  const sum = (a, b) => ({count: a.count + b.count, amountMinor: a.amountMinor + b.amountMinor});
  return {
    count: asGifter.count + asRecipient.count,
    amountMinor: asGifter.amountMinor + asRecipient.amountMinor,
    byState: {
      held: sum(asGifter.byState.held, asRecipient.byState.held),
      releasedReversible: sum(asGifter.byState.releasedReversible, asRecipient.byState.releasedReversible),
      frozen: sum(asGifter.byState.frozen, asRecipient.byState.frozen),
      notRecoverable: sum(asGifter.byState.notRecoverable, asRecipient.byState.notRecoverable),
    },
    truncated: asGifter.truncated || asRecipient.truncated,
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
 * See the module header for why this must not be summed with
 * pendingSettlement/pendingGifts.
 *
 * The date filter is pushed server-side (`date >= nowISO`, KIN-108 Commit
 * B1) rather than fetched-then-filtered in memory, matching the existing
 * live pattern this repo already uses for future-event queries (verified:
 * ai/foundation.js:185-186, ai/features.js:184-188,402, ai/stream.js:112 all
 * do `.where("date", ">=", nowIso).orderBy("date", "asc")`). KNOWN RISK,
 * inherited from that existing pattern rather than introduced here: `date`
 * is stored as a Firestore Timestamp OR an ISO string depending on the write
 * path (escrow.js's own dateToMillis handles both) — a server-side string
 * comparison only matches docs where `date` is ALSO stored as a string.
 * An event whose `date` is a Timestamp would be silently excluded from this
 * query, whereas the prior in-memory dateToMillis-based filter handled both
 * formats. Flagged, not silently accepted as risk-free.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId creatorId or businessOwnerUid being previewed
 * @return {Promise<{count: number, attendees: number, amountMinor: number, truncated: boolean}>}
 */
async function futurePaidEvents(db, userId) {
  const nowISO = new Date().toISOString();
  const events = db.collection("events");
  const seen = new Set();
  const fold = (acc, doc) => {
    if (seen.has(doc.id)) return acc;
    seen.add(doc.id);
    const ev = doc.data();
    const attendees = ev.participantCount || 0;
    const hasPrice = (ev.price || 0) > 0 || (ev.priceLocal || 0) > 0;
    if (hasPrice && attendees > 0) {
      acc.count++;
      acc.attendees += attendees;
      acc.amountMinor += Math.round((ev.price || 0) * 100) * attendees;
    }
    return acc;
  };
  const initial = {count: 0, attendees: 0, amountMinor: 0};
  const byCreator = await paginate(
    events.where("creatorId", "==", userId).where("date", ">=", nowISO),
    fold, initial, "date");
  const byBizOwner = await paginate(
    events.where("businessOwnerUid", "==", userId).where("date", ">=", nowISO),
    fold, byCreator.result, "date");
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
 * COLLECTION scope only, NOT COLLECTION_GROUP.
 *
 * The status filter (`in` ["reserved","confirmed"]) is now pushed
 * server-side (KIN-108 Commit B1) instead of fetched-then-filtered in
 * memory — needs its own composite index (ownerUid, status). The upcoming
 * (start >= now) check stays in memory via dateToMillis: only the status
 * filter was in scope for this push, and `start`'s Timestamp/ISO-string
 * duality is exactly the risk flagged on futurePaidEvents' date push above,
 * which this deliberately avoids repeating a second time in the same commit.
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
    if (isUpcoming) {
      acc.count++;
      acc.amountMinor += b.totalCentavos || b.priceCents || 0;
    }
    return acc;
  };
  const {result, truncated} = await paginate(
    db.collectionGroup("bookings")
      .where("ownerUid", "==", userId)
      .where("status", "in", ["reserved", "confirmed"]),
    fold, {count: 0, amountMinor: 0},
  );
  return {...result, truncated};
}

const ESCROW_SHAPED_CATEGORIES = ["pendingSettlement", "myPendingPayments", "pendingGifts", "myPendingGifts"];

/**
 * The zeroed shape for a category when its query rejects — same fields a
 * successful result would have, all at 0, so a caller can render it exactly
 * like a real (verified) zero EXCEPT for the extra `unavailable: true`.
 * @param {string} name one of previewDeletionImpact's category keys
 * @return {object} zeroed shape for that category
 */
function emptyForCategory(name) {
  if (name === "futureEvents") {
    return {count: 0, attendees: 0, amountMinor: 0, isEstimate: true, truncated: false};
  }
  if (ESCROW_SHAPED_CATEGORIES.includes(name)) {
    return {count: 0, amountMinor: 0, ...zeroByStateAcc(), truncated: false};
  }
  if (name === "bookings") return {count: 0, amountMinor: 0, truncated: false};
  return {count: 0, truncated: false}; // activeRentals, memberships
}

/**
 * Map a category's raw fulfilled helper result onto its final shape in the
 * previewDeletionImpact response. Every helper already returns the right
 * shape 1:1 except futurePaidEvents, which needs `isEstimate` added.
 * @param {string} name one of previewDeletionImpact's category keys
 * @param {object} raw the resolved value from that category's query function
 * @return {object} the shape previewDeletionImpact returns for this category
 */
function shapeCategory(name, raw) {
  if (name === "futureEvents") {
    return {
      count: raw.count, attendees: raw.attendees, amountMinor: raw.amountMinor,
      isEstimate: true, truncated: raw.truncated,
    };
  }
  return raw;
}

/**
 * Read-only radius-of-impact preview for deleting `userId`'s account. Never
 * blocks, never deletes, never touches money — purely informational, for a
 * client confirmation screen and for the (separate, not-yet-built) settlement
 * queue to know what it needs to reconcile. See the module header for the
 * futureEvents/pendingSettlement/pendingGifts overlap warning, the
 * partial-failure contract (KIN-108 AC #14), the buyer/counterparty
 * categories (Commit B2), and the reversalWindowDays/disputeWindowDays split
 * (Commit B5).
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId the account being previewed for deletion
 * @return {Promise<object>} { futureEvents, pendingSettlement,
 *   myPendingPayments, pendingGifts, myPendingGifts, bookings,
 *   activeRentals, memberships, complete } — no root-level `truncated`
 *   (each category carries its own); `complete` is `true` only when every
 *   category resolved without error.
 */
async function previewDeletionImpact(db, userId) {
  const reversalWindowDays = await readReversalWindowDays(db);

  const categories = [
    ["pendingSettlement",
      () => pendingEscrowInCollection(db, "paymentLedger", "hostUid", userId, reversalWindowDays)],
    ["myPendingPayments",
      () => pendingEscrowInCollection(db, "paymentLedger", "buyerUid", userId, reversalWindowDays)],
    ["pendingGifts",
      () => pendingEscrowInCollection(db, "giftLedger", "hostUid", userId, reversalWindowDays)],
    ["myPendingGifts", () => myGiftInvolvement(db, userId, reversalWindowDays)],
    ["futureEvents", () => futurePaidEvents(db, userId)],
    ["activeRentals", () => activeRentals(db, userId)],
    ["memberships", () => activeMemberships(db, userId)],
    ["bookings", () => activeBookings(db, userId)],
  ];

  const settled = await Promise.allSettled(categories.map(([, run]) => run()));

  const result = {};
  let complete = true;
  settled.forEach((outcome, i) => {
    const [name] = categories[i];
    if (outcome.status === "fulfilled") {
      result[name] = shapeCategory(name, outcome.value);
      return;
    }
    complete = false;
    const err = outcome.reason || {};
    console.error(
      `previewDeletionImpact: category "${name}" failed — ${err.code || "?"} ${err.message || err}`,
    );
    result[name] = {...emptyForCategory(name), unavailable: true};
  });
  result.complete = complete;
  return result;
}

module.exports = {
  previewDeletionImpact,
  readDisputeWindowDays,
  DEFAULT_DISPUTE_WINDOW_DAYS,
  readReversalWindowDays,
  DEFAULT_REVERSAL_WINDOW_DAYS,
};
