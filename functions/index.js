/**
 * BondVibe Cloud Functions
 * Payment processing with Stripe + Push Notifications
 */

const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
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

    // Only process text and location messages
    if (!["text", "location"].includes(messageData.type)) {
      console.log("⏭️ Skipping non-text/location message");
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
      if (eventData.creatorId) {
        participantIds.add(eventData.creatorId);
      }

      // Add attendees (handle both formats)
      if (Array.isArray(eventData.attendees)) {
        eventData.attendees.forEach((attendee) => {
          if (typeof attendee === "object" && attendee?.userId) {
            participantIds.add(attendee.userId);
          } else if (typeof attendee === "string") {
            participantIds.add(attendee);
          }
        });
      }

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
      const hostId = eventData.createdBy || eventData.creatorId;

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
      const paymentIntentConfig = {
        amount: pricing.totalAmount, // User pays total (event + fees)
        currency: "mxn",
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

      // Tip goes 100% to host (no platform fee)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "mxn",
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
