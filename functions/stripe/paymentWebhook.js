/**
 * Stripe Payment Success Webhook
 * Handles payment_intent.succeeded events
 * functions/stripe/paymentWebhook.js
 */

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");

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
      // BondVibe Pro subscription lifecycle
      if (event.type === "checkout.session.completed") {
        await handleProCheckoutCompleted(event.data.object);
        return res.json({received: true, handled: true});
      }
      if (
        event.type === "customer.subscription.deleted" ||
        event.type === "customer.subscription.updated"
      ) {
        await handleProSubscriptionChange(event.data.object);
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
      proSince: admin.firestore.FieldValue.serverTimestamp(),
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

  if (type !== "event_ticket") {
    console.log("⏭️ Skipping unhandled payment type:", type);
    return;
  }

  return handleEventTicketPurchase(paymentIntent);
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
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata,
  });

  // 2. Feature the event (server-only fields)
  await db.collection("events").doc(eventId).update({
    featured: true,
    featuredTier: tier || "standard",
    featuredUntil: admin.firestore.Timestamp.fromDate(expiresAt),
  });

  // 3. Promotion record
  await db.collection("promotions").add({
    hostId,
    eventId,
    eventTitle: eventTitle || "",
    planId,
    tier: tier || "standard",
    amountCentavos: amount,
    startsAt: admin.firestore.Timestamp.fromDate(now),
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    paymentId: paymentIntentId,
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 4. Notify the host
  await db.collection("notifications").add({
    userId: hostId,
    type: "promotion_active",
    title: "Your event is featured! ⭐",
    message: `"${eventTitle}" is now featured for ${days} days.`,
    icon: "⭐",
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {eventId, eventTitle},
  });

  console.log("✅ Promotion processing complete; featured until", expiresAt);
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
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: metadata,
  };

  await db.collection("payments").doc(paymentIntentId).set(paymentData);
  console.log("✅ Payment record saved");

  // 2. Add user to event attendees. The host's "new attendee" notification
  //    (in-app bubble + push, including the paid amount) is sent by the
  //    onEventAttendeesChanged Cloud Function, so we don't duplicate it here.
  console.log("👥 Adding user to event attendees...");
  const eventRef = db.collection("events").doc(eventId);
  await eventRef.update({
    attendees: admin.firestore.FieldValue.arrayUnion(userId),
  });
  console.log("✅ User added to attendees");

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
  const {planId, planName, planType, userId, hostId} = metadata;
  const creditsIncluded = parseInt(metadata.creditsIncluded, 10) || 0;
  const validityDays = parseInt(metadata.validityDays, 10) || 0;

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
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata,
  });
  console.log("✅ Membership payment record saved");

  // 2. Create the membership instance
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + validityDays);
  const isCredits = planType === "credits";

  const membershipRef = await db.collection("memberships").add({
    userId,
    hostId,
    planId,
    planName,
    type: planType,
    creditsTotal: isCredits ? creditsIncluded : null,
    creditsRemaining: isCredits ? creditsIncluded : null,
    purchasedAt: admin.firestore.Timestamp.fromDate(now),
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    status: "active",
    autoRenew: false,
    paymentId: paymentIntentId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("✅ Membership created:", membershipRef.id);

  // 3. Get buyer name for notifications
  const userDoc = await db.collection("users").doc(userId).get();
  const userName = userDoc.exists ?
    userDoc.data().fullName || userDoc.data().name || "Someone" :
    "Someone";

  // 4. Notify host
  await db.collection("notifications").add({
    userId: hostId,
    type: "membership_sold",
    title: "Membership sold! 🎟️",
    message: `${userName} purchased "${planName}" for $${(amount / 100).toFixed(
      2,
    )} MXN`,
    icon: "🎟️",
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {
      planId,
      planName,
      membershipId: membershipRef.id,
      userId,
      buyerName: userName,
      amountCentavos: amount,
    },
  });

  // 5. Notify buyer
  await db.collection("notifications").add({
    userId: userId,
    type: "membership_purchased",
    title: "Membership active! 🎉",
    message: isCredits ?
      `Your "${planName}" is ready — ${creditsIncluded} classes available.` :
      `Your "${planName}" is active. Enjoy unlimited classes!`,
    icon: "🎉",
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {planId, planName, membershipId: membershipRef.id},
  });

  console.log("✅ Membership purchase processing complete");
}
