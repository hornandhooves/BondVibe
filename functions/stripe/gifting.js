/**
 * SOCIAL GIFTING — money backend (v1, SIN wallet de crédito).
 * design_handoff_gifting/DISENO_gifting_dinero.md
 *
 * A gift is CHARGED to the gifter at purchase but the host is NOT paid until the
 * recipient redeems AND the event happens. Mechanism (no cron change, §0): the
 * held ledger row is written with releaseAt:null → invisible to the
 * releaseHostPayouts cron (a Firestore inequality query never returns null). On
 * redemption we set releaseAt = eventEnd + retention → the SAME cron pays the host
 * after the event. If the gift is never redeemed (expiry/decline/cancel) the money
 * is refunded to the gifter's card — v1 has NO credit wallet (that's v2).
 *
 * Reuses the real payment machinery — nothing about money is reinvented:
 *  - pricing.calculateCheckoutAmount (USER_PAYS_FEES)     escrow.effectiveRetentionHours
 *  - escrow.eventEndAtMs / computeReleaseAtISO            verify.assertCanCharge
 *  - roster.joinRosterTx / removeFromRoster (#55)         the releaseHostPayouts cron (untouched)
 *
 * v1 SCOPE: EVENT gifts only. Service gifts need "book a slot without charging"
 * which is an OPEN money decision (DISENO §9.4) — gated off here until resolved.
 */
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {FieldValue, Timestamp} = require("firebase-admin/firestore");
const {verifyBearer} = require("../lib/auth");

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
let stripe;
const getStripe = () => {
  if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
  return stripe;
};

const db = admin.firestore();
const GIFT_EXPIRY_DAYS = 30; // decision C

const giftRef = (id) => db.collection("gifts").doc(id);
const revealRef = (id) => db.collection("giftReveals").doc(id);
const ledgerRef = (pi) => db.collection("giftLedger").doc(pi);
const num = (v) => parseInt(v, 10) || 0;

// ANONYMITY (fix/gifting-review C): the recipient reads a PROJECTION that never
// carries gifterId. gifts/{id} is the GIFTER's view (has gifterId, read
// gifter-only by rules); giftReveals/{id} is the RECIPIENT's view (read
// recipient-only) — same status, but only gifterName (null when anonymous), so an
// anonymous gift's sender can't be recovered by the recipient.
const buildReveal = (gift) => ({
  giftId: gift.giftId,
  recipientId: gift.recipientId,
  itemId: gift.itemId,
  itemType: gift.itemType,
  itemTitle: gift.itemTitle || "",
  message: gift.message || null,
  fromMode: gift.fromMode,
  gifterName: gift.fromMode === "anonymous" ? null : (gift.gifterName || null),
  status: gift.status,
  expiresAt: gift.expiresAt || null,
  redeemedAt: gift.redeemedAt || null,
  waitlisted: gift.waitlisted || false,
  // NO gifterId, NO amount — deliberately absent.
});

/**
 * Mirror a status change onto BOTH the gifter doc and the recipient reveal so the
 * two views never drift. `giftExtra` lands only on gifts/{id}; status is synced.
 * @param {string} giftId the gift id
 * @param {string} status new status
 * @param {object} [giftExtra] extra fields for gifts/{id} only
 * @return {Promise<void>}
 */
async function syncGiftStatus(giftId, status, giftExtra = {}) {
  await Promise.all([
    giftRef(giftId).set({status, ...giftExtra}, {merge: true}),
    revealRef(giftId).set({status}, {merge: true}),
  ]);
}

/**
 * Write a HELD gift ledger row — the money mirror of paymentLedger, but in
 * giftLedger and with releaseAt:null (invisible to the payout cron until
 * redemption). Idempotent (merge). Mirrors escrow.writeHeldLedger's shape.
 * @param {object} p ledger inputs
 * @return {Promise<void>}
 */
async function writeGiftLedger(p) {
  await ledgerRef(p.paymentIntentId).set({
    paymentIntentId: p.paymentIntentId,
    giftId: p.giftId,
    type: "gift",
    gifterId: p.gifterId, // the PAYER (== buyerUid)
    recipientId: p.recipientId, // beneficiary; attendeeUid filled at redemption
    attendeeUid: null,
    itemId: p.itemId,
    itemType: p.itemType,
    hostUid: p.hostUid,
    hostAccountId: p.hostAccountId || null,
    grossAmount: p.grossAmount || 0,
    hostAmount: p.hostAmount || 0,
    platformFee: p.platformFee || 0,
    stripeFee: p.stripeFee || 0,
    currency: p.currency || "mxn",
    state: "held",
    frozen: false,
    redeemed: false,
    releaseAt: null, // ← NULL until redeemed (the whole trick, §0)
    deliveryEndAt: null, // filled at redemption (event) = eventEnd ISO
    hostPenaltyOwed: 0,
    capturedAt: FieldValue.serverTimestamp(),
    transferId: null,
    refundId: null,
    releasedAt: null,
    refundedAt: null,
  }, {merge: true});
}

/**
 * Refund a still-HELD gift to the gifter's card. Gift holds are NEVER transferred
 * before redemption (releaseAt stays null), so there is never a transfer to
 * reverse — a plain balance refund. Fee policy (DISENO §9.1, v1 default): refund
 * the item + platform "service" fee, RETAIN the Stripe processing fee
 * (grossAmount − stripeFee). Idempotent by ledger state.
 * @param {object} sdk stripe client
 * @param {object} ledger the giftLedger doc data
 * @param {string} reason stripe refund reason
 * @return {Promise<{refunded:number}>}
 */
async function refundGiftToGifter(sdk, ledger, reason = "requested_by_customer") {
  const ref = ledgerRef(ledger.paymentIntentId);
  // ANTI DOUBLE-REFUND (gate G): CLAIM the refund transactionally — only the
  // caller that flips held→refunding proceeds to Stripe. Concurrent
  // cancel/decline/expire/event-cancel paths that lose the race no-op, so a gift
  // can never be refunded twice.
  const claimed = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data().state !== "held") return false;
    tx.update(ref, {state: "refunding"});
    return true;
  });
  if (!claimed) {
    const st = (await ref.get()).data()?.state;
    return {refunded: 0, skipped: st || "gone"};
  }
  const fresh = (await ref.get()).data();
  const refundable = Math.max(0, (fresh.grossAmount || 0) - (fresh.stripeFee || 0));
  try {
    const refund = await sdk.refunds.create({
      payment_intent: fresh.paymentIntentId,
      amount: refundable,
      reason,
      metadata: {giftId: fresh.giftId, kind: "gift_refund"},
    });
    await ref.set({
      state: "refunded",
      refundId: refund.id,
      refundAmount: refundable,
      refundedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {refunded: refundable, refundId: refund.id};
  } catch (e) {
    // Roll the claim back so a later sweep can retry (never strand at "refunding").
    await ref.set({state: "held"}, {merge: true}).catch(() => {});
    throw e;
  }
}

/**
 * Notify the recipient a gift arrived — NEVER the amount (Design). Direct Admin
 * SDK write (bypasses the createNotification catalog by design).
 * @param {object} gift the gift doc
 * @return {Promise<void>}
 */
async function notifyGiftRecipient(gift) {
  try {
    const fromName = gift.fromMode === "anonymous" ? "Someone" : null;
    await db.collection("notifications").add({
      userId: gift.recipientId,
      fromUserId: gift.fromMode === "anonymous" ? null : gift.gifterId,
      type: "gift_received",
      title: "You've got a gift 🎁",
      message: fromName ?
        "Someone gifted you an event. Tap to reveal." :
        "You received an event gift. Tap to reveal.",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {giftId: gift.giftId, screen: "GiftReveal"},
    });
  } catch (e) {
    console.error("gift notify failed:", e.message);
  }
}

// ── createGiftPaymentIntent — the gifter pays (mirrors createEventPaymentIntent) ─
exports.createGiftPaymentIntent = onRequest(
  {cors: true, secrets: [stripeSecretKey]},
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
    try {
      const sdk = getStripe();
      const caller = await verifyBearer(req);
      if (!caller) return res.status(401).json({error: "unauthenticated"});
      if (!caller.email_verified) return res.status(403).json({error: "email_not_verified"});
      const gifterId = caller.uid;

      const {recipientId, itemId, itemType, fromMode, message} = req.body || {};
      if (!recipientId || !itemId) {
        return res.status(400).json({error: "Missing recipientId/itemId"});
      }
      // Anti auto-gift (kills any farming loop, §7).
      if (recipientId === gifterId) {
        return res.status(400).json({error: "cannot_gift_self"});
      }
      // v1: EVENT gifts only (service gifting is DISENO §9.4, unresolved).
      if (itemType && itemType !== "event") {
        return res.status(400).json({error: "service_gifting_deferred"});
      }

      const recipientSnap = await db.collection("users").doc(recipientId).get();
      if (!recipientSnap.exists) return res.status(404).json({error: "Recipient not found"});

      const eventDoc = await db.collection("events").doc(itemId).get();
      if (!eventDoc.exists) return res.status(404).json({error: "Event not found"});
      const eventData = eventDoc.data();

      // Gate G: don't sell a gift for an event that's cancelled or already over —
      // there's nothing to redeem, and it would just have to be refunded.
      if (eventData.status === "cancelled") {
        return res.status(400).json({error: "event_cancelled"});
      }
      const {eventEndAtMs: endMsFn} = require("./escrow");
      const endedMs = endMsFn(eventData);
      if (Number.isFinite(endedMs) && endedMs <= Date.now()) {
        return res.status(400).json({error: "event_over"});
      }

      // PRICE is authoritative from the event doc — never the client. Only PAID
      // events can be gifted (nothing to gift on a free event, §7).
      const eventPrice = Math.round((eventData.price || 0) * 100);
      if (eventPrice <= 0) return res.status(400).json({error: "event_not_paid"});

      const {getHostIdForPayout} = require("../utils/eventHelpers");
      const hostId = getHostIdForPayout(eventData);
      const hostDoc = await db.collection("users").doc(hostId).get();
      if (!hostDoc.exists) return res.status(404).json({error: "Host not found"});
      const stripeAccountId = hostDoc.data().stripeConnect?.accountId;

      const {calculateCheckoutAmount, getPricingConfig} = require("./pricing");
      const cfg = await getPricingConfig(db);
      const pricing = calculateCheckoutAmount(eventPrice, "stripe", {
        platformFeePercent: cfg.eventPlatformFeePercent,
        processorPercent: cfg.stripeFeePercent,
        processorFixed: cfg.stripeFixedCentavos,
      });

      // Host must be able to actually accept charges — asked live, never trusting
      // the client-forgeable Firestore flags.
      const {assertCanCharge} = require("./verify");
      try {
        await assertCanCharge(sdk, stripeAccountId);
      } catch (e) {
        return res.status(400).json({error: "Host cannot accept payments yet",
          details: e.code || "host_payouts_not_ready"});
      }

      const {eventEndAtMs} = require("./escrow");
      const endMs = eventEndAtMs(eventData);
      const eventEndAtISO = Number.isFinite(endMs) ? new Date(endMs).toISOString() : "";

      // Pre-generate the giftId; the gifts doc is created in the webhook on
      // confirmation (so an abandoned checkout leaves no gift).
      const giftId = giftRef("_").parent.doc().id;

      const pi = await sdk.paymentIntents.create({
        amount: pricing.totalAmount,
        currency: "mxn",
        receipt_email: caller.email || undefined,
        transfer_group: itemId, // escrow: separate charges & transfers
        metadata: {
          type: "gift",
          giftId,
          gifterId,
          recipientId,
          itemId,
          itemType: "event",
          itemTitle: String(eventData.title || "").slice(0, 200),
          hostUid: hostId,
          hostAccountId: stripeAccountId || "",
          eventPrice: pricing.eventPrice.toString(),
          platformFee: pricing.platformFee.toString(),
          stripeFee: pricing.stripeFee.toString(),
          totalAmount: pricing.totalAmount.toString(),
          hostReceives: pricing.hostReceives.toString(),
          feeModel: "USER_PAYS_FEES",
          eventEndAt: eventEndAtISO,
          fromMode: fromMode === "anonymous" ? "anonymous" : "named",
          message: String(message || "").slice(0, 200),
        },
        description: `Gift · ${String(eventData.title || "event").slice(0, 60)}`,
      });

      return res.json({
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        giftId,
        breakdown: {
          eventPrice: pricing.eventPrice,
          platformFee: pricing.platformFee,
          stripeFee: pricing.stripeFee,
          totalAmount: pricing.totalAmount,
          // The gifter sees the breakdown; the recipient NEVER does.
          currency: "mxn",
          feeModel: "USER_PAYS_FEES",
        },
      });
    } catch (error) {
      console.error("❌ createGiftPaymentIntent:", error);
      return res.status(500).json({error: error.message});
    }
  },
);

/**
 * Webhook handler for a confirmed gift charge (router case 'gift'). Idempotent by
 * the existence of giftLedger/{PI}. Writes the held ledger (releaseAt:null),
 * creates the gifts doc (status 'sent', +30d expiry), and notifies the recipient
 * (no amount).
 * @param {object} paymentIntent the Stripe PI
 * @return {Promise<void>}
 */
async function handleGiftPurchase(paymentIntent) {
  const pi = paymentIntent.id;
  const m = paymentIntent.metadata || {};
  // Idempotency: the ledger row is the marker.
  if ((await ledgerRef(pi).get()).exists) {
    console.log("⏭️ gift already processed:", pi);
    return;
  }
  await writeGiftLedger({
    paymentIntentId: pi,
    giftId: m.giftId,
    gifterId: m.gifterId,
    recipientId: m.recipientId,
    itemId: m.itemId,
    itemType: m.itemType || "event",
    hostUid: m.hostUid,
    hostAccountId: m.hostAccountId || null,
    grossAmount: num(m.totalAmount) || paymentIntent.amount,
    hostAmount: num(m.hostReceives),
    platformFee: num(m.platformFee),
    stripeFee: num(m.stripeFee),
    currency: paymentIntent.currency || "mxn",
  });

  const named = m.fromMode !== "anonymous";
  // Denormalize the gifter's display name for the reveal — ONLY for named gifts,
  // so the recipient's doc never carries the identity behind an anonymous gift.
  let gifterName = null;
  if (named) {
    const gSnap = await db.collection("users").doc(m.gifterId).get();
    gifterName = gSnap.exists ?
      (gSnap.data().fullName || gSnap.data().name || null) : null;
  }
  const gift = {
    giftId: m.giftId,
    gifterId: m.gifterId,
    gifterName, // null for anonymous
    recipientId: m.recipientId,
    itemId: m.itemId,
    itemType: m.itemType || "event",
    itemTitle: m.itemTitle || "",
    fromMode: named ? "named" : "anonymous",
    message: m.message || null,
    status: "sent",
    paymentIntentId: pi,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + GIFT_EXPIRY_DAYS * 86400000),
    redeemedAt: null,
    slotId: null,
  };
  // Write BOTH views: the gifter doc (full) + the recipient reveal (no gifterId).
  await Promise.all([
    giftRef(m.giftId).set(gift, {merge: true}),
    revealRef(m.giftId).set(buildReveal(gift), {merge: true}),
  ]);
  await notifyGiftRecipient(gift);
}
exports.handleGiftPurchase = handleGiftPurchase;

// ── redeemGift — the recipient redeems (NO charge) ──────────────────────────
exports.redeemGift = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "email_not_verified");
  }
  const giftId = String(request.data?.giftId || "");
  if (!giftId) throw new HttpsError("invalid-argument", "Missing giftId.");

  // Retention is host-configured and stable → read it before the tx.
  const preSnap = await giftRef(giftId).get();
  if (!preSnap.exists) throw new HttpsError("not-found", "Gift not found.");
  const pre = preSnap.data();
  if (pre.recipientId !== uid) throw new HttpsError("permission-denied", "Not your gift.");
  if (pre.itemType !== "event") {
    throw new HttpsError("failed-precondition", "service_gifting_deferred");
  }
  const hostSnap = await db.collection("users").doc(
    (await ledgerRef(pre.paymentIntentId).get()).data()?.hostUid || "_").get();
  const {effectiveRetentionHours, eventEndAtMs, computeReleaseAtISO} = require("./escrow");
  const retentionHours = await effectiveRetentionHours(
    db, hostSnap.exists ? hostSnap.data() : {});
  const roster = require("../utils/roster");

  const result = await db.runTransaction(async (tx) => {
    const gSnap = await tx.get(giftRef(giftId));
    const g = gSnap.data();
    if (g.status !== "sent") return {ok: false, reason: "already_" + g.status};
    if (g.expiresAt && g.expiresAt.toMillis && g.expiresAt.toMillis() <= Date.now()) {
      return {ok: false, reason: "expired"};
    }
    const evSnap = await tx.get(db.collection("events").doc(g.itemId));
    if (!evSnap.exists) return {ok: false, reason: "event_missing"};
    const eventData = evSnap.data();
    const lSnap = await tx.get(ledgerRef(g.paymentIntentId));
    const ledger = lSnap.data();

    // Atomic capacity via #55's roster tx (this tx has done no writes yet).
    const placement = await roster.joinRosterTx(tx, db, g.itemId, eventData, uid);
    if (placement === "already") {
      // Recipient already enrolled+paid themselves → don't double-enroll; leave
      // the gift 'sent' so the gifter can cancel (→ refund) or it expires. v1 has
      // no credit fallback.
      return {ok: false, reason: "already_enrolled"};
    }

    // ACTIVE → the host will be paid after the event: stamp releaseAt so the
    // untouched cron picks it up. WAITLIST → keep releaseAt null (host is NOT
    // paid for a seat not held); if never promoted the money stays held and is
    // swept to a refund at/after the event (follow-up — see PR notes).
    const endMs = eventEndAtMs(eventData);
    const patch = {
      state: "held",
      redeemed: true,
      attendeeUid: uid,
      deliveryEndAt: Number.isFinite(endMs) ? new Date(endMs).toISOString() : null,
      releaseAt: placement === "active" && Number.isFinite(endMs) ?
        computeReleaseAtISO(endMs, retentionHours) : null,
    };
    tx.set(ledgerRef(g.paymentIntentId), patch, {merge: true});
    const giftPatch = {
      status: "redeemed",
      redeemedAt: FieldValue.serverTimestamp(),
      waitlisted: placement === "waitlist",
    };
    tx.set(giftRef(giftId), giftPatch, {merge: true});
    // Keep the recipient's reveal in sync (no gifterId ever written here).
    tx.set(revealRef(giftId), {
      status: "redeemed", waitlisted: placement === "waitlist",
      redeemedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    void ledger;
    return {ok: true, placement};
  });

  if (!result.ok) {
    if (result.reason === "expired") {
      throw new HttpsError("failed-precondition", "gift_expired");
    }
    if (result.reason === "already_enrolled") {
      throw new HttpsError("failed-precondition", "already_enrolled");
    }
    throw new HttpsError("failed-precondition", result.reason || "cannot_redeem");
  }
  return {success: true, placement: result.placement};
});

// ── cancelGift (gifter, pre-redemption) → refund ────────────────────────────
exports.cancelGift = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const giftId = String(request.data?.giftId || "");
  if (!giftId) throw new HttpsError("invalid-argument", "Missing giftId.");
  const gSnap = await giftRef(giftId).get();
  if (!gSnap.exists) throw new HttpsError("not-found", "Gift not found.");
  const g = gSnap.data();
  if (g.gifterId !== uid) throw new HttpsError("permission-denied", "Not your gift.");
  if (g.status !== "sent") throw new HttpsError("failed-precondition", "not_cancellable");

  const ledger = (await ledgerRef(g.paymentIntentId).get()).data();
  const out = await refundGiftToGifter(getStripe(), ledger, "requested_by_customer");
  await syncGiftStatus(giftId, "cancelled");
  return {success: true, ...out};
});

// ── declineGift (recipient, discreet) → refund the gifter ───────────────────
exports.declineGift = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const giftId = String(request.data?.giftId || "");
  if (!giftId) throw new HttpsError("invalid-argument", "Missing giftId.");
  const gSnap = await giftRef(giftId).get();
  if (!gSnap.exists) throw new HttpsError("not-found", "Gift not found.");
  const g = gSnap.data();
  if (g.recipientId !== uid) throw new HttpsError("permission-denied", "Not your gift.");
  if (g.status !== "sent") throw new HttpsError("failed-precondition", "not_declinable");

  const ledger = (await ledgerRef(g.paymentIntentId).get()).data();
  const out = await refundGiftToGifter(getStripe(), ledger, "requested_by_customer");
  // Discreet: the gifter only sees "not redeemed", never a reason.
  await syncGiftStatus(giftId, "declined");
  return {success: true, ...out};
});

// ── expireGifts — daily cron: unredeemed after 30d → refund the gifter ──────
// v1 has NO credit wallet, so expiry refunds the gifter's card (not a credit).
exports.expireGifts = onSchedule(
  {schedule: "every day 03:00", timeZone: "America/Mexico_City",
    secrets: [stripeSecretKey]},
  async () => {
    const sdk = getStripe();
    const now = Timestamp.now();
    let refunded = 0;

    // (1) 30-day expiry: never-redeemed gifts → refund the gifter.
    const due = await db.collection("gifts")
      .where("status", "==", "sent")
      .where("expiresAt", "<=", now)
      .limit(200)
      .get();
    for (const d of due.docs) {
      const g = d.data();
      try {
        const ledger = (await ledgerRef(g.paymentIntentId).get()).data();
        if (ledger) await refundGiftToGifter(sdk, ledger, "requested_by_customer");
        await syncGiftStatus(g.giftId, "expired");
        refunded++;
      } catch (e) {
        console.error("expireGifts sent failed for", d.id, e.message);
      }
    }

    // (2) STUCK-WAITLIST sweep (gate F): a gift redeemed onto the WAITLIST whose
    // event has now ENDED without the recipient being promoted to an active seat
    // → the host was never paid (releaseAt stayed null), so refund the gifter.
    const {eventEndAtMs} = require("./escrow");
    const roster = require("../utils/roster");
    const waitlisted = await db.collection("gifts")
      .where("status", "==", "redeemed")
      .limit(300)
      .get();
    for (const d of waitlisted.docs) {
      const g = d.data();
      if (!g.waitlisted) continue;
      try {
        const evSnap = await db.collection("events").doc(g.itemId).get();
        const endMs = evSnap.exists ? eventEndAtMs(evSnap.data()) : NaN;
        if (!Number.isFinite(endMs) || endMs > Date.now()) continue; // not ended yet
        // Promoted to an active seat before the event? Then they attended — leave
        // it (host-payment for promoted waitlist is a separate follow-up).
        const onRoster = await roster.isOnRoster(db, g.itemId, g.recipientId);
        const rDoc = onRoster ? await db.collection("events").doc(g.itemId)
          .collection("roster").doc(g.recipientId).get() : null;
        if (rDoc && rDoc.exists && rDoc.data().status === "active") continue;
        const ledger = (await ledgerRef(g.paymentIntentId).get()).data();
        if (ledger) await refundGiftToGifter(sdk, ledger, "requested_by_customer");
        await roster.removeFromRoster(db, g.itemId, g.recipientId).catch(() => {});
        await syncGiftStatus(g.giftId, "expired", {waitlistRefunded: true});
        refunded++;
      } catch (e) {
        console.error("expireGifts waitlist failed for", d.id, e.message);
      }
    }
    console.log(`expireGifts: ${refunded} refunded`);
  },
);

/**
 * Gate E: when a host cancels an event, refund every live gift on it (sent OR
 * redeemed) to the gifter and mark both views 'event_cancelled'. Called from
 * hostCancelEvent AFTER it refunds the direct `payments` — gift money lives in the
 * separate giftLedger, so the payments refund path never touched it.
 * @param {string} eventId cancelled event
 * @return {Promise<number>} how many gifts were refunded
 */
async function refundEventGiftsOnCancel(eventId) {
  const sdk = getStripe();
  const roster = require("../utils/roster");
  const snap = await db.collection("gifts").where("itemId", "==", eventId).get();
  let n = 0;
  for (const d of snap.docs) {
    const g = d.data();
    if (g.status !== "sent" && g.status !== "redeemed") continue;
    try {
      const ledger = (await ledgerRef(g.paymentIntentId).get()).data();
      if (ledger) await refundGiftToGifter(sdk, ledger, "requested_by_customer");
      if (g.status === "redeemed") {
        await roster.removeFromRoster(db, eventId, g.recipientId).catch(() => {});
      }
      await syncGiftStatus(g.giftId, "event_cancelled");
      n++;
    } catch (e) {
      console.error("refundEventGiftsOnCancel failed for", d.id, e.message);
    }
  }
  return n;
}
exports.refundEventGiftsOnCancel = refundEventGiftsOnCancel;

// Exported for unit/emulator tests.
exports._internal = {
  writeGiftLedger, refundGiftToGifter, buildReveal, syncGiftStatus,
  refundEventGiftsOnCancel, GIFT_EXPIRY_DAYS,
};
