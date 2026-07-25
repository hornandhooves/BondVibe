/**
 * KIN-108 phase 1 — money-safety guard for deleteUserAccount.
 *
 * Deleting an account with open financial obligations orphans money: a
 * paymentLedger/giftLedger row left pointing at a hostUid that no longer
 * exists can never be released or reconciled (releaseHostPayouts retries it
 * forever), and recursiveDelete-ing an event with sold tickets destroys the
 * only doc hostCancelEvent needs to refund those attendees. This module only
 * DETECTS open obligations — deleteUserAccount is responsible for rejecting
 * when `blocked` is true. No deletion logic lives here.
 */

const {dateToMillis} = require("./escrow");

/**
 * Whether userId has any open financial obligation that must block account
 * deletion: held escrow (event/rental/service-booking or gift ledger), a
 * future paid event with attendees, an active rental, or a still-valid sold
 * membership.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {string} userId the account being considered for deletion
 * @return {Promise<{blocked: boolean, reasons: object}>} reasons keys are
 *   only present when their count is > 0
 */
async function checkOpenObligations(db, userId) {
  const now = Date.now();
  const reasons = {};

  // 1. Held escrow — event tickets, rentals, and service bookings all share
  //    this ledger (escrow.writeHeldLedger). "held" means Kinlo has the
  //    money and hasn't paid this hostUid yet.
  const heldLedgerSnap = await db.collection("paymentLedger")
    .where("hostUid", "==", userId)
    .where("state", "==", "held")
    .get();
  if (!heldLedgerSnap.empty) reasons.heldLedger = heldLedgerSnap.size;

  // 2. Held gift escrow (gifting.js writeGiftLedger) — separate collection,
  //    same shape. "held" covers unredeemed AND redeemed-but-event-not-yet-
  //    happened gifts; either way the host still owes the experience.
  const heldGiftLedgerSnap = await db.collection("giftLedger")
    .where("hostUid", "==", userId)
    .where("state", "==", "held")
    .get();
  if (!heldGiftLedgerSnap.empty) reasons.heldGifts = heldGiftLedgerSnap.size;

  // 3. Future paid events with attendees, independent of #1 — MercadoPago
  //    ticket sales never touch paymentLedger/escrow at all, so a MP-paid,
  //    sold-out future event wouldn't otherwise be caught here.
  const [createdEvents, ownedBizEvents] = await Promise.all([
    db.collection("events").where("creatorId", "==", userId).get(),
    db.collection("events").where("businessOwnerUid", "==", userId).get(),
  ]);
  const seenEventIds = new Set();
  let futurePaidEvents = 0;
  for (const doc of [...createdEvents.docs, ...ownedBizEvents.docs]) {
    if (seenEventIds.has(doc.id)) continue;
    seenEventIds.add(doc.id);
    const ev = doc.data();
    const startMs = dateToMillis(ev.date);
    const isFuture = Number.isFinite(startMs) && startMs >= now;
    const hasPrice = (ev.price || 0) > 0 || (ev.priceLocal || 0) > 0;
    const hasAttendees = (ev.participantCount || 0) > 0;
    if (isFuture && hasPrice && hasAttendees) futurePaidEvents++;
  }
  if (futurePaidEvents > 0) reasons.futurePaidEvents = futurePaidEvents;

  // 4. Active rentals — "reserved" (paid, awaiting pickup) or "active"
  //    (handed over, awaiting return).
  const [ownedRentals, ownedBizRentals] = await Promise.all([
    db.collection("rentals").where("ownerId", "==", userId).get(),
    db.collection("rentals").where("businessOwnerUid", "==", userId).get(),
  ]);
  const seenRentalIds = new Set();
  let activeRentals = 0;
  for (const doc of [...ownedRentals.docs, ...ownedBizRentals.docs]) {
    if (seenRentalIds.has(doc.id)) continue;
    seenRentalIds.add(doc.id);
    const status = doc.data().status;
    if (status === "reserved" || status === "active") activeRentals++;
  }
  if (activeRentals > 0) reasons.activeRentals = activeRentals;

  // 5. Still-valid sold memberships — immediate/non-refundable, never touch
  //    escrow (same status+expiresAt check the membership-join flow uses).
  const membershipsSnap = await db.collection("memberships")
    .where("hostId", "==", userId)
    .get();
  let activeMemberships = 0;
  for (const doc of membershipsSnap.docs) {
    const m = doc.data();
    const exp = m.expiresAt && m.expiresAt.toMillis ? m.expiresAt.toMillis() : 0;
    if (m.status !== "cancelled" && exp > now) activeMemberships++;
  }
  if (activeMemberships > 0) reasons.activeMemberships = activeMemberships;

  return {blocked: Object.keys(reasons).length > 0, reasons};
}

module.exports = {checkOpenObligations};
