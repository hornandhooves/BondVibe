/**
 * BondVibe Cloud Functions
 * Payment processing with Stripe + Push Notifications
 */

const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated, onDocumentWritten} =
  require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const {defineSecret} = require("firebase-functions/params");


// Define secrets
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

// Initialize Stripe (will be done inside functions)
let stripe;

// Initialize Firebase Admin FIRST
admin.initializeApp();
const db = admin.firestore();

// Import refunds AFTER Firebase is initialized
const {cancelEventAttendance, hostCancelEvent} = require("./stripe/refunds");

// Import pricing logic
const {
  calculateEventSplit,
  getPremiumSubscriptionPrice,
} = require("./stripe/pricing");

// Import push notification service
const {sendBatchPushNotifications} = require("./notifications/pushService");

// Import event helpers (attendee/creator normalization)
const {getAttendeeIds, getEventCreatorId} = require("./utils/eventHelpers");

/**
 * Look up a user's email (for Stripe receipts). Returns null if unavailable.
 * @param {string} userId
 * @return {Promise<string|null>}
 */
async function getUserEmail(userId) {
  try {
    const snap = await db.collection("users").doc(userId).get();
    return snap.exists ? snap.data().email || null : null;
  } catch (e) {
    console.warn("⚠️ Could not load user email:", e.message);
    return null;
  }
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================

/**
 * ✅ FIXED: Trigger when a new message is created in an EVENT chat
 * Path: events/{eventId}/messages/{messageId}
 * (NOT conversations - that collection doesn't exist)
 */
exports.onNewMessage = onDocumentCreated(
  "events/{eventId}/messages/{messageId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("⚠️ No data in snapshot");
      return;
    }

    const messageData = snapshot.data();
    const {eventId, messageId} = event.params;

    console.log("📨 New message detected:", {
      eventId,
      messageId,
      senderId: messageData.senderId,
      type: messageData.type,
    });

    // Only process text, location and poll messages
    if (!["text", "location", "poll"].includes(messageData.type)) {
      console.log("⏭️ Skipping unsupported message type for push");
      return;
    }

    try {
      // Get event data
      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) {
        console.log("⚠️ Event not found:", eventId);
        return;
      }

      const eventData = eventDoc.data();
      const eventTitle = eventData.title;

      // Get sender info
      const senderDoc = await db
        .collection("users")
        .doc(messageData.senderId)
        .get();
      const senderName = senderDoc.exists ?
        senderDoc.data().fullName?.split(" ")[0] ||
          senderDoc.data().name?.split(" ")[0] ||
          "Someone" :
        "Someone";

      // Get all participants (attendees + creator)
      const participantIds = new Set();

      // Add creator
      const creatorId = getEventCreatorId(eventData);
      if (creatorId) {
        participantIds.add(creatorId);
      }

      // Add attendees (normalized to UID strings)
      getAttendeeIds(eventData.attendees).forEach((id) =>
        participantIds.add(id),
      );

      // Remove sender from recipients
      participantIds.delete(messageData.senderId);

      console.log("👥 Participants to notify:", participantIds.size);

      if (participantIds.size === 0) {
        console.log("⚠️ No participants to notify");
        return;
      }

      // Prepare message body
      let messageBody;
      if (messageData.type === "location") {
        messageBody = "📍 Shared their location";
      } else {
        messageBody =
          messageData.text?.length > 100 ?
            messageData.text.substring(0, 100) + "..." :
            messageData.text;
      }

      // Get push tokens for all participants
      const notifications = [];

      for (const userId of participantIds) {
        try {
          const userDoc = await db.collection("users").doc(userId).get();

          if (userDoc.exists) {
            const userData = userDoc.data();
            const pushToken = userData.pushToken;

            if (pushToken) {
              notifications.push({
                pushToken,
                title: `${senderName} in ${eventTitle}`,
                body: messageBody,
                data: {
                  type: "event_message",
                  eventId: eventId,
                  conversationId: `event_${eventId}`,
                  eventTitle: eventTitle,
                },
              });

              console.log(`📱 Queued notification for user: ${userId}`);
            } else {
              console.log(`⚠️ No push token for user: ${userId}`);
            }
          }
        } catch (userError) {
          console.error(`❌ Error getting user ${userId}:`, userError);
        }
      }

      // Send all push notifications
      if (notifications.length > 0) {
        const tickets = await sendBatchPushNotifications(notifications);
        console.log(
          `✅ Sent ${tickets.length} push notifications for message in ${eventTitle}`,
        );
      } else {
        console.log("⚠️ No valid push tokens found");
      }

      // ============================================
      // ✅ UPDATE IN-APP NOTIFICATIONS (for badge)
      // ============================================
      for (const userId of participantIds) {
        try {
          const notificationId = `event_msg_${eventId}_${userId}`;
          const notificationRef = db
            .collection("notifications")
            .doc(notificationId);
          const existingNotif = await notificationRef.get();

          if (existingNotif.exists) {
            // Update existing notification
            const currentCount = existingNotif.data().unreadCount ?? 0;
            await notificationRef.update({
              unreadCount: currentCount + 1,
              lastMessage: messageBody,
              lastSender: senderName,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
            });
            console.log(`📝 Updated notification for ${userId} (${currentCount + 1} messages)`);
          } else {
            // Create new notification
            await notificationRef.set({
              userId,
              type: "event_messages",
              eventId: `event_${eventId}`,
              eventTitle,
              unreadCount: 1,
              lastMessage: messageBody,
              lastSender: senderName,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              read: false,
            });
            console.log(`📝 Created notification for ${userId}`);
          }
        } catch (notifError) {
          console.error(
            `❌ Error updating notification for ${userId}:`,
            notifError,
          );
        }
      }
    } catch (error) {
      console.error("❌ Error processing new message:", error);
    }
  },
);

// ============================================
// PAYMENT FUNCTIONS (existing)
// ============================================

/**
 * Create Payment Intent for event ticket with Stripe Connect
 * Money flows: User → Host (95%) + BondVibe (5%)
 */
exports.createEventPaymentIntent = onRequest(
  {cors: true, secrets: [stripeSecretKey]},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }

    try {
      // Initialize Stripe with secret
      if (!stripe) {
        stripe = require("stripe")(stripeSecretKey.value());
      }

      const {eventId, userId, eventPriceCentavos} = req.body;

      // Support both old 'amount' param and new 'eventPriceCentavos'
      const eventPrice = eventPriceCentavos || req.body.amount;

      if (!eventId || !userId || !eventPrice) {
        return res.status(400).json({error: "Missing required fields"});
      }

      // Get event data
      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) {
        return res.status(404).json({error: "Event not found"});
      }

      const eventData = eventDoc.data();
      const hostId = getEventCreatorId(eventData);

      // Get host's Stripe Connect account
      const hostDoc = await db.collection("users").doc(hostId).get();
      if (!hostDoc.exists) {
        return res.status(404).json({error: "Host not found"});
      }

      const hostData = hostDoc.data();
      const stripeAccountId = hostData.stripeConnect?.accountId;

      // NEW: Calculate fees using new pricing model
      const {calculateCheckoutAmount} = require("./stripe/pricing");
      const pricing = calculateCheckoutAmount(eventPrice);

      console.log("💰 NEW Payment breakdown:", {
        eventPrice: pricing.eventPrice,
        platformFee: pricing.platformFee,
        stripeFee: pricing.stripeFee,
        totalAmount: pricing.totalAmount,
        hostReceives: pricing.hostReceives,
        refundableAmount: pricing.refundableAmount,
        stripeAccountId: stripeAccountId,
      });

      // Check if host has Stripe Connect (for paid events)
      if (eventPrice > 0 && !stripeAccountId) {
        return res.status(400).json({
          error: "Host has not connected their Stripe account",
          details: "Host must connect Stripe to receive payments",
        });
      }

      // Check if host can accept payments
      if (eventPrice > 0 && !hostData.hostConfig?.canCreatePaidEvents) {
        return res.status(400).json({
          error: "Host cannot accept payments yet",
          details: "Host needs to complete Stripe verification",
        });
      }

      // Create Payment Intent with NEW pricing
      // Buyer email → Stripe sends an automatic receipt to it.
      const buyerEmail = await getUserEmail(userId);

      const paymentIntentConfig = {
        amount: pricing.totalAmount, // User pays total (event + fees)
        currency: "mxn",
        receipt_email: buyerEmail || undefined,
        metadata: {
          type: "event_ticket",
          eventId: eventId,
          eventTitle: eventData.title,
          userId: userId,
          hostId: hostId,
          // NEW: Store all pricing details for refunds
          eventPrice: pricing.eventPrice.toString(),
          platformFee: pricing.platformFee.toString(),
          stripeFee: pricing.stripeFee.toString(),
          totalAmount: pricing.totalAmount.toString(),
          hostReceives: pricing.hostReceives.toString(),
          refundableAmount: pricing.refundableAmount.toString(),
          feeModel: "USER_PAYS_FEES",
        },
        description: `Ticket for ${eventData.title}`,
      };

      // Add Stripe Connect parameters
      // BondVibe keeps: platform fee + stripe fee
      // Host receives: event price (100% of what they set)
      if (eventPrice > 0 && stripeAccountId) {
        paymentIntentConfig.application_fee_amount = pricing.platformFee + pricing.stripeFee;
        paymentIntentConfig.transfer_data = {
          destination: stripeAccountId,
        };
      }

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentConfig,
      );

      console.log("✅ Payment Intent created:", paymentIntent.id);

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        breakdown: {
          eventPrice: pricing.eventPrice,
          platformFee: pricing.platformFee,
          stripeFee: pricing.stripeFee,
          totalAmount: pricing.totalAmount,
          hostReceives: pricing.hostReceives,
          refundableAmount: pricing.refundableAmount,
          nonRefundableFees: pricing.platformFee + pricing.stripeFee,
          currency: "mxn",
          feeModel: "USER_PAYS_FEES",
        },
      });
    } catch (error) {
      console.error("❌ Error creating payment intent:", error);
      res.status(500).json({error: error.message});
    }
  },
);

/**
 * Create Payment Intent for tip with Stripe Connect
 * Tips go 100% to host (no platform fee)
 */
exports.createTipPaymentIntent = onRequest(
  {cors: true, secrets: [stripeSecretKey]},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }

    try {
      if (!stripe) {
        stripe = require("stripe")(stripeSecretKey.value());
      }

      const {hostId, eventId, amount, message, userId} = req.body;

      if (!hostId || !amount || !userId) {
        return res.status(400).json({error: "Missing required fields"});
      }

      // Get host's Stripe Connect account
      const hostDoc = await db.collection("users").doc(hostId).get();
      if (!hostDoc.exists) {
        return res.status(404).json({error: "Host not found"});
      }

      const hostData = hostDoc.data();
      const stripeAccountId = hostData.stripeConnect?.accountId;

      if (!stripeAccountId) {
        return res.status(400).json({
          error: "Host has not connected their Stripe account",
        });
      }

      console.log("💝 Tip payment:", {
        amount: amount,
        hostId: hostId,
        stripeAccountId: stripeAccountId,
      });

      // Buyer email → Stripe sends an automatic receipt to it.
      const tipperEmail = await getUserEmail(userId);

      // Tip goes 100% to host (no platform fee)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "mxn",
        receipt_email: tipperEmail || undefined,
        application_fee_amount: 0, // No platform fee on tips
        transfer_data: {
          destination: stripeAccountId, // 100% to host
        },
        metadata: {
          type: "tip",
          hostId: hostId,
          eventId: eventId || "",
          userId: userId,
          message: message || "",
          platformFee: "0",
        },
        description: "Tip for host",
      });

      console.log("✅ Tip Payment Intent created:", paymentIntent.id);

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        breakdown: {
          total: amount,
          platformFee: 0,
          hostReceives: amount,
          currency: "mxn",
        },
      });
    } catch (error) {
      console.error("❌ Error creating tip payment intent:", error);
      res.status(500).json({error: error.message});
    }
  },
);

/**
 * Create Payment Intent for a MEMBERSHIP plan purchase.
 * Same fee model as event tickets (user pays platform + processing fees on
 * top; host receives 100% of the plan price via Stripe Connect).
 */
exports.createMembershipPaymentIntent = onRequest(
  {cors: true, secrets: [stripeSecretKey]},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }

    try {
      if (!stripe) {
        stripe = require("stripe")(stripeSecretKey.value());
      }

      const {planId, userId} = req.body;
      if (!planId || !userId) {
        return res.status(400).json({error: "Missing required fields"});
      }

      // Load the plan
      const planDoc = await db.collection("membershipPlans").doc(planId).get();
      if (!planDoc.exists) {
        return res.status(404).json({error: "Plan not found"});
      }
      const plan = planDoc.data();
      if (plan.active === false) {
        return res.status(400).json({error: "This plan is no longer available"});
      }

      const hostId = plan.hostId;

      // Host must have a Stripe Connect account able to accept payments
      const hostDoc = await db.collection("users").doc(hostId).get();
      if (!hostDoc.exists) {
        return res.status(404).json({error: "Host not found"});
      }
      const hostData = hostDoc.data();
      const stripeAccountId = hostData.stripeConnect?.accountId;
      if (!stripeAccountId) {
        return res.status(400).json({
          error: "Host has not connected their Stripe account",
        });
      }
      if (!hostData.hostConfig?.canCreatePaidEvents) {
        return res.status(400).json({
          error: "Host cannot accept payments yet",
        });
      }

      const {calculateCheckoutAmount} = require("./stripe/pricing");
      const pricing = calculateCheckoutAmount(plan.priceCentavos);

      // Buyer email → Stripe sends an automatic receipt to it.
      const buyerEmail = await getUserEmail(userId);

      const paymentIntentConfig = {
        amount: pricing.totalAmount,
        currency: "mxn",
        receipt_email: buyerEmail || undefined,
        metadata: {
          type: "membership",
          planId: planId,
          planName: plan.name,
          planType: plan.type,
          creditsIncluded: (plan.creditsIncluded || 0).toString(),
          validityDays: (plan.validityDays || 0).toString(),
          userId: userId,
          hostId: hostId,
          eventPrice: pricing.eventPrice.toString(),
          platformFee: pricing.platformFee.toString(),
          stripeFee: pricing.stripeFee.toString(),
          totalAmount: pricing.totalAmount.toString(),
          hostReceives: pricing.hostReceives.toString(),
          feeModel: "USER_PAYS_FEES",
        },
        description: `Membership: ${plan.name}`,
        application_fee_amount: pricing.platformFee + pricing.stripeFee,
        transfer_data: {destination: stripeAccountId},
      };

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentConfig,
      );

      console.log("✅ Membership Payment Intent created:", paymentIntent.id);

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        breakdown: {
          planPrice: pricing.eventPrice,
          platformFee: pricing.platformFee,
          stripeFee: pricing.stripeFee,
          totalAmount: pricing.totalAmount,
          currency: "mxn",
        },
      });
    } catch (error) {
      console.error("❌ Error creating membership payment intent:", error);
      res.status(500).json({error: error.message});
    }
  },
);

// ============================================
// FEATURED-EVENT PROMOTIONS (platform keeps 100%)
// ============================================

/**
 * Create a PaymentIntent to promote (feature) an event. Charged to the host's
 * card with the funds going to the PLATFORM account — no Connect transfer — so
 * the platform keeps 100%. The webhook flips the event to featured on success.
 */
exports.createPromotionPaymentIntent = onRequest(
  {cors: true, secrets: [stripeSecretKey]},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }
    try {
      if (!stripe) {
        stripe = require("stripe")(stripeSecretKey.value());
      }
      const {eventId, planId, userId} = req.body;
      if (!eventId || !planId || !userId) {
        return res.status(400).json({error: "Missing required fields"});
      }

      const {getPromotionPlan} = require("./stripe/promotions");
      const plan = getPromotionPlan(planId);
      if (!plan) return res.status(400).json({error: "Invalid promotion plan"});

      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) {
        return res.status(404).json({error: "Event not found"});
      }
      // Only the event's own host may promote it.
      if (getEventCreatorId(eventDoc.data()) !== userId) {
        return res.status(403).json({error: "Only the host can promote this event"});
      }

      const buyerEmail = await getUserEmail(userId);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: plan.priceCentavos,
        currency: "mxn",
        receipt_email: buyerEmail || undefined,
        // No transfer_data / application_fee → 100% to the platform account.
        metadata: {
          type: "promotion",
          eventId,
          eventTitle: eventDoc.data().title || "",
          planId,
          days: plan.days.toString(),
          tier: plan.tier,
          hostId: userId,
          amount: plan.priceCentavos.toString(),
        },
        description: `Featured promotion: ${eventDoc.data().title || eventId}`,
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amountCentavos: plan.priceCentavos,
      });
    } catch (error) {
      console.error("❌ Error creating promotion payment intent:", error);
      res.status(500).json({error: error.message});
    }
  },
);

// ============================================
// MEMBERSHIP CREDIT RESERVE / REDEEM / RELEASE
// Credits are deducted at host check-in (not at RSVP). RSVP places a "hold"
// (a reservation) that counts against available credits to prevent
// over-booking; check-in redeems it; cancelling ≥ 2 h before releases it.
// ============================================

const CANCELLATION_WINDOW_HOURS = 2;

/**
 * Resolve an event's scheduled start as a JS Date.
 * @param {object} eventData - Firestore event document data
 * @return {Date|null}
 */
function eventStartDate(eventData) {
  const d = eventData.date;
  if (!d) return null;
  if (d.toDate) return d.toDate();
  return new Date(d);
}

/**
 * Reserve a membership credit for an event (places a hold; does not deduct).
 * data: { eventId }
 */
exports.reserveMembershipCredit = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const {eventId} = request.data || {};
  if (!eventId) throw new HttpsError("invalid-argument", "Missing eventId.");

  const eventSnap = await db.collection("events").doc(eventId).get();
  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  const eventData = eventSnap.data();
  if (eventData.acceptsMembership === false) {
    throw new HttpsError("failed-precondition", "This event doesn't accept memberships.");
  }
  const hostId = getEventCreatorId(eventData);
  const creditCost = eventData.creditCost || 1;

  // Already reserved for this event?
  const dupe = await db
    .collection("membershipReservations")
    .where("eventId", "==", eventId)
    .where("userId", "==", uid)
    .where("status", "==", "reserved")
    .limit(1)
    .get();
  if (!dupe.empty) {
    return {success: true, reservationId: dupe.docs[0].id, alreadyReserved: true};
  }

  // Find the user's active memberships with this host.
  const membershipsSnap = await db
    .collection("memberships")
    .where("userId", "==", uid)
    .where("hostId", "==", hostId)
    .get();

  const now = Date.now();
  const candidates = membershipsSnap.docs
    .map((d) => ({id: d.id, ...d.data()}))
    .filter((m) => {
      const exp = m.expiresAt?.toMillis ? m.expiresAt.toMillis() : 0;
      return m.status !== "cancelled" && exp > now;
    });

  if (candidates.length === 0) {
    throw new HttpsError("failed-precondition", "No active membership with this host.");
  }

  // Prefer credit packs with available credits (minus active holds); fall back
  // to unlimited passes.
  let chosen = null;
  for (const m of candidates.sort(
    (a, b) => (a.expiresAt?.toMillis() || 0) - (b.expiresAt?.toMillis() || 0),
  )) {
    if (m.type === "unlimited") {
      chosen = m;
      break;
    }
    const holdsSnap = await db
      .collection("membershipReservations")
      .where("membershipId", "==", m.id)
      .where("status", "==", "reserved")
      .get();
    const available = (m.creditsRemaining || 0) - holdsSnap.size;
    if (available >= creditCost) {
      chosen = m;
      break;
    }
  }

  if (!chosen) {
    throw new HttpsError(
      "failed-precondition",
      "No credits left. Please renew your membership or pay for this class.",
    );
  }

  const reservationRef = await db.collection("membershipReservations").add({
    membershipId: chosen.id,
    userId: uid,
    hostId,
    eventId,
    eventTitle: eventData.title || "",
    creditCost,
    membershipType: chosen.type,
    status: "reserved",
    reservedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Add the user to the event attendees.
  await db.collection("events").doc(eventId).update({
    attendees: admin.firestore.FieldValue.arrayUnion(uid),
  });

  return {success: true, reservationId: reservationRef.id};
});

/**
 * Redeem a reservation at check-in (host only) — deducts the credit.
 * data: { reservationId }
 */
exports.redeemMembershipCredit = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const {reservationId} = request.data || {};
  if (!reservationId) throw new HttpsError("invalid-argument", "Missing reservationId.");

  const result = await db.runTransaction(async (tx) => {
    const resRef = db.collection("membershipReservations").doc(reservationId);
    const resSnap = await tx.get(resRef);
    if (!resSnap.exists) throw new HttpsError("not-found", "Reservation not found.");
    const reservation = resSnap.data();

    if (reservation.hostId !== uid) {
      throw new HttpsError("permission-denied", "Only the host can check in attendees.");
    }
    if (reservation.status !== "reserved") {
      return {alreadyProcessed: true, status: reservation.status};
    }

    const memRef = db.collection("memberships").doc(reservation.membershipId);
    const memSnap = await tx.get(memRef);
    if (!memSnap.exists) throw new HttpsError("not-found", "Membership not found.");
    const membership = memSnap.data();

    const cost = reservation.creditCost || 1;
    const updates = {updatedAt: admin.firestore.FieldValue.serverTimestamp()};
    if (membership.type === "credits") {
      const remaining = Math.max(0, (membership.creditsRemaining || 0) - cost);
      updates.creditsRemaining = remaining;
      if (remaining === 0) updates.status = "depleted";
    }
    tx.update(memRef, updates);

    tx.update(resRef, {
      status: "redeemed",
      redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
      redeemedBy: uid,
    });

    const redemptionRef = db.collection("membershipRedemptions").doc();
    tx.set(redemptionRef, {
      membershipId: reservation.membershipId,
      reservationId,
      userId: reservation.userId,
      hostId: reservation.hostId,
      eventId: reservation.eventId,
      eventTitle: reservation.eventTitle || "",
      creditsDeducted: membership.type === "credits" ? cost : 0,
      redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
      redeemedBy: uid,
      status: "redeemed",
    });

    return {
      creditsRemaining:
        membership.type === "credits" ? updates.creditsRemaining : null,
    };
  });

  return {success: true, ...result};
});

/**
 * Release a reservation when an attendee cancels.
 * ≥ 2 h before start → credit is returned (hold released).
 * < 2 h before start → credit is forfeited (deducted as a penalty).
 * data: { reservationId }
 */
exports.releaseMembershipReservation = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const {reservationId} = request.data || {};
  if (!reservationId) throw new HttpsError("invalid-argument", "Missing reservationId.");

  const resRef = db.collection("membershipReservations").doc(reservationId);
  const resSnap = await resRef.get();
  if (!resSnap.exists) throw new HttpsError("not-found", "Reservation not found.");
  const reservation = resSnap.data();

  if (reservation.userId !== uid && reservation.hostId !== uid) {
    throw new HttpsError("permission-denied", "Not allowed.");
  }
  if (reservation.status !== "reserved") {
    return {success: true, alreadyProcessed: true};
  }

  const eventSnap = await db.collection("events").doc(reservation.eventId).get();
  const start = eventSnap.exists ? eventStartDate(eventSnap.data()) : null;
  const hoursUntil = start ? (start.getTime() - Date.now()) / 3600000 : 999;
  const forfeit = hoursUntil < CANCELLATION_WINDOW_HOURS;

  if (forfeit) {
    // Within the window: deduct the credit as a penalty.
    await db.runTransaction(async (tx) => {
      const memRef = db.collection("memberships").doc(reservation.membershipId);
      const memSnap = await tx.get(memRef);
      if (memSnap.exists) {
        const membership = memSnap.data();
        if (membership.type === "credits") {
          const remaining = Math.max(
            0,
            (membership.creditsRemaining || 0) - (reservation.creditCost || 1),
          );
          const u = {
            creditsRemaining: remaining,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (remaining === 0) u.status = "depleted";
          tx.update(memRef, u);
        }
      }
      tx.update(resRef, {
        status: "forfeited",
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } else {
    await resRef.update({
      status: "released",
      releasedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Remove the attendee from the event regardless.
  await db.collection("events").doc(reservation.eventId).update({
    attendees: admin.firestore.FieldValue.arrayRemove(reservation.userId),
  });

  return {success: true, forfeited: forfeit};
});

// ============================================
// MEMBERSHIP REMINDERS (scheduled, daily)
// Notifies members about low credits, upcoming expiry, and expiration, and
// flips expired memberships to status "expired". Each reminder fires once
// (tracked in remindersSent) to avoid spamming.
// ============================================

/**
 * Write an in-app notification.
 * @param {string} userId
 * @param {object} payload
 * @return {Promise<void>}
 */
async function pushMembershipNotification(userId, payload) {
  await db.collection("notifications").add({
    userId,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...payload,
  });
}

exports.sendMembershipReminders = onSchedule(
  {schedule: "every day 09:00", timeZone: "America/Mexico_City"},
  async () => {
    const now = Date.now();
    const snap = await db
      .collection("memberships")
      .where("status", "in", ["active", "depleted"])
      .get();

    console.log(`🔔 Checking ${snap.size} memberships for reminders`);
    let sent = 0;

    for (const docSnap of snap.docs) {
      const m = docSnap.data();
      const expMs = m.expiresAt?.toMillis ? m.expiresAt.toMillis() : 0;
      const reminders = m.remindersSent || {};
      const updates = {};
      let changed = false;
      const planMeta = {membershipId: docSnap.id, planId: m.planId, planName: m.planName};

      if (expMs && expMs < now) {
        // Expired
        if (m.status !== "expired") {
          updates.status = "expired";
          changed = true;
        }
        if (!reminders.expired) {
          await pushMembershipNotification(m.userId, {
            type: "membership_expired",
            title: "Membership expired",
            message: `Your "${m.planName}" has expired. Renew to keep attending.`,
            icon: "⌛",
            metadata: planMeta,
          });
          reminders.expired = true;
          updates.remindersSent = reminders;
          changed = true;
          sent++;
        }
      } else if (expMs) {
        const daysLeft = Math.ceil((expMs - now) / 86400000);

        if (daysLeft <= 1 && !reminders.expiring1) {
          await pushMembershipNotification(m.userId, {
            type: "membership_expiring",
            title: "Membership expires tomorrow",
            message: `Your "${m.planName}" expires soon. Renew so you don't lose access.`,
            icon: "⏳",
            metadata: planMeta,
          });
          reminders.expiring1 = true;
          updates.remindersSent = reminders;
          changed = true;
          sent++;
        } else if (daysLeft <= 7 && !reminders.expiring7) {
          await pushMembershipNotification(m.userId, {
            type: "membership_expiring",
            title: "Membership expiring soon",
            message: `Your "${m.planName}" expires in ${daysLeft} days. Renew anytime.`,
            icon: "⏳",
            metadata: planMeta,
          });
          reminders.expiring7 = true;
          updates.remindersSent = reminders;
          changed = true;
          sent++;
        }

        // Low credits (credit packs only)
        const remaining = m.creditsRemaining || 0;
        if (
          m.type === "credits" &&
          remaining > 0 &&
          remaining <= 2 &&
          !reminders.lowCredits
        ) {
          await pushMembershipNotification(m.userId, {
            type: "membership_low_credits",
            title: "Running low on classes",
            message: `Only ${remaining} class${
              remaining === 1 ? "" : "es"
            } left on "${m.planName}". Renew to top up.`,
            icon: "🎟️",
            metadata: planMeta,
          });
          reminders.lowCredits = true;
          updates.remindersSent = reminders;
          changed = true;
          sent++;
        }
      }

      if (changed) {
        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await docSnap.ref.update(updates);
      }
    }

    console.log(`✅ Membership reminders sent: ${sent}`);
    return null;
  },
);

// ============================================
// RATINGS AGGREGATION (server-side, manipulation-proof)
// Recomputes the event's and the host's average rating whenever a new rating
// is created. Done server-side so hosts can't edit/inflate their own averages.
// ============================================
exports.onRatingCreated = onDocumentCreated(
  "ratings/{ratingId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const rating = snap.data();
    const {eventId, hostId} = rating;
    const round1 = (n) => Math.round(n * 10) / 10;

    try {
      // Event average
      if (eventId) {
        const evRatings = await db
          .collection("ratings")
          .where("eventId", "==", eventId)
          .get();
        let sum = 0;
        evRatings.forEach((d) => (sum += d.data().rating || 0));
        const n = evRatings.size;
        if (n > 0) {
          await db.collection("events").doc(eventId).update({
            averageRating: round1(sum / n),
            totalRatings: n,
          });
        }
      }

      // Host average (across all their rated events)
      if (hostId) {
        const hostRatings = await db
          .collection("ratings")
          .where("hostId", "==", hostId)
          .get();
        let sum = 0;
        const events = new Set();
        hostRatings.forEach((d) => {
          sum += d.data().rating || 0;
          if (d.data().eventId) events.add(d.data().eventId);
        });
        const n = hostRatings.size;
        if (n > 0) {
          await db.collection("users").doc(hostId).update({
            "hostStats.averageRating": round1(sum / n),
            "hostStats.totalRatings": n,
            "hostStats.ratedEventsCount": events.size,
          });
        }
      }
      console.log("✅ Ratings aggregated for event/host");
    } catch (e) {
      console.error("❌ Error aggregating ratings:", e);
    }
  },
);

// ============================================
// CAR POOL — loyalty + notifications
// On a rider request → notify the driver. On approval → notify the rider and
// increment the driver's carpoolStats.seatsShared (server-side, so the loyalty
// metric can't be self-inflated).
// ============================================
exports.onCarpoolRiderWritten = onDocumentWritten(
  "events/{eventId}/carpools/{carpoolId}/riders/{riderId}",
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    const {eventId, carpoolId, riderId} = event.params;

    const newRequest = !before && after && after.status === "requested";
    const justApproved =
      (before?.status !== "approved") && after?.status === "approved";
    if (!newRequest && !justApproved) return;

    const cpSnap = await db
      .doc(`events/${eventId}/carpools/${carpoolId}`)
      .get();
    if (!cpSnap.exists) return;
    const carpool = cpSnap.data();

    if (newRequest) {
      await db.collection("notifications").add({
        userId: carpool.driverId,
        type: "carpool_request",
        title: "Seat request 🚗",
        message: `${after.name || "Someone"} wants a seat in your car pool`,
        icon: "🚗",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {eventId, eventTitle: carpool.eventTitle || ""},
      });
      return;
    }

    // Approved: reward the driver + notify the rider.
    await db.collection("users").doc(carpool.driverId).set(
      {
        carpoolStats: {
          seatsShared: admin.firestore.FieldValue.increment(1),
        },
      },
      {merge: true},
    );
    await db.collection("notifications").add({
      userId: riderId,
      type: "carpool_approved",
      title: "Ride confirmed 🚗",
      message: `You've got a seat in ${carpool.driverName || "the"} car pool!`,
      icon: "🚗",
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {eventId, eventTitle: carpool.eventTitle || ""},
    });
  },
);

// ============================================
// HOST GROUP messages → notify members (in-app + push)
// ============================================
exports.onGroupMessage = onDocumentCreated(
  "hostGroups/{groupId}/messages/{messageId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const msg = snap.data();
    const {groupId} = event.params;

    const gSnap = await db.doc(`hostGroups/${groupId}`).get();
    if (!gSnap.exists) return;
    const group = gSnap.data();

    const recipients = new Set([group.hostId, ...(group.memberIds || [])]);
    recipients.delete(msg.senderId);
    if (recipients.size === 0) return;

    const senderDoc = await db.collection("users").doc(msg.senderId).get();
    const senderName = senderDoc.exists ?
      senderDoc.data().fullName?.split(" ")[0] ||
        senderDoc.data().name?.split(" ")[0] ||
        "Someone" :
      "Someone";
    const preview = `${senderName}: ${msg.text || ""}`.slice(0, 140);

    const pushes = [];
    for (const uid of recipients) {
      await db.collection("notifications").add({
        userId: uid,
        type: "group_message",
        title: group.name || "Group",
        message: preview,
        icon: "💬",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {groupId, groupName: group.name || ""},
      });
      const u = await db.collection("users").doc(uid).get();
      if (u.exists && u.data().pushToken) {
        pushes.push({
          pushToken: u.data().pushToken,
          title: group.name || "Group",
          body: preview,
          data: {type: "group_message", groupId},
        });
      }
    }
    if (pushes.length > 0) await sendBatchPushNotifications(pushes);
    console.log(`✅ Group message notified ${recipients.size} member(s)`);
  },
);

/**
 * Get pricing info
 */
exports.getPricingInfo = onRequest({cors: true}, (req, res) => {
  const amount = parseInt(req.query.amount) || 0;

  if (amount < 5000) {
    return res.status(400).json({
      error: "Amount too low (minimum $50 MXN)",
    });
  }

  const split = calculateEventSplit(amount);
  const premiumPrice = getPremiumSubscriptionPrice();

  res.json({
    eventSplit: split,
    premiumSubscription: premiumPrice,
    minimums: {
      eventPrice: "$50 MXN",
      tip: "$10 MXN",
    },
  });
});

exports.cancelEventAttendance = cancelEventAttendance;
exports.hostCancelEvent = hostCancelEvent;

// Import Stripe Connect functions
const {
  createConnectAccount,
  createAccountLink,
  getAccountStatus,
  stripeConnectWebhook,
} = require("./stripe/stripeConnect");

// Export Stripe Connect functions
exports.createConnectAccount = createConnectAccount;
exports.createAccountLink = createAccountLink;
exports.getAccountStatus = getAccountStatus;
exports.stripeConnectWebhook = stripeConnectWebhook;

// Import Event Notifications
const {
  onEventAttendeesChanged,
} = require("./notifications/eventNotifications");

// Export Event Notifications
exports.onEventAttendeesChanged = onEventAttendeesChanged;

// Import Stripe Payment Webhook
const {stripePaymentWebhook} = require("./stripe/paymentWebhook");

// Export Stripe Payment Webhook
exports.stripePaymentWebhook = stripePaymentWebhook;


// ============================================
// DELETE ACCOUNT
// ============================================

/**
 * Delete user account and all associated data
 * This is required by Apple App Store guidelines
 */
exports.deleteUserAccount = onRequest(
  {cors: true},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }

    try {
      const {userId} = req.body;

      if (!userId) {
        return res.status(400).json({error: "Missing userId"});
      }

      console.log("🗑️ Starting account deletion for user:", userId);

      // 1. Delete user's events (where they are creator)
      const eventsSnapshot = await db
        .collection("events")
        .where("creatorId", "==", userId)
        .get();

      const eventDeletePromises = eventsSnapshot.docs.map(async (eventDoc) => {
        // Delete event messages subcollection
        const messagesSnapshot = await eventDoc.ref.collection("messages").get();
        const messageDeletes = messagesSnapshot.docs.map((msg) => msg.ref.delete());
        await Promise.all(messageDeletes);

        // Delete event document
        return eventDoc.ref.delete();
      });
      await Promise.all(eventDeletePromises);
      console.log("✅ Deleted", eventsSnapshot.size, "events created by user");

      // 3. Delete user's notifications
      const notificationsSnapshot = await db
        .collection("notifications")
        .where("userId", "==", userId)
        .get();

      const notifDeletePromises = notificationsSnapshot.docs.map((doc) => doc.ref.delete());
      await Promise.all(notifDeletePromises);
      console.log("✅ Deleted", notificationsSnapshot.size, "notifications");

      // 4. Delete user's ratings
      const ratingsSnapshot = await db
        .collection("ratings")
        .where("raterId", "==", userId)
        .get();

      const ratingDeletePromises = ratingsSnapshot.docs.map((doc) => doc.ref.delete());
      await Promise.all(ratingDeletePromises);
      console.log("✅ Deleted", ratingsSnapshot.size, "ratings");

      // 5. Delete user document from Firestore
      await db.collection("users").doc(userId).delete();
      console.log("✅ Deleted user document");

      // 6. Delete user from Firebase Auth
      try {
        await admin.auth().deleteUser(userId);
        console.log("✅ Deleted user from Firebase Auth");
      } catch (authError) {
        console.error("⚠️ Error deleting from Auth (may already be deleted):", authError.message);
      }

      // 7. Delete user's files from Storage (profile photos, etc.)
      try {
        const bucket = admin.storage().bucket();
        const [files] = await bucket.getFiles({prefix: `users/${userId}/`});
        const deleteFilePromises = files.map((file) => file.delete());
        await Promise.all(deleteFilePromises);
        console.log("✅ Deleted", files.length, "files from storage");
      } catch (storageError) {
        console.error("⚠️ Error deleting from Storage:", storageError.message);
      }

      console.log("🎉 Account deletion complete for user:", userId);

      res.json({
        success: true,
        message: "Account deleted successfully",
        deletedData: {
          events: eventsSnapshot.size,
          notifications: notificationsSnapshot.size,
          ratings: ratingsSnapshot.size,
        },
      });
    } catch (error) {
      console.error("❌ Error deleting account:", error);
      res.status(500).json({error: error.message});
    }
  },
);

// ============================================
// HOST REQUEST NOTIFICATIONS
// ============================================

/**
 * Trigger when a new host request is created
 * Sends push notification to all admins
 */
exports.onNewHostRequest = onDocumentCreated(
  "hostRequests/{requestId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log("⚠️ No data in snapshot");
      return;
    }

    const requestData = snapshot.data();
    const {requestId} = event.params;

    console.log("📝 New host request detected:", {
      requestId,
      userId: requestData.userId,
      status: requestData.status,
    });

    // Only process pending requests
    if (requestData.status !== "pending") {
      console.log("⏭️ Skipping non-pending request");
      return;
    }

    try {
      // Get requester info
      const requesterDoc = await db
        .collection("users")
        .doc(requestData.userId)
        .get();
      const requesterName = requesterDoc.exists ?
        requesterDoc.data().fullName?.split(" ")[0] ||
          requesterDoc.data().name?.split(" ")[0] ||
          "Someone" :
        "Someone";

      // Get all admin users
      const adminsSnapshot = await db
        .collection("users")
        .where("role", "==", "admin")
        .get();

      console.log("👑 Found", adminsSnapshot.size, "admin(s)");

      if (adminsSnapshot.empty) {
        console.log("⚠️ No admins found to notify");
        return;
      }

      // Prepare notifications for all admins
      const notifications = [];

      for (const adminDoc of adminsSnapshot.docs) {
        const adminData = adminDoc.data();
        const pushToken = adminData.pushToken;

        // Create in-app notification
        await db.collection("notifications").add({
          userId: adminDoc.id,
          type: "host_request",
          title: "New Host Request 📝",
          message: `${requesterName} wants to become a host. Review their application!`,
          icon: "👑",
          read: false,
          metadata: {
            requestId: requestId,
            requesterId: requestData.userId,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log("📝 Created in-app notification for admin:", adminDoc.id);

        // Queue push notification if token exists
        if (pushToken) {
          notifications.push({
            pushToken,
            title: "New Host Request 👑",
            body: `${requesterName} wants to become a host`,
            data: {
              type: "host_request",
              requestId: requestId,
            },
          });
          console.log("📱 Queued push notification for admin:", adminDoc.id);
        }
      }

      // Send push notifications
      if (notifications.length > 0) {
        const tickets = await sendBatchPushNotifications(notifications);
        console.log(
          `✅ Sent ${tickets.length} push notifications to admins`,
        );
      }
    } catch (error) {
      console.error("❌ Error processing host request:", error);
    }
  },
);
