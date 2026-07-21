/**
 * Stripe Payment Success Webhook
 * Handles payment_intent.succeeded events
 * functions/stripe/paymentWebhook.js
 */

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {FieldValue, Timestamp} = require("firebase-admin/firestore");
const {tPush} = require("../i18n"); // BUG 34: localized notification strings

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET_PAYMENTS");

const db = admin.firestore();

/**
 * Webhook endpoint for Stripe payment events
 * Handles: payment_intent.succeeded
 */
exports.stripePaymentWebhook = onRequest(
  {secrets: [stripeSecretKey, stripeWebhookSecret]},
  async (req, res) => {
    const stripe = require("stripe")(stripeSecretKey.value());
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        stripeWebhookSecret.value(),
      );
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("🔔 Stripe webhook received:", event.type);

    try {
      if (event.type === "payment_intent.succeeded") {
        await handlePaymentSuccess(event.data.object);
        return res.json({received: true, handled: true});
      }
      // Subscription lifecycle — Kinlo Pro (host) + Kinlo Plus (attendee).
      // Each handler no-ops unless the session/subscription metadata is its tier.
      if (event.type === "checkout.session.completed") {
        await handleProCheckoutCompleted(event.data.object);
        await handlePlusCheckoutCompleted(event.data.object);
        return res.json({received: true, handled: true});
      }
      if (
        event.type === "customer.subscription.deleted" ||
        event.type === "customer.subscription.updated"
      ) {
        await handleProSubscriptionChange(event.data.object);
        await handlePlusSubscriptionChange(event.data.object);
        return res.json({received: true, handled: true});
      }
      // ESCROW (§8): a dispute/chargeback auto-freezes the held payout so the
      // release cron won't pay the host while the money is contested.
      if (event.type === "charge.dispute.created") {
        await handleDisputeCreated(event.data.object);
        return res.json({received: true, handled: true});
      }
      return res.json({received: true, handled: false});
    } catch (error) {
      console.error("❌ Error handling webhook:", error);
      return res
        .status(500)
        .json({received: true, handled: false, error: error.message});
    }
  },
);

/**
 * Pro checkout completed → flip the buyer to Premium and store the Stripe IDs.
 * @param {Object} session - Stripe Checkout Session
 * @return {Promise<void>}
 */
async function handleProCheckoutCompleted(session) {
  if (session.mode !== "subscription") return;
  const meta = session.metadata || {};
  if (meta.type !== "pro_subscription") return;
  const uid = meta.uid || session.client_reference_id;
  if (!uid) return;
  await db.collection("users").doc(uid).set(
    {
      isPremium: true,
      stripeProCustomerId: session.customer || null,
      stripeProSubscriptionId: session.subscription || null,
      proSince: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  console.log("✅ Pro activated for", uid);
}

/**
 * Subscription updated/cancelled → keep isPremium in sync with its status.
 * @param {Object} subscription - Stripe Subscription
 * @return {Promise<void>}
 */
async function handleProSubscriptionChange(subscription) {
  const meta = subscription.metadata || {};
  if (meta.type !== "pro_subscription") return;
  const uid = meta.uid;
  if (!uid) return;
  const active = ["active", "trialing", "past_due"].includes(
    subscription.status,
  );
  await db.collection("users").doc(uid).set(
    {
      isPremium: active,
      stripeProSubscriptionStatus: subscription.status,
    },
    {merge: true},
  );
  console.log(
    "🔁 Pro subscription",
    subscription.status,
    "for",
    uid,
    "→ isPremium",
    active,
  );
}

/**
 * Kinlo Plus checkout completed → set the attendee's plan to "kinlo_plus"
 * (unlimited matches) and store the Stripe IDs.
 * @param {Object} session - Stripe Checkout Session
 * @return {Promise<void>}
 */
async function handlePlusCheckoutCompleted(session) {
  if (session.mode !== "subscription") return;
  const meta = session.metadata || {};
  if (meta.type !== "plus_subscription") return;
  const uid = meta.uid || session.client_reference_id;
  if (!uid) return;
  await db.collection("users").doc(uid).set(
    {
      plan: "kinlo_plus",
      stripePlusCustomerId: session.customer || null,
      stripePlusSubscriptionId: session.subscription || null,
      plusSince: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  console.log("✅ Kinlo Plus activated for", uid);
}

/**
 * Kinlo Plus subscription updated/cancelled → keep the plan in sync.
 * @param {Object} subscription - Stripe Subscription
 * @return {Promise<void>}
 */
async function handlePlusSubscriptionChange(subscription) {
  const meta = subscription.metadata || {};
  if (meta.type !== "plus_subscription") return;
  const uid = meta.uid;
  if (!uid) return;
  const active = ["active", "trialing", "past_due"].includes(
    subscription.status,
  );
  await db.collection("users").doc(uid).set(
    {
      plan: active ? "kinlo_plus" : "free",
      stripePlusSubscriptionStatus: subscription.status,
    },
    {merge: true},
  );
  console.log("🔁 Plus subscription", subscription.status, "for", uid);
}

/**
 * Handle successful payment
 * Saves payment record, adds user to event, sends notification
 * @param {Object} paymentIntent - Stripe PaymentIntent object
 * @return {Promise<void>}
 */
async function handlePaymentSuccess(paymentIntent) {
  const {metadata} = paymentIntent;
  const type = metadata.type;

  if (type === "membership") {
    return handleMembershipPurchase(paymentIntent);
  }

  if (type === "promotion") {
    return handlePromotionPurchase(paymentIntent);
  }

  if (type === "rental") {
    return handleRentalPayment(paymentIntent);
  }

  if (type === "service_booking") {
    return handleServiceBookingPayment(paymentIntent);
  }

  if (type !== "event_ticket") {
    console.log("⏭️ Skipping unhandled payment type:", type);
    return;
  }

  return handleEventTicketPurchase(paymentIntent);
}

/**
 * ESCROW §8 — a Stripe dispute/chargeback FREEZES the held payout so the release
 * cron skips it until an admin resolves it, and alerts admins.
 * @param {Object} dispute - Stripe Dispute object (carries .payment_intent)
 * @return {Promise<void>}
 */
async function handleDisputeCreated(dispute) {
  const paymentIntentId = typeof dispute.payment_intent === "string" ?
    dispute.payment_intent :
    (dispute.payment_intent && dispute.payment_intent.id);
  if (!paymentIntentId) {
    console.log("⏭️ Dispute without a payment_intent, skipping");
    return;
  }
  const ref = db.collection("paymentLedger").doc(paymentIntentId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log("⏭️ Dispute for a non-ledger payment, skipping:", paymentIntentId);
    return;
  }
  await ref.set(
    {frozen: true, disputedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  console.log("🧊 Ledger frozen by dispute:", paymentIntentId);

  // Notify admins (the frozen state also surfaces in the admin payouts view).
  try {
    const admins = await db
      .collection("users")
      .where("role", "==", "admin")
      .limit(10)
      .get();
    const eventId = snap.data().eventId || null;
    await Promise.all(
      admins.docs.map((a) =>
        db.collection("notifications").add({
          userId: a.id,
          type: "payout_frozen_dispute",
          title: "Payout congelado por disputa",
          message:
            `El pago ${paymentIntentId} entró en disputa/chargeback; ` +
            "su payout quedó congelado.",
          icon: "⚠️",
          read: false,
          createdAt: new Date().toISOString(),
          metadata: {paymentIntentId, eventId},
        }),
      ),
    );
  } catch (e) {
    console.warn("dispute admin-notify failed:", e.message);
  }
}

/**
 * Handle a successful event-promotion payment: feature the event for the
 * purchased window and record the promotion. Platform keeps 100%.
 * @param {Object} paymentIntent - Stripe PaymentIntent object
 * @return {Promise<void>}
 */
async function handlePromotionPurchase(paymentIntent) {
  const {id: paymentIntentId, amount, currency, metadata} = paymentIntent;
  const {eventId, eventTitle, planId, tier, hostId} = metadata;
  const days = parseInt(metadata.days, 10) || 7;

  console.log("⭐ Processing promotion purchase:", paymentIntentId);
  if (!eventId || !hostId) {
    throw new Error("Missing promotion metadata in payment intent");
  }

  // Idempotency
  const existing = await db.collection("payments").doc(paymentIntentId).get();
  if (existing.exists) {
    console.log("⏭️ Promotion payment already processed, skipping");
    return;
  }

  const now = new Date();
  // Extend from the current expiry when the event is still featured, so buying
  // more time adds to it instead of resetting/shortening it.
  const evSnap = await db.collection("events").doc(eventId).get();
  const curUntil = evSnap.exists ? evSnap.data().featuredUntil : null;
  const curMs = curUntil?.toMillis ? curUntil.toMillis() : 0;
  const base = curMs > now.getTime() ? new Date(curMs) : now;
  const expiresAt = new Date(base);
  expiresAt.setDate(expiresAt.getDate() + days);

  // 1. Payment record
  await db.collection("payments").doc(paymentIntentId).set({
    paymentIntentId,
    userId: hostId,
    hostId,
    eventId,
    eventTitle,
    planId,
    type: "promotion",
    amount,
    currency,
    status: "succeeded",
    createdAt: FieldValue.serverTimestamp(),
    metadata,
  });

  // 2. Feature the event (server-only fields)
  await db.collection("events").doc(eventId).update({
    featured: true,
    featuredTier: tier || "standard",
    featuredUntil: Timestamp.fromDate(expiresAt),
  });

  // 3. Promotion record
  await db.collection("promotions").add({
    hostId,
    eventId,
    eventTitle: eventTitle || "",
    planId,
    tier: tier || "standard",
    amountCentavos: amount,
    startsAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
    paymentId: paymentIntentId,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
  });

  // 4. Notify the host (recipient = the host). BUG 34: key+params.
  {
    const params = {event: eventTitle, days};
    await db.collection("notifications").add({
      userId: hostId,
      type: "promotion_active",
      title: tPush("notifications.payment.featured.title", "en", params),
      message: tPush("notifications.payment.featured.body", "en", params),
      titleKey: "notifications.payment.featured.title",
      bodyKey: "notifications.payment.featured.body",
      params,
      icon: "⭐",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {eventId, eventTitle},
    });
  }

  console.log("✅ Promotion processing complete; featured until", expiresAt);
}

/**
 * Handle a successful vehicle-rental fee payment: confirm the reservation
 * (reserved → active), save the payment record and notify the partner. The
 * deposit is a separate manual-capture hold that does NOT hit this handler on
 * authorization — it is released/captured by completeRental.
 * @param {Object} paymentIntent - Stripe PaymentIntent object
 * @return {Promise<void>}
 */
async function handleRentalPayment(paymentIntent) {
  const {id: paymentIntentId, amount, currency, metadata} = paymentIntent;
  const {rentalId, vehicleId, renterId} = metadata;
  console.log("🛴 Processing rental payment:", paymentIntentId);
  if (!rentalId) {
    throw new Error("Missing rentalId in rental payment intent");
  }

  // Idempotency
  const existing = await db.collection("payments").doc(paymentIntentId).get();
  if (existing.exists) {
    console.log("⏭️ Rental payment already processed, skipping");
    return;
  }

  const rentalRef = db.collection("rentals").doc(rentalId);
  const rentalSnap = await rentalRef.get();
  if (!rentalSnap.exists) {
    console.warn("⚠️ Rental not found for payment:", rentalId);
    return;
  }
  const rental = rentalSnap.data();

  // 1. Payment record
  await db.collection("payments").doc(paymentIntentId).set({
    paymentIntentId,
    userId: renterId || rental.renterId,
    hostId: rental.ownerId || null,
    rentalId,
    vehicleId: vehicleId || rental.vehicleId,
    type: "rental",
    amount,
    currency,
    status: "succeeded",
    createdAt: FieldValue.serverTimestamp(),
    metadata,
  });

  // 2. Confirm the reservation
  await rentalRef.update({
    status: "active",
    paidAt: FieldValue.serverTimestamp(),
  });

  // 3. Notify the partner/owner (recipient = the vehicle owner). BUG 34.
  if (rental.ownerId) {
    const params = {amount: (amount / 100).toFixed(2)};
    await db.collection("notifications").add({
      userId: rental.ownerId,
      type: "rental_booked",
      title: tPush("notifications.payment.rentalBooked.title", "en", params),
      message: tPush("notifications.payment.rentalBooked.body", "en", params),
      titleKey: "notifications.payment.rentalBooked.title",
      bodyKey: "notifications.payment.rentalBooked.body",
      params,
      icon: "🛴",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {rentalId, vehicleId: vehicleId || rental.vehicleId},
    });
  }

  console.log("✅ Rental payment processing complete");
}

/**
 * Handle a successful marketplace service-booking payment (Marketplace P1 · M4).
 * Idempotent: confirms the reserved booking (businesses/{bizId}/bookings) and
 * writes a payments/{paymentIntentId} record with the applied fee %.
 * @param {Object} paymentIntent - Stripe PaymentIntent object
 * @return {Promise<void>}
 */
async function handleServiceBookingPayment(paymentIntent) {
  const {id: paymentIntentId, amount, currency, metadata} = paymentIntent;
  const {bizId, bookingId, buyerId} = metadata;
  console.log("📅 Processing service booking payment:", paymentIntentId);
  if (!bizId || !bookingId) {
    throw new Error("Missing bizId/bookingId in service booking payment intent");
  }

  // Idempotency
  const existing = await db.collection("payments").doc(paymentIntentId).get();
  if (existing.exists) {
    console.log("⏭️ Service booking payment already processed, skipping");
    return;
  }

  const bRef = db.collection("businesses").doc(bizId).collection("bookings").doc(bookingId);
  const bSnap = await bRef.get();
  if (!bSnap.exists) {
    console.warn("⚠️ Service booking not found for payment:", bookingId);
    return;
  }
  const b = bSnap.data();

  // 1. Payment record (freezes the applied fee %, not just the amount).
  await db.collection("payments").doc(paymentIntentId).set({
    paymentIntentId,
    userId: buyerId || b.buyerUid || null,
    hostId: b.ownerUid || null,
    bizId,
    bookingId,
    sessionTypeId: b.sessionTypeId || null,
    type: "service_booking",
    amount,
    currency,
    status: "succeeded",
    platformFeePercentApplied: b.platformFeePercentApplied != null ? b.platformFeePercentApplied : null,
    createdAt: FieldValue.serverTimestamp(),
    metadata,
  });

  // 2. Confirm the reservation (reserved → confirmed; now shows in the agenda).
  await bRef.update({
    status: "confirmed",
    paidAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 3. Notify the host.
  if (b.ownerUid) {
    await db.collection("notifications").add({
      userId: b.ownerUid,
      type: "service_booked",
      title: "New booking",
      message: `${b.sessionTypeName || "A service"} was just booked.`,
      icon: "📅",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {bizId, bookingId, sessionTypeId: b.sessionTypeId || null},
    });
  }

  console.log("✅ Service booking payment processing complete");
}

/**
 * Handle a successful event ticket payment.
 * @param {Object} paymentIntent - Stripe PaymentIntent object
 * @return {Promise<void>}
 */
async function handleEventTicketPurchase(paymentIntent) {
  const {id: paymentIntentId, amount, currency, metadata} = paymentIntent;

  console.log("💳 Processing event ticket payment:", paymentIntentId);

  // Extract metadata
  const {eventId, eventTitle, userId, hostId} = metadata;

  // Validate required fields
  if (!eventId || !userId || !hostId) {
    throw new Error("Missing required metadata in payment intent");
  }

  // Idempotency: if this payment was already processed, skip. Stripe retries a
  // webhook whenever the endpoint is slow or returns non-2xx, and this was the
  // only payment-intent handler without the guard — a retry re-ran the blind
  // `.set()` below and would stamp status back to "succeeded" over any later
  // state (e.g. a refund/dispute recorded on the payment doc).
  const existingPayment = await db
    .collection("payments")
    .doc(paymentIntentId)
    .get();
  if (existingPayment.exists) {
    console.log("⏭️ Event ticket payment already processed, skipping");
    return;
  }

  // 1a. ESCROW ledger (docs/DISENO_escrow_pagos.md §3) — the source of truth for
  //     the state of this held payment. Funds are in Kinlo's balance now; the
  //     releaseHostPayouts cron pays the host after eventEndAt + retention.
  //     Written BEFORE the payment doc so the payments-doc idempotency guard
  //     above always leaves a ledger row (a retry landing after this but before
  //     the payment doc re-runs and re-sets it via merge).
  const escrow = require("./escrow");
  const num = (v) => parseInt(v, 10) || 0;
  const hostSnap = await db.collection("users").doc(hostId).get();
  const hostData = hostSnap.exists ? hostSnap.data() : {};
  const retentionHours = await escrow.effectiveRetentionHours(db, hostData);
  let eventEndAt = metadata.eventEndAt || null;
  if (!eventEndAt) {
    const evSnap = await db.collection("events").doc(eventId).get();
    if (evSnap.exists) {
      const ms = escrow.eventEndAtMs(evSnap.data());
      eventEndAt = Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
  }
  const eventEndMs = eventEndAt ? new Date(eventEndAt).getTime() : NaN;
  const releaseAt = Number.isFinite(eventEndMs) ?
    escrow.computeReleaseAtISO(eventEndMs, retentionHours) : null;
  await db.collection("paymentLedger").doc(paymentIntentId).set({
    paymentIntentId,
    eventId,
    hostAccountId: metadata.hostAccountId ||
      (hostData.stripeConnect && hostData.stripeConnect.accountId) || null,
    hostUid: hostId,
    attendeeUid: userId,
    grossAmount: num(metadata.totalAmount) || amount,
    hostAmount: num(metadata.hostReceives),
    platformFee: num(metadata.platformFee),
    stripeFee: num(metadata.stripeFee),
    currency,
    state: "held",
    frozen: false,
    hostPenaltyOwed: 0,
    capturedAt: FieldValue.serverTimestamp(),
    eventEndAt: eventEndAt,
    releaseAt: releaseAt,
    transferId: null,
    refundId: null,
  }, {merge: true});
  console.log(`🔒 Ledger held: ${paymentIntentId} releaseAt=${releaseAt}`);

  // 1. Save payment record
  console.log("💾 Saving payment record...");
  const paymentData = {
    paymentIntentId: paymentIntentId,
    userId: userId,
    hostId: hostId,
    eventId: eventId,
    eventTitle: eventTitle,
    amount: amount,
    currency: currency,
    status: "succeeded",
    createdAt: FieldValue.serverTimestamp(),
    metadata: metadata,
  };

  await db.collection("payments").doc(paymentIntentId).set(paymentData);
  console.log("✅ Payment record saved");

  // 2. Add user to event attendees — atomically, honoring capacity. The host's
  //    "new attendee" notification is sent by onEventAttendeesChanged, so we
  //    don't duplicate it here.
  //    OVERSELL: this used to be a blind arrayUnion. createEventPaymentIntent
  //    now rejects a sold-out event before charging, but two payments in flight
  //    could still both land here and overbook. Do the add in a transaction
  //    that re-checks capacity; if the event filled meanwhile, the paid user is
  //    waitlisted (promoted by onEventAttendeesChanged when a spot frees) rather
  //    than dropped or oversold past maxAttendees.
  console.log("👥 Adding user to event attendees...");
  const eventRef = db.collection("events").doc(eventId);
  const placement = await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) return "event_missing";
    const e = snap.data();
    const ids = (Array.isArray(e.attendees) ? e.attendees : [])
      .map((a) => (typeof a === "string" ? a : a && a.userId))
      .filter(Boolean);
    if (ids.includes(userId)) return "already";
    const max = e.maxAttendees || e.maxPeople || 0;
    if (max && ids.length >= max) {
      const wl = Array.isArray(e.waitlist) ? e.waitlist : [];
      if (!wl.includes(userId)) {
        tx.update(eventRef, {waitlist: FieldValue.arrayUnion(userId)});
      }
      return "waitlisted";
    }
    tx.update(eventRef, {attendees: FieldValue.arrayUnion(userId)});
    return "attendee";
  });
  console.log(`✅ Ticket placement: ${placement}`);

  console.log("✅ Payment processing complete");
}

/**
 * Handle a successful membership plan purchase.
 * Creates the membership instance (credits + expiry) and notifies both parties.
 * @param {Object} paymentIntent - Stripe PaymentIntent object
 * @return {Promise<void>}
 */
async function handleMembershipPurchase(paymentIntent) {
  const {id: paymentIntentId, amount, currency, metadata} = paymentIntent;
  const {planId, planName, userId, hostId} = metadata;
  const creditsIncluded = parseInt(metadata.creditsIncluded, 10) || 0;
  const validityDays = parseInt(metadata.validityDays, 10) || 0;
  const audienceTier = metadata.audienceTier || "both";

  console.log("🎟️ Processing membership purchase:", paymentIntentId);

  if (!planId || !userId || !hostId) {
    throw new Error("Missing required membership metadata in payment intent");
  }

  // Idempotency: if this payment was already processed, skip.
  const existingPayment = await db
    .collection("payments")
    .doc(paymentIntentId)
    .get();
  if (existingPayment.exists) {
    console.log("⏭️ Membership payment already processed, skipping");
    return;
  }

  // 1. Save payment record
  await db.collection("payments").doc(paymentIntentId).set({
    paymentIntentId,
    userId,
    hostId,
    planId,
    planName,
    type: "membership",
    amount,
    currency,
    status: "succeeded",
    createdAt: FieldValue.serverTimestamp(),
    metadata,
  });
  console.log("✅ Membership payment record saved");

  // 2. Create the membership instance. Every membership is credit-based now
  // (no unlimited); it carries an audience tier (local/general/both).
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + validityDays);

  const membershipRef = await db.collection("memberships").add({
    userId,
    hostId,
    planId,
    planName,
    type: "credits",
    creditsTotal: creditsIncluded,
    creditsRemaining: creditsIncluded,
    audienceTier,
    purchasedAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
    status: "active",
    autoRenew: false,
    paymentId: paymentIntentId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log("✅ Membership created:", membershipRef.id);

  // 3. Get buyer name for notifications
  const userDoc = await db.collection("users").doc(userId).get();
  const userName = userDoc.exists ?
    userDoc.data().fullName || userDoc.data().name || "Someone" :
    "Someone";

  // 4. Notify host (recipient = the host/seller). BUG 34: key+params.
  {
    const params = {name: userName, plan: planName, amount: (amount / 100).toFixed(2)};
    await db.collection("notifications").add({
      userId: hostId,
      type: "membership_sold",
      title: tPush("notifications.payment.membershipSold.title", "en", params),
      message: tPush("notifications.payment.membershipSold.body", "en", params),
      titleKey: "notifications.payment.membershipSold.title",
      bodyKey: "notifications.payment.membershipSold.body",
      params,
      icon: "🎟️",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        planId,
        planName,
        membershipId: membershipRef.id,
        userId,
        buyerName: userName,
        amountCentavos: amount,
      },
    });
  }

  // 5. Notify buyer (recipient = the buyer). BUG 34: key+params.
  {
    const params = {plan: planName, credits: creditsIncluded};
    await db.collection("notifications").add({
      userId: userId,
      type: "membership_purchased",
      title: tPush("notifications.payment.membershipPurchased.title", "en", params),
      message: tPush("notifications.payment.membershipPurchased.body", "en", params),
      titleKey: "notifications.payment.membershipPurchased.title",
      bodyKey: "notifications.payment.membershipPurchased.body",
      params,
      icon: "🎉",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {planId, planName, membershipId: membershipRef.id},
    });
  }

  console.log("✅ Membership purchase processing complete");
}
