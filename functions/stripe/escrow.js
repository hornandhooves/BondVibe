/**
 * Escrow helpers — money flow per docs/DISENO_escrow_pagos.md (the source of
 * truth). SERVER-ONLY (Admin SDK). No client ever reads/writes paymentLedger.
 *
 * Scope: EVENT TICKETS only. Memberships/packages are immediate + non-refundable
 * and never touch escrow (design §Alcance).
 */

const DEFAULT_RETENTION_HOURS = 24; // global default (§3/§7)
const HARD_FLOOR_HOURS = 0; //          piso duro — nunca antes de que el evento termine (§3/§7)

/**
 * Clamp a retention value to the hard floor (never negative) — "valida >= 0 al
 * usar". A missing/invalid value falls back to the global default.
 * @param {*} hours candidate retention in hours
 * @return {number} a safe retention in hours (>= 0)
 */
function clampRetentionHours(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_HOURS;
  return Math.max(HARD_FLOOR_HOURS, n);
}

/**
 * Global retention window from settings/payouts.retentionHours (§4/§7).
 * Default 24h; floored at 0 on read (defense-in-depth vs a bad stored value).
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @return {Promise<number>} retention hours (>= 0)
 */
async function readRetentionHours(db) {
  try {
    const snap = await db.collection("settings").doc("payouts").get();
    const raw = snap.exists ? snap.data().retentionHours : undefined;
    return clampRetentionHours(raw === undefined ? DEFAULT_RETENTION_HOURS : raw);
  } catch (e) {
    return DEFAULT_RETENTION_HOURS;
  }
}

/**
 * Effective retention PER HOST (§4/§7): a "super" host is paid when the event
 * ends (0h); everyone else uses the global window. The tier field is present in
 * v1 (default 'standard') so Super Host activates later with no re-architecture.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {object} hostData the host's users/{uid} doc data
 * @return {Promise<number>} effective retention hours (>= 0)
 */
async function effectiveRetentionHours(db, hostData) {
  if (hostData && hostData.payoutTier === "super") return 0;
  return readRetentionHours(db);
}

/**
 * Event end time. Events store a start `date` (ISO) + `durationMinutes`
 * (default 180) — there is no eventEndAt field, so derive it.
 * @param {object} eventData events/{id} doc data
 * @return {number} epoch ms of the event end, or NaN if the start is unparseable
 */
function eventEndAtMs(eventData) {
  const start = eventData && eventData.date ?
    new Date(eventData.date).getTime() : NaN;
  if (!Number.isFinite(start)) return NaN;
  const durMin = Number(eventData.durationMinutes) || 180;
  return start + durMin * 60000;
}

/**
 * releaseAt = eventEndAt + retentionHours (§4), as an ISO string. Retention is
 * clamped to the hard floor so releaseAt is never before the event ends.
 * @param {number} eventEndMs epoch ms of the event end
 * @param {number} retentionHours effective retention in hours
 * @return {string} ISO timestamp
 */
function computeReleaseAtISO(eventEndMs, retentionHours) {
  return new Date(
    eventEndMs + clampRetentionHours(retentionHours) * 3600000,
  ).toISOString();
}

const {FieldValue} = require("firebase-admin/firestore");

/**
 * Notify host + admins that a payout is stuck (no Connect account or a failed
 * transfer at release time) — §8. The ledger stays 'held' and retries next run.
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {object} ledger paymentLedger doc data
 * @param {string} reason short reason code
 * @return {Promise<void>}
 */
async function notifyPayoutStuck(db, ledger, reason) {
  try {
    const recipients = new Set();
    if (ledger.hostUid) recipients.add(ledger.hostUid);
    const admins = await db
      .collection("users").where("role", "==", "admin").limit(10).get();
    admins.docs.forEach((a) => recipients.add(a.id));
    await Promise.all([...recipients].map((uid) =>
      db.collection("notifications").add({
        userId: uid,
        type: "payout_stuck",
        title: "Payout pendiente",
        message:
          `No se pudo liberar el pago ${ledger.paymentIntentId} (${reason}). ` +
          "Reintentaremos automáticamente.",
        icon: "⏳",
        read: false,
        createdAt: new Date().toISOString(),
        metadata: {paymentIntentId: ledger.paymentIntentId, reason},
      })));
  } catch (e) {
    console.warn("notifyPayoutStuck failed:", e.message);
  }
}

/**
 * Release ONE held ledger entry (§4), idempotent. Transfers hostAmount minus the
 * host's accumulated cancellation penalty (§6), flips state to 'released', and
 * nets the penalty from the per-host debt. Parameterized by (stripe, db) so it
 * runs the same in the cron and in tests.
 * @param {object} stripe initialized Stripe client
 * @param {FirebaseFirestore.Firestore} db admin Firestore
 * @param {FirebaseFirestore.QueryDocumentSnapshot} ledgerDoc held ledger doc
 * @return {Promise<'released'|'held'|'skipped'>} outcome
 */
async function releaseOnePayout(stripe, db, ledgerDoc) {
  const l = ledgerDoc.data();
  const paymentIntentId = l.paymentIntentId || ledgerDoc.id;

  // Resolve the payout account: the ledger's (captured at sale), else the host's
  // current Connect account. §8: none → stay held, notify, retry next run.
  let hostAccountId = l.hostAccountId;
  if (!hostAccountId) {
    const hs = await db.collection("users").doc(l.hostUid).get();
    hostAccountId = hs.exists && hs.data().stripeConnect ?
      hs.data().stripeConnect.accountId : null;
  }
  if (!hostAccountId) {
    await notifyPayoutStuck(db, l, "no_connect_account");
    return "held";
  }

  // Per-host cancellation debt (§6), netted from THIS release.
  const accRef = db.collection("hostPayoutAccounts").doc(l.hostUid);
  const accSnap = await accRef.get();
  const owed = accSnap.exists ? (accSnap.data().penaltyOwed || 0) : 0;
  const hostAmount = l.hostAmount || 0;
  const netted = Math.max(0, Math.min(owed, hostAmount));
  const transferAmount = hostAmount - netted;

  // Transfer (idempotent). If the penalty consumes the whole amount, skip the
  // Stripe call but still complete the release (net the whole hostAmount).
  let transferId = null;
  if (transferAmount > 0) {
    try {
      const tr = await stripe.transfers.create({
        amount: transferAmount,
        currency: l.currency || "mxn",
        destination: hostAccountId,
        transfer_group: l.eventId,
        metadata: {paymentIntentId, hostUid: l.hostUid, netted: String(netted)},
      }, {idempotencyKey: "release_" + paymentIntentId});
      transferId = tr.id;
    } catch (e) {
      // §8: e.g. the host's account can't receive transfers now.
      console.warn(`release transfer failed ${paymentIntentId}: ${e.message}`);
      await notifyPayoutStuck(db, l, "transfer_failed");
      return "held";
    }
  }

  // Flip state + net the penalty atomically, gated on state=='held' so a retry
  // (the transfer is idempotent) can't double-net or double-flip.
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ledgerDoc.ref);
    if (!cur.exists || cur.data().state !== "held") return; // already released
    let curOwed = 0;
    if (netted > 0) {
      const a = await tx.get(accRef);
      curOwed = a.exists ? (a.data().penaltyOwed || 0) : 0;
    }
    tx.update(ledgerDoc.ref, {
      state: "released",
      transferId: transferId,
      hostPenaltyOwed: netted,
      releasedAt: FieldValue.serverTimestamp(),
    });
    if (netted > 0) {
      tx.set(accRef, {
        penaltyOwed: Math.max(0, curOwed - netted),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  });
  console.log(
    `💸 Released ${paymentIntentId}: transfer=${transferAmount} netted=${netted}`,
  );
  return "released";
}

module.exports = {
  DEFAULT_RETENTION_HOURS,
  HARD_FLOOR_HOURS,
  clampRetentionHours,
  readRetentionHours,
  effectiveRetentionHours,
  eventEndAtMs,
  computeReleaseAtISO,
  notifyPayoutStuck,
  releaseOnePayout,
};
