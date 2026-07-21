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
const {detectProhibitedContent} = require("./contentGuard");


// Define secrets
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

// Initialize Stripe (will be done inside functions)
let stripe;

// Initialize Firebase Admin FIRST
admin.initializeApp();
const db = admin.firestore();

// Shared auth for HTTP endpoints (verify ID token, derive identity server-side).
const {verifyBearer, isAdminUid} = require("./lib/auth");

// Import refunds AFTER Firebase is initialized. processRefund is reused by the
// admin payouts callable (ledger-aware: held→refund, released→reversal+refund).
const {cancelEventAttendance, hostCancelEvent, processRefund} =
  require("./stripe/refunds");

// @handle claiming/checking (server-enforced uniqueness).
const {claimHandle, checkHandle, adminReassignHandle} = require("./handles");
const {sendVerificationEmail, sendPasswordResetEmail} = require("./authEmails");

// Import pricing logic
const {
  calculateEventSplit,
  getPremiumSubscriptionPrice,
} = require("./stripe/pricing");

// Import push notification service
const {sendBatchPushNotifications, sendPushNotification, unreadTotalForUser} =
  require("./notifications/pushService");
const {tPush, baseLang} = require("./i18n"); // BUG 34: localized notification strings
const bizAutomations = require("./business/automations");

// Import event helpers (attendee/creator normalization)
const {getAttendeeIds, getEventCreatorId, getHostIdForPayout} = require("./utils/eventHelpers");

// F2 gated-location derivation (pure helpers, unit-tested in lib/eventLocation.test.js)
const {
  snapApproxGrid, deriveArea, deriveVenue, coordFromData, coordsEqual,
} = require("./lib/eventLocation");
// Modular FieldValue — same as FieldValue in prod, but stub-safe
// under the functions emulator (whose admin stub drops the namespaced statics).
const {FieldValue} = require("firebase-admin/firestore");

// Community Matching functions (defined in ./matching, re-exported below).
const matching = require("./matching/matching");
exports.setMatchingConfig = matching.setMatchingConfig;
exports.advanceMatchingWindows = matching.advanceMatchingWindows;
exports.createLikeAndMaybeMatch = matching.createLikeAndMaybeMatch;
exports.getHostMatchAnalytics = matching.getHostMatchAnalytics;

// Matchmaking v2 — weekly curated sets + double opt-in intros (P2). Server-truth
// affinity + server-side freemium gate (locked sets never leave the server).
const curated = require("./matching/curated");
exports.requestCuratedSet = curated.requestCuratedSet;
exports.generateWeeklyCuratedSets = curated.generateWeeklyCuratedSets;
exports.requestMatchIntro = curated.requestMatchIntro;

// Matchmaking v2 — community-scoped groups of 4-6 (P3). Chat activates at 3+.
const matchGroups = require("./matching/groups");
exports.formMatchGroups = matchGroups.formMatchGroups;
exports.joinMatchGroup = matchGroups.joinMatchGroup;

// Wall v2 — Descubre: affinity people discovery + server-side freemium gate (P1).
const wallDiscover = require("./wall/discover");
exports.discoverForYou = wallDiscover.discoverForYou;

// Wall v2 — post reach stats (P2, Pro): server-side impression/CTA counters.
const wallPostStats = require("./wall/postStats");
exports.recordPostEvent = wallPostStats.recordPostEvent;

// Wall v2 — Moments 24h TTL: hourly server-side purge of expired items (P3).
const wallMoments = require("./wall/moments");
exports.purgeExpiredMoments = wallMoments.purgeExpiredMoments;

// Social layer — server-maintained post counts.
const social = require("./social/social");
exports.onPostLikeWritten = social.onPostLikeWritten;
exports.onPostCommentWritten = social.onPostCommentWritten;
exports.onPostCreated = social.onPostCreated;
exports.onFollowCreated = social.onFollowCreated;

// Admin: user emails come from Firebase Auth (no longer stored in the
// world-readable users doc). Admin-gated.
exports.adminListUserEmails = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid || !(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "admin only");
  }
  const emails = {};
  let pageToken;
  do {
    const res = await admin.auth().listUsers(1000, pageToken);
    res.users.forEach((u) => {
      emails[u.uid] = u.email || null;
    });
    pageToken = res.pageToken;
  } while (pageToken);
  return {emails};
});

/**
 * Activate hosting for the calling user (host onboarding redesign, phase 3).
 *
 * Hosting used to be switched on by the client writing role:'host' straight into
 * its own user doc. The rules permitted it — the owner could always set role to
 * 'user' or 'host' — so the "wait for admin approval" step was a UI convention
 * and nothing more: a modified client could grant itself hosting at any time.
 * We've now decided free hosting genuinely IS instant, and the rules no longer
 * let anyone set their own role. So the grant has to happen here, where it can
 * actually be enforced.
 *
 * Free is instant. Paid activates hosting too — free events work right away —
 * but never unlocks money: canCreatePaidEvents stays false until Stripe reports
 * the account charge-enabled, and hostApproved (admin-only) still gates review.
 */
/**
 * Assign a membership by hand and record how it was paid — Kinlo Pro.
 *
 * This runs on the server because the entitlement has to be enforced somewhere a
 * modified client can't reach. Hiding the sheet stops an honest host from
 * stumbling into a paid feature; it doesn't stop anyone from calling the write
 * directly. Manual assignment IS the Pro feature — it's how a studio takes cash
 * without Stripe — so the check belongs here, not in the UI.
 *
 * Produces the SAME activePackage the online checkout produces. That's the whole
 * premise of the unification: one product, two ways in, one runtime.
 */
exports.assignPlanManually = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }

  const {bizId, memberId, planId, paymentMethod} = request.data || {};
  if (!bizId || !memberId || !planId) {
    throw new HttpsError("invalid-argument", "bizId, memberId and planId are required.");
  }
  const METHODS = ["cash", "transfer", "comped"];
  if (!METHODS.includes(paymentMethod)) {
    throw new HttpsError("invalid-argument", `paymentMethod must be one of ${METHODS}.`);
  }

  // bizId === ownerUid (v1). Only the owner assigns: an assignment records money
  // taken against their business.
  if (bizId !== uid) {
    throw new HttpsError("permission-denied", "Not your business.");
  }

  const ownerSnap = await db.collection("users").doc(uid).get();
  if (ownerSnap.data()?.isPremium !== true) {
    // isPremium is set only by the Stripe subscription webhook — a client can't
    // write it (firestore.rules), so this is a real gate, not a suggestion.
    throw new HttpsError("permission-denied", "kinlo_pro_required");
  }

  const planSnap = await db
    .collection("businesses").doc(bizId).collection("plans").doc(planId).get();
  if (!planSnap.exists) {
    throw new HttpsError("not-found", "Plan not found.");
  }
  const plan = planSnap.data();
  if (!Array.isArray(plan.paymentModes) || !plan.paymentModes.includes("manual")) {
    // The host turned manual off for this plan. Honour that here too, or the
    // switch in the form would be decoration.
    throw new HttpsError("failed-precondition", "Plan is not assignable by hand.");
  }

  const memberRef = db
    .collection("businesses").doc(bizId).collection("members").doc(memberId);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError("not-found", "Member not found.");
  }
  const member = memberSnap.data();

  // Audience scope, mirroring assignPackage: a local-only plan can't go to a
  // general member. Enforced here because this path never touches that client.
  const tier = plan.audienceTier || "both";
  const memberTier = member.pricingTier || "general";
  if (tier !== "both" && tier !== memberTier) {
    throw new HttpsError("failed-precondition", "audience_mismatch");
  }

  const now = new Date();
  const credits = plan.unlimited ? null : (plan.credits || 0);
  const expiresAt = new Date(now.getTime() + (plan.validityDays || 30) * 86400000).toISOString();

  const activePackage = {
    packageId: planId,
    name: plan.name || "",
    kind: plan.kind || "class",
    creditsTotal: credits,
    creditsRemaining: credits,
    expiresAt,
    audienceTier: tier,
    assignedAt: now.toISOString(),
    // How it was paid — what "record payment" used to be, folded in.
    paymentMethod,
    assignedBy: uid,
  };

  const log = Array.isArray(member.creditLog) ? member.creditLog : [];
  await memberRef.update({
    activePackage,
    creditBalance: credits === null ? 0 : credits,
    creditLog: [
      {delta: credits || 0, reason: `assign:${plan.name}`, at: now.toISOString()},
      ...log,
    ].slice(0, 30),
    updatedAt: now.toISOString(),
  });

  return {ok: true, activePackage};
});

exports.activateHost = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  // Becoming a host requires a verified email (forgery-proof token claim).
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "email_not_verified");
  }

  const type = request.data && request.data.type;
  if (type !== "free" && type !== "paid") {
    throw new HttpsError("invalid-argument", "type must be 'free' or 'paid'.");
  }

  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "No user profile.");
  }

  const data = snap.data() || {};
  // Suspended accounts don't get to host their way back in.
  if (data.suspended === true) {
    throw new HttpsError("permission-denied", "Account suspended.");
  }

  const now = new Date().toISOString();
  // Don't degrade an existing admin to a plain host: keep their role and grant
  // hostApproved so they pass isApprovedHost() (the services/rentals gate)
  // WITHOUT a role change. A normal self-service host instead gets role:"host"
  // and passes ONLY via the role — so "decide later" (deferHostType) can revoke
  // it by flipping role back to "user" (no lingering hostApproved). data.role is
  // the user's own Firestore doc, read server-side (not client input), so this
  // is not spoofable.
  const isAdmin = data.role === "admin";
  await userRef.set({
    role: isAdmin ? "admin" : "host",
    ...(isAdmin ? {hostApproved: true} : {}),
    // ESCROW (§7): payout tier present from day one, default 'standard'. The
    // release cron resolves retention per host; 'super' (retention 0h) activates
    // later with no re-architecture.
    payoutTier: data.payoutTier || "standard",
    hostConfig: {
      type,
      // Only the Stripe status sync may ever set this true. Preserve it rather
      // than forcing false: an account that already finished Connect elsewhere
      // (e.g. the rentals flow) is genuinely charge-enabled already.
      canCreatePaidEvents:
        (data.hostConfig && data.hostConfig.canCreatePaidEvents) === true,
      payoutsIntent: type === "paid" ? "pending" : null,
      createdAt: (data.hostConfig && data.hostConfig.createdAt) || now,
      updatedAt: now,
    },
  }, {merge: true});

  return {ok: true, type};
});

/**
 * Step back from hosting before it starts — "decide later".
 *
 * Same reason as activateHost: role is server-owned now, so returning to a
 * plain user can't be a client write either. Marks the choice deferred so the
 * router stops prompting on every login.
 */
exports.deferHostType = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const now = new Date().toISOString();
  await db.collection("users").doc(uid).set({
    role: "user",
    hostConfig: {
      type: "deferred",
      canCreatePaidEvents: false,
      updatedAt: now,
    },
  }, {merge: true});
  return {ok: true};
});

// Admin management — grant/revoke admin via a Firebase Auth custom claim
// (the source of truth) AND keep the Firestore role in sync for UI. Only an
// existing admin may call these; the very first admin is bootstrapped
// out-of-band by scripts/migrate-admin-claims.mjs.
exports.promoteToAdmin = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid || !(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "admin only");
  }
  const targetUid = request.data && request.data.targetUid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "Missing targetUid.");
  }
  const user = await admin.auth().getUser(targetUid);
  await admin.auth().setCustomUserClaims(targetUid, {
    ...(user.customClaims || {}),
    admin: true,
  });
  await db.collection("users").doc(targetUid)
    .set({role: "admin"}, {merge: true});
  return {ok: true};
});

exports.revokeAdmin = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid || !(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "admin only");
  }
  const targetUid = request.data && request.data.targetUid;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "Missing targetUid.");
  }
  if (targetUid === uid) {
    throw new HttpsError("failed-precondition", "Cannot revoke your own admin.");
  }
  const user = await admin.auth().getUser(targetUid);
  const claims = {...(user.customClaims || {})};
  delete claims.admin;
  await admin.auth().setCustomUserClaims(targetUid, claims);
  await db.collection("users").doc(targetUid)
    .set({role: "user"}, {merge: true});
  return {ok: true};
});

// Notifications are created ONLY here (Firestore rules deny direct client
// create). The server stamps a trustworthy fromUserId + timestamp so a
// notification's sender can't be spoofed, and privileged types (host
// approval/rejection) are gated to admins so a random user can't phish a
// victim with a fake "You're a Verified Host!" message.
const ADMIN_ONLY_NOTIF_TYPES = new Set([
  "host_approved",
  "host_rejected",
]);

exports.createNotification = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

  const d = request.data || {};
  const toUserId = d.toUserId;
  const type = d.type;
  if (!toUserId || typeof toUserId !== "string") {
    throw new HttpsError("invalid-argument", "Missing toUserId.");
  }
  if (!type || typeof type !== "string" || type.length > 64) {
    throw new HttpsError("invalid-argument", "Invalid type.");
  }
  if (ADMIN_ONLY_NOTIF_TYPES.has(type) && !(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "This notification is admin-only.");
  }

  const str = (v, max) =>
    v == null ? "" : String(v).slice(0, max);
  const sanitizeScalars = (obj) => {
    const out = {};
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const k of Object.keys(obj).slice(0, 20)) {
        const val = obj[k];
        if (val == null || typeof val === "object") continue;
        out[String(k).slice(0, 64)] = str(val, 500);
      }
    }
    return out;
  };
  const metadata = sanitizeScalars(d.metadata);

  // BUG 34: a caller may pass i18n key + params instead of pre-rendered text, so
  // the recipient's client renders it in THEIR language. Store the keys + params;
  // the English title/message is generated from the catalog as the fallback.
  const titleKey = d.titleKey ? str(d.titleKey, 200) : null;
  const bodyKey = d.bodyKey ? str(d.bodyKey, 200) : null;
  const params = sanitizeScalars(d.params);
  const title = titleKey ?
    tPush(titleKey, "en", params) :
    (str(d.title, 200) || "Notification");
  const message = bodyKey ?
    tPush(bodyKey, "en", params) :
    str(d.message != null ? d.message : d.body, 1000);

  await db.collection("notifications").add({
    userId: toUserId,
    fromUserId: uid,
    type,
    title,
    message,
    ...(titleKey ? {titleKey} : {}),
    ...(bodyKey ? {bodyKey} : {}),
    ...(titleKey || bodyKey ? {params} : {}),
    icon: str(d.icon, 40) || "bell",
    read: false,
    metadata,
    relatedEventId: d.relatedEventId ? str(d.relatedEventId, 128) : null,
    relatedUserId: d.relatedUserId ? str(d.relatedUserId, 128) : null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {ok: true};
});

// AI Foundation — single gateway to Claude (kinlo_build/ai_features/02).
const aiFoundation = require("./ai/foundation");
exports.callClaude = aiFoundation.buildCallClaude(db, anthropicKey);

// Post-event recap posts (Smart Wall §10).
const aiRecaps = require("./ai/recaps");
exports.onRecapPhotoCreated =
  aiRecaps.buildOnRecapPhotoCreated(db, anthropicKey);

// Ask Kinlo live streaming (SSE).
const aiStream = require("./ai/stream");
exports.askKinloStream = aiStream.buildAskKinloStream(db, anthropicKey);

/**
 * Weekly Digest push (ai_features/14) — Mondays: nudge AI-opted-in users
 * that their week is ready. The digest itself is generated on open (one
 * cached Claude call per user per week, client-side; server enforces the
 * non-Plus monthly taste), so this job stays cheap: pushes only.
 */
exports.sendWeeklyDigestPush = onSchedule(
  {schedule: "every monday 10:00", timeZone: "America/Mexico_City"},
  async () => {
    const snap = await db.collection("users")
      .where("aiOptIn", "==", true).limit(500).get();
    const targets = snap.docs
      .map((d) => ({uid: d.id, ...d.data()}))
      .filter((u) => u.pushToken);
    console.log(`✨ Weekly digest push → ${targets.length} users`);
    if (targets.length === 0) return;
    // BUG 34: recipient = each opted-in user; localized per recipient from the
    // language already on the loaded user doc (no double read).
    await sendBatchPushNotifications(
      targets.map((u) => ({
        pushToken: u.pushToken,
        uid: u.uid,
        lang: baseLang(u.language),
        titleKey: "notifications.digest.title",
        bodyKey: "notifications.digest.body",
        params: {},
        data: {type: "weekly_digest", screen: "YourWeek"},
      })),
    );
  },
);

/**
 * Look up a user's email (for Stripe receipts). Returns null if unavailable.
 * @param {string} userId
 * @return {Promise<string|null>}
 */
async function getUserEmail(userId) {
  try {
    // Email lives in Firebase Auth (the login identity), not in the
    // world-readable users doc — read the authoritative source.
    const rec = await admin.auth().getUser(userId);
    return rec.email || null;
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
              // Icon badge (Fix B) = their current unread total + this message
              // (the event_messages aggregate is incremented below, after send).
              const badge = (await unreadTotalForUser(userId)) + 1;
              notifications.push({
                pushToken,
                uid: userId, // recipient = each chat participant
                lang: baseLang(userData.language), // reuse the loaded user doc
                // BUG 34: localize the title per recipient; the body is the
                // user's message text (user content — left as-is).
                titleKey: "notifications.event.chat.title",
                params: {sender: senderName, event: eventTitle},
                body: messageBody,
                data: {
                  type: "event_message",
                  eventId: eventId,
                  conversationId: `event_${eventId}`,
                  eventTitle: eventTitle,
                },
                badge,
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
              updatedAt: FieldValue.serverTimestamp(),
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
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
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

      // AUTH: the payer is the verified caller, not a body-supplied userId.
      const caller = await verifyBearer(req);
      if (!caller) {
        return res.status(401).json({error: "unauthenticated"});
      }
      // A verified email is required to pay (forgery-proof token claim).
      if (!caller.email_verified) {
        return res.status(403).json({error: "email_not_verified"});
      }
      const userId = caller.uid;
      const {eventId} = req.body;

      if (!eventId) {
        return res.status(400).json({error: "Missing required fields"});
      }

      // Get event data
      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) {
        return res.status(404).json({error: "Event not found"});
      }

      const eventData = eventDoc.data();

      // OVERSELL: enforce capacity BEFORE charging. Free joins go through
      // joinEvent (atomic capacity), but paid joins skipped this entirely — a
      // sold-out event still took the money. Fail fast here; the webhook adds
      // the attendee atomically (waitlists on the rare concurrent-payment race).
      {
        const att = Array.isArray(eventData.attendees) ? eventData.attendees : [];
        const ids = att
          .map((a) => (typeof a === "string" ? a : a && a.userId))
          .filter(Boolean);
        const max = eventData.maxAttendees || eventData.maxPeople || 0;
        if (max && !ids.includes(userId) && ids.length >= max) {
          return res.status(409).json({error: "event_full"});
        }
      }
      // BUG 32.6: pay the business OWNER for staff-created events (businessOwnerUid),
      // else the creator. Also scopes the two-tier member lookup to the owner's biz.
      const hostId = getHostIdForPayout(eventData);
      const paidToBusinessOwner = !!eventData.businessOwnerUid;

      // Two-tier pricing (kinlo_business/05 §C): a Local member is charged the
      // event's local price. Resolve the caller's tier from their linked CRM
      // member record under the host's business (default general). Which of the
      // two event prices applies is decided server-side; the amounts themselves
      // stay authoritative from the event doc (never a client price).
      let effectivePesos = eventData.price || 0;
      let pricingTierApplied = "general";
      if (eventData.twoTier && typeof eventData.priceLocal === "number") {
        try {
          const memSnap = await db
            .collection("businesses").doc(hostId)
            .collection("members")
            .where("linkedUid", "==", userId)
            .limit(1)
            .get();
          const tier = memSnap.empty ?
            "general" :
            (memSnap.docs[0].data().pricingTier || "general");
          if (tier === "local") {
            effectivePesos = eventData.priceLocal;
            pricingTierApplied = "local";
          }
        } catch (e) {
          // default to general on any lookup error
        }
      }

      // PRICE is authoritative from the event doc — NEVER trust a client price.
      const eventPrice = Math.round((effectivePesos || 0) * 100);

      // Get host's Stripe Connect account
      const hostDoc = await db.collection("users").doc(hostId).get();
      if (!hostDoc.exists) {
        return res.status(404).json({error: "Host not found"});
      }

      const hostData = hostDoc.data();
      const stripeAccountId = hostData.stripeConnect?.accountId;

      // BUG 32.6: a staff member can't fix the owner's Stripe — give a clear,
      // owner-specific message instead of a generic host error.
      if ((eventData.price || 0) > 0 && !stripeAccountId && paidToBusinessOwner) {
        return res.status(400).json({
          error: "owner_stripe_incomplete",
          details: "business_owner_stripe_incomplete",
        });
      }

      // NEW: Calculate fees using new pricing model (admin-configurable rates)
      const {calculateCheckoutAmount, getPricingConfig} = require("./stripe/pricing");
      const cfg = await getPricingConfig(db);
      const pricing = calculateCheckoutAmount(eventPrice, "stripe", {
        platformFeePercent: cfg.eventPlatformFeePercent,
        processorPercent: cfg.stripeFeePercent,
        processorFixed: cfg.stripeFixedCentavos,
      });

      console.log("💰 NEW Payment breakdown:", {
        eventPrice: pricing.eventPrice,
        platformFee: pricing.platformFee,
        stripeFee: pricing.stripeFee,
        totalAmount: pricing.totalAmount,
        hostReceives: pricing.hostReceives,
        refundableAmount: pricing.refundableAmount,
        stripeAccountId: stripeAccountId,
      });

      // Paid events: verify the host can ACTUALLY accept charges by asking
      // Stripe — never trust the client-forgeable Firestore flags
      // (stripeConnect.chargesEnabled / hostConfig.canCreatePaidEvents).
      if (eventPrice > 0) {
        const {assertCanCharge} = require("./stripe/verify");
        try {
          await assertCanCharge(stripe, stripeAccountId);
        } catch (e) {
          return res.status(400).json({
            error: "Host cannot accept payments yet",
            details: e.code || "host_payouts_not_ready",
          });
        }
      }

      // Create Payment Intent with NEW pricing
      // Buyer email → Stripe sends an automatic receipt to it.
      const buyerEmail = await getUserEmail(userId);

      // ESCROW (docs/DISENO_escrow_pagos.md §2): event end drives the release
      // date the webhook stamps on the ledger. Events store start `date` +
      // `durationMinutes` (no eventEndAt field) → derive it.
      const {eventEndAtMs} = require("./stripe/escrow");
      const eventEndMs = eventEndAtMs(eventData);
      const eventEndAtISO = Number.isFinite(eventEndMs) ?
        new Date(eventEndMs).toISOString() : "";

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
          pricingTierApplied,
          // NEW: Store all pricing details for refunds
          eventPrice: pricing.eventPrice.toString(),
          platformFee: pricing.platformFee.toString(),
          stripeFee: pricing.stripeFee.toString(),
          totalAmount: pricing.totalAmount.toString(),
          hostReceives: pricing.hostReceives.toString(),
          refundableAmount: pricing.refundableAmount.toString(),
          feeModel: "USER_PAYS_FEES",
          // ESCROW ledger inputs (webhook builds paymentLedger from these).
          hostAccountId: stripeAccountId || "",
          eventEndAt: eventEndAtISO,
        },
        description: `Ticket for ${eventData.title}`,
      };

      // ESCROW (§1/§2): SEPARATE CHARGES AND TRANSFERS. No transfer_data /
      // on_behalf_of / application_fee — the funds land in Kinlo's OWN balance
      // and the host is paid later by the releaseHostPayouts cron (after the
      // event + retention window). transfer_group links the charge to that
      // future transfer. This replaces the old destination charge, where Stripe
      // paid the host at capture and a later refund clawback could fail.
      if (eventPrice > 0) {
        paymentIntentConfig.transfer_group = eventId;
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

      // AUTH: the tipper is the verified caller, not a body-supplied userId
      // (mirrors createEventPaymentIntent / #43). Prevents a modified client
      // from attributing a tip to another user, and blocks unverified accounts.
      const caller = await verifyBearer(req);
      if (!caller) {
        return res.status(401).json({error: "unauthenticated"});
      }
      if (!caller.email_verified) {
        return res.status(403).json({error: "email_not_verified"});
      }
      const userId = caller.uid;
      const {hostId, eventId, amount, message} = req.body;

      if (!hostId || !amount) {
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
        // ESCROW B3 §6 — tips are NOT escrowed (instant gift to the host). But
        // on_behalf_of makes the HOST the merchant of record, so a disputed tip
        // is charged back to the host, not Kinlo (previously Kinlo, as MoR with
        // application_fee 0, ate 100% of a disputed tip). Tips never touch the
        // ledger or the release cron.
        on_behalf_of: stripeAccountId,
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

      // AUTH: the buyer is the verified caller, not a body-supplied userId.
      // This endpoint had NO auth at all: anyone could POST an arbitrary userId
      // and mint a PaymentIntent whose metadata.userId decides who the webhook
      // grants the membership to (and whose email receives the Stripe receipt).
      const caller = await verifyBearer(req);
      if (!caller) {
        return res.status(401).json({error: "unauthenticated"});
      }
      if (!caller.email_verified) {
        return res.status(403).json({error: "email_not_verified"});
      }
      const userId = caller.uid;
      const {planId} = req.body;
      if (!planId) {
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

      // BUG 32.6: pay the business OWNER for a staff-created plan, else the plan host.
      const hostId = plan.businessOwnerUid || plan.hostId;
      const paidToBusinessOwner = !!plan.businessOwnerUid;

      // Host must have a Stripe Connect account able to accept payments
      const hostDoc = await db.collection("users").doc(hostId).get();
      if (!hostDoc.exists) {
        return res.status(404).json({error: "Host not found"});
      }
      const hostData = hostDoc.data();
      const stripeAccountId = hostData.stripeConnect?.accountId;
      if (!stripeAccountId && paidToBusinessOwner) {
        return res.status(400).json({
          error: "owner_stripe_incomplete",
          details: "business_owner_stripe_incomplete",
        });
      }
      // Verify the host can actually charge by asking Stripe — the Firestore
      // chargesEnabled/canCreatePaidEvents flags are client-forgeable.
      if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
      {
        const {assertCanCharge} = require("./stripe/verify");
        try {
          await assertCanCharge(stripe, stripeAccountId);
        } catch (e) {
          return res.status(400).json({
            error: "Host cannot accept payments yet",
            details: e.code || "host_payouts_not_ready",
          });
        }
      }

      const {calculateCheckoutAmount, getPricingConfig} = require("./stripe/pricing");
      const memCfg = await getPricingConfig(db);
      const pricing = calculateCheckoutAmount(plan.priceCentavos, "stripe", {
        platformFeePercent: memCfg.eventPlatformFeePercent,
        processorPercent: memCfg.stripeFeePercent,
        processorFixed: memCfg.stripeFixedCentavos,
      });

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
          planType: "credits",
          creditsIncluded: (plan.creditsIncluded || 0).toString(),
          validityDays: (plan.validityDays || 0).toString(),
          audienceTier: plan.audienceTier || "both",
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
      // AUTH: the promoter is the verified caller, not a body-supplied userId.
      // Unauthenticated before, so the "only the host may promote" check below
      // was decorative — it compared the event's creator against a value the
      // caller controlled.
      const caller = await verifyBearer(req);
      if (!caller) {
        return res.status(401).json({error: "unauthenticated"});
      }
      if (!caller.email_verified) {
        return res.status(403).json({error: "email_not_verified"});
      }
      const userId = caller.uid;
      const {eventId, planId} = req.body;
      if (!eventId || !planId) {
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
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "email_not_verified");
  }
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

  // The credit check and the hold must be ONE atomic step. Read-then-write let
  // two concurrent RSVPs both count the same `holdsSnap` and both reserve, so a
  // membership could be over-booked past creditsRemaining (and the duplicate
  // check could double-book the same user). Mirrors reserveVehicle: every read
  // happens before any write, and Firestore retries the block on contention.
  const result = await db.runTransaction(async (tx) => {
    // --- reads ---
    // Already reserved for this event?
    const dupe = await tx.get(
      db
        .collection("membershipReservations")
        .where("eventId", "==", eventId)
        .where("userId", "==", uid)
        .where("status", "==", "reserved")
        .limit(1),
    );
    if (!dupe.empty) {
      return {success: true, reservationId: dupe.docs[0].id, alreadyReserved: true};
    }

    // OVERSELL: a membership join adds the user to attendees (below) but never
    // checked capacity — a full class still let credit-holders RSVP past
    // maxAttendees. Re-read the event inside the tx so the count is consistent
    // with the write. Full → reject (don't reserve the credit). joinEvent does
    // the same for free RSVPs.
    const evtSnap = await tx.get(db.collection("events").doc(eventId));
    if (evtSnap.exists) {
      const ev = evtSnap.data();
      const attIds = (Array.isArray(ev.attendees) ? ev.attendees : [])
        .map((a) => (typeof a === "string" ? a : a && a.userId))
        .filter(Boolean);
      const max = ev.maxAttendees || ev.maxPeople || 0;
      if (max && !attIds.includes(uid) && attIds.length >= max) {
        throw new HttpsError("failed-precondition", "event_full");
      }
    }

    // Find the user's active memberships with this host.
    const membershipsSnap = await tx.get(
      db
        .collection("memberships")
        .where("userId", "==", uid)
        .where("hostId", "==", hostId),
    );

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

    // Every membership is credit-based (no unlimited): pick the soonest-expiring
    // one that has enough credits left after active holds.
    let chosen = null;
    for (const m of candidates.sort(
      (a, b) => (a.expiresAt?.toMillis() || 0) - (b.expiresAt?.toMillis() || 0),
    )) {
      const holdsSnap = await tx.get(
        db
          .collection("membershipReservations")
          .where("membershipId", "==", m.id)
          .where("status", "==", "reserved"),
      );
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

    // --- writes ---
    const reservationRef = db.collection("membershipReservations").doc();
    tx.set(reservationRef, {
      membershipId: chosen.id,
      userId: uid,
      hostId,
      eventId,
      eventTitle: eventData.title || "",
      creditCost,
      membershipType: chosen.type,
      status: "reserved",
      reservedAt: FieldValue.serverTimestamp(),
    });

    // Add the user to the event attendees.
    tx.update(db.collection("events").doc(eventId), {
      attendees: FieldValue.arrayUnion(uid),
    });

    return {success: true, reservationId: reservationRef.id};
  });

  return result;
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
    const updates = {updatedAt: FieldValue.serverTimestamp()};
    // Credit-based deduction (idempotent via the reservation.status guard above).
    // A legacy unlimited membership has creditsRemaining == null and rides out
    // its expiry without being decremented.
    if (typeof membership.creditsRemaining === "number") {
      const remaining = Math.max(0, membership.creditsRemaining - cost);
      updates.creditsRemaining = remaining;
      if (remaining === 0) updates.status = "depleted";
    }
    tx.update(memRef, updates);

    tx.update(resRef, {
      status: "redeemed",
      redeemedAt: FieldValue.serverTimestamp(),
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
      redeemedAt: FieldValue.serverTimestamp(),
      redeemedBy: uid,
      status: "redeemed",
    });

    return {
      creditsRemaining:
        membership.type === "credits" ? updates.creditsRemaining : null,
      memberUid: reservation.userId,
      eventTitle: reservation.eventTitle || "",
      creditsDeducted: membership.type === "credits" ? cost : 0,
      planName: membership.planName || "",
      membershipId: reservation.membershipId,
    };
  });

  // BUG 33: tell the attendee a credit was used (the moment their QR is scanned).
  // Best-effort + non-blocking — the redemption already committed; a notification
  // failure must NEVER roll back or fail the check-in.
  if (!result.alreadyProcessed && result.memberUid) {
    try {
      const remaining = result.creditsRemaining; // number, or null for unlimited
      const eventTitle = result.eventTitle || "your class";
      const planName = result.planName || "your plan";
      // BUG 34: key+params. No-credit (unlimited) keeps its own explicit bodyKey.
      const titleKey = "notifications.creditUsed.title";
      const bodyKey = remaining === null ?
        "notifications.checkedIn.body" :
        "notifications.creditUsed.body";
      const params = {event: eventTitle, remaining, plan: planName};

      await db.collection("notifications").add({
        userId: result.memberUid,
        type: "membership_redeemed",
        title: tPush(titleKey, "en", params),
        message: tPush(bodyKey, "en", params),
        titleKey,
        bodyKey,
        params,
        icon: "🎟️",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        metadata: {
          membershipId: result.membershipId,
          reservationId,
          eventTitle,
          creditsDeducted: result.creditsDeducted,
          creditsRemaining: remaining,
          planName,
        },
      });

      // Recipient = the membership holder. Read language from the SAME user doc
      // as the push token (no double read).
      const memberSnap = await db.collection("users").doc(result.memberUid).get();
      const memberData = memberSnap.exists ? memberSnap.data() : {};
      const token = memberData.pushToken;
      if (token) {
        const badge = await unreadTotalForUser(result.memberUid);
        await sendPushNotification(token, {
          uid: result.memberUid,
          lang: baseLang(memberData.language),
          titleKey,
          bodyKey,
          params,
          data: {type: "membership_redeemed", membershipId: result.membershipId},
          badge,
        });
      }
    } catch (e) {
      console.error("membership_redeemed notify failed:", e?.message || e);
    }
  }

  return {success: true, ...result};
});

/**
 * Undo a membership check-in (host taps "Undo" on the check-in list).
 * Reverses redeemMembershipCredit: restores the credit and puts the reservation
 * back to "reserved". Idempotent (guarded by reservation.status === "redeemed").
 * data: { reservationId }
 */
exports.undoMembershipRedemption = onCall(async (request) => {
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
      throw new HttpsError("permission-denied", "Only the host can undo a check-in.");
    }
    if (reservation.status !== "redeemed") {
      return {alreadyProcessed: true, status: reservation.status};
    }

    const memRef = db.collection("memberships").doc(reservation.membershipId);
    const memSnap = await tx.get(memRef);
    const cost = reservation.creditCost || 1;
    const updates = {updatedAt: FieldValue.serverTimestamp()};
    if (memSnap.exists && typeof memSnap.data().creditsRemaining === "number") {
      updates.creditsRemaining = memSnap.data().creditsRemaining + cost;
      if (memSnap.data().status === "depleted") updates.status = "active";
      tx.update(memRef, updates);
    }

    tx.update(resRef, {
      status: "reserved",
      redeemedAt: FieldValue.delete(),
      redeemedBy: FieldValue.delete(),
    });

    return {
      creditsRemaining: updates.creditsRemaining ?? null,
      memberUid: reservation.userId,
      eventTitle: reservation.eventTitle || "",
      planName: memSnap.exists ? (memSnap.data().planName || "") : "",
      membershipId: reservation.membershipId,
    };
  });

  // Best-effort audit: mark this reservation's redemption record(s) undone.
  try {
    const snap = await db
      .collection("membershipRedemptions")
      .where("reservationId", "==", reservationId)
      .where("status", "==", "redeemed")
      .get();
    const batch = db.batch();
    snap.forEach((d) =>
      batch.update(d.ref, {
        status: "undone",
        undoneAt: FieldValue.serverTimestamp(),
      }),
    );
    await batch.commit();
  } catch (e) {
    // audit cleanup is best-effort
  }

  // BUG 33: tell the attendee their credit was restored (the correction).
  // Best-effort — must never fail the undo.
  if (!result.alreadyProcessed && result.memberUid) {
    try {
      const remaining = result.creditsRemaining; // number, or null for unlimited
      const eventTitle = result.eventTitle || "your class";
      const planName = result.planName || "your plan";
      // BUG 34: key+params. No-credit (unlimited) keeps its own explicit bodyKey.
      const titleKey = "notifications.creditRestored.title";
      const bodyKey = remaining === null ?
        "notifications.creditRestored.undoneBody" :
        "notifications.creditRestored.body";
      const params = {event: eventTitle, remaining, plan: planName};

      await db.collection("notifications").add({
        userId: result.memberUid,
        type: "membership_restored",
        title: tPush(titleKey, "en", params),
        message: tPush(bodyKey, "en", params),
        titleKey,
        bodyKey,
        params,
        icon: "🎟️",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        metadata: {
          membershipId: result.membershipId,
          reservationId,
          eventTitle,
          creditsRemaining: remaining,
          planName,
        },
      });

      // Recipient = the membership holder. Language from the SAME user doc.
      const memberSnap = await db.collection("users").doc(result.memberUid).get();
      const memberData = memberSnap.exists ? memberSnap.data() : {};
      const token = memberData.pushToken;
      if (token) {
        const badge = await unreadTotalForUser(result.memberUid);
        await sendPushNotification(token, {
          uid: result.memberUid,
          lang: baseLang(memberData.language),
          titleKey,
          bodyKey,
          params,
          data: {type: "membership_restored", membershipId: result.membershipId},
          badge,
        });
      }
    } catch (e) {
      console.error("membership_restored notify failed:", e?.message || e);
    }
  }

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
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (remaining === 0) u.status = "depleted";
          tx.update(memRef, u);
        }
      }
      tx.update(resRef, {
        status: "forfeited",
        releasedAt: FieldValue.serverTimestamp(),
      });
    });
  } else {
    await resRef.update({
      status: "released",
      releasedAt: FieldValue.serverTimestamp(),
    });
  }

  // Remove the attendee from the event regardless.
  await db.collection("events").doc(reservation.eventId).update({
    attendees: FieldValue.arrayRemove(reservation.userId),
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
 * Write an in-app membership notification (BUG 34). Stores titleKey/bodyKey/
 * params so the card renders in the recipient's live app language; the English
 * title/message is generated from the catalog (tPush ".en") as a fallback — no
 * English literal at the call site. These lifecycle reminders are in-app only.
 * @param {string} userId
 * @param {object} payload {type, titleKey, bodyKey, params, icon, metadata}
 * @return {Promise<void>}
 */
async function pushMembershipNotification(userId, payload) {
  const {titleKey, bodyKey, params = {}, ...rest} = payload;
  await db.collection("notifications").add({
    userId,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    ...rest,
    titleKey,
    bodyKey,
    params,
    title: tPush(titleKey, "en", params),
    message: tPush(bodyKey, "en", params),
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
          // Recipient = the membership holder (m.userId).
          await pushMembershipNotification(m.userId, {
            type: "membership_expired",
            titleKey: "notifications.membership.expired.title",
            bodyKey: "notifications.membership.expired.body",
            params: {plan: m.planName || ""},
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
            titleKey: "notifications.membership.expiringTomorrow.title",
            bodyKey: "notifications.membership.expiringTomorrow.body",
            params: {plan: m.planName || ""},
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
            titleKey: "notifications.membership.expiringSoon.title",
            bodyKey: "notifications.membership.expiringSoon.body",
            params: {plan: m.planName || "", days: daysLeft},
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
            titleKey: "notifications.membership.lowCredits.title",
            bodyKey: `notifications.membership.lowCredits.body${remaining === 1 ? "One" : "Other"}`,
            params: {count: remaining, plan: m.planName || ""},
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
        updates.updatedAt = FieldValue.serverTimestamp();
        await docSnap.ref.update(updates);
      }
    }

    console.log(`✅ Membership reminders sent: ${sent}`);
    return null;
  },
);

/**
 * Hourly: remind attendees ~24h and ~2h before an event starts (in-app + push).
 * Flags on the event (`remindersSent.h24/h2`) prevent duplicates.
 */
exports.sendEventReminders = onSchedule(
  {schedule: "every 60 minutes", timeZone: "America/Mexico_City"},
  async () => {
    const now = Date.now();
    const snap = await db
      .collection("events")
      .where("status", "==", "active")
      .get();
    let sent = 0;
    for (const docSnap of snap.docs) {
      const e = docSnap.data();
      const startMs = e.date?.toMillis ?
        e.date.toMillis() :
        (e.date ? new Date(e.date).getTime() : 0);
      if (!startMs || startMs < now) continue;
      const hours = (startMs - now) / 3600000;
      const reminders = e.remindersSent || {};
      let kind = null;
      if (hours <= 2 && !reminders.h2) kind = {key: "h2"};
      else if (hours <= 24 && !reminders.h24) kind = {key: "h24"};
      if (!kind) continue;

      // BUG 34: localized per recipient (push) + rendered from key in-app.
      const title = e.title || "Your event";
      const titleKey = `notifications.event.reminder.${kind.key}Title`;
      const bodyKey = `notifications.event.reminder.${kind.key}Body`;
      const params = {event: title};
      const pushes = [];
      for (const uid of getAttendeeIds(e.attendees)) {
        await db.collection("notifications").add({
          userId: uid,
          type: "event_reminder",
          title: tPush(titleKey, "en", params), // English fallback
          message: tPush(bodyKey, "en", params),
          titleKey,
          bodyKey,
          params,
          icon: "⏰",
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          metadata: {eventId: docSnap.id, eventTitle: title},
        });
        const u = await db.collection("users").doc(uid).get();
        if (u.exists && u.data().pushToken) {
          pushes.push({
            pushToken: u.data().pushToken,
            uid, // recipient = each attendee
            lang: baseLang(u.data().language), // reuse the loaded user doc
            titleKey,
            bodyKey,
            params,
            data: {type: "event_reminder", eventId: docSnap.id},
          });
        }
      }
      if (pushes.length > 0) await sendBatchPushNotifications(pushes);
      reminders[kind.key] = true;
      await docSnap.ref.update({remindersSent: reminders});
      sent++;
    }
    console.log(`⏰ Event reminders processed for ${sent} event(s)`);
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
      // BUG 34: recipient = the DRIVER (in-app only). key+params; English
      // fallback from the catalog.
      const params = {name: after.name || "Someone"};
      const tk = "notifications.carpool.request.title";
      const bk = "notifications.carpool.request.body";
      await db.collection("notifications").add({
        userId: carpool.driverId,
        type: "carpool_request",
        title: tPush(tk, "en", params),
        message: tPush(bk, "en", params),
        titleKey: tk,
        bodyKey: bk,
        params,
        icon: "🚗",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        metadata: {eventId, eventTitle: carpool.eventTitle || ""},
      });
      return;
    }

    // Approved: recipient = the RIDER (in-app only). seatsShared is credited on
    // completion (BUG 28.2), not here. key+params; English fallback from catalog.
    const params = {driver: carpool.driverName || "the driver"};
    const tk = "notifications.carpool.approved.title";
    const bk = "notifications.carpool.approved.body";
    await db.collection("notifications").add({
      userId: riderId,
      type: "carpool_approved",
      title: tPush(tk, "en", params),
      message: tPush(bk, "en", params),
      titleKey: tk,
      bodyKey: bk,
      params,
      icon: "🚗",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {eventId, eventTitle: carpool.eventTitle || ""},
    });
  },
);

// ============================================
// CARPOOL LOYALTY: credit drivers only for COMPLETED trips (BUG 28.2)
// A driver's carpoolStats.seatsShared should count riders they actually helped
// get to an event — not riders they approved for a future ride. This daily
// sweep finds events that have ended (start + durationMinutes < now) and, for
// each non-cancelled carpool that hasn't been credited yet, adds the number of
// still-approved riders to the driver's lifetime counter.
//
// Idempotency: a per-carpool `seatsCredited` flag is claimed inside a
// transaction, so a re-run/reopen can never double-count. Empty carpools are
// flagged too, so they aren't rescanned forever.
// ============================================
exports.creditCarpoolSeatsOnCompletion = onSchedule(
  {schedule: "every 24 hours", timeZone: "America/Mexico_City"},
  async () => {
    const now = Date.now();
    // Non-cancelled events only (cancelled events never "completed").
    const snap = await db
      .collection("events")
      .where("status", "==", "active")
      .get();
    let creditedSeats = 0;
    let creditedCarpools = 0;

    for (const docSnap of snap.docs) {
      const e = docSnap.data();
      const startMs = e.date?.toMillis ?
        e.date.toMillis() :
        (e.date ? new Date(e.date).getTime() : 0);
      if (!startMs) continue;
      const endMs = startMs + (e.durationMinutes || 180) * 60000;
      if (endMs > now) continue; // event hasn't finished yet

      const cpSnap = await db
        .collection(`events/${docSnap.id}/carpools`)
        .get();
      for (const cp of cpSnap.docs) {
        const carpool = cp.data();
        if (carpool.status === "cancelled") continue;
        if (carpool.seatsCredited) continue;

        // Count riders still approved at completion time.
        const ridersSnap = await cp.ref
          .collection("riders")
          .where("status", "==", "approved")
          .get();
        const approved = ridersSnap.size;

        // Claim the credit atomically so concurrent/re-runs can't double-count.
        const won = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(cp.ref);
          if (fresh.data()?.seatsCredited) return false;
          tx.set(
            cp.ref,
            {
              seatsCredited: true,
              creditedAt: FieldValue.serverTimestamp(),
            },
            {merge: true},
          );
          return true;
        });
        if (!won) continue;

        if (approved > 0 && carpool.driverId) {
          await db.collection("users").doc(carpool.driverId).set(
            {
              carpoolStats: {
                seatsShared: FieldValue.increment(approved),
              },
            },
            {merge: true},
          );
          creditedSeats += approved;
          creditedCarpools++;
        }
      }
    }
    console.log(
      `🚗 Carpool completion credit: ${creditedSeats} seat(s) across ` +
      `${creditedCarpools} carpool(s)`,
    );
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

    // Anti-circumvention: delete off-platform payment solicitations, report to
    // admin, and notify the sender (never forward to members).
    const guard = detectProhibitedContent(msg.text || "");
    if (guard.flagged) {
      await snap.ref.delete();
      await db.collection("reports").add({
        type: "prohibited_content",
        reason: guard.reason,
        reporterId: msg.senderId,
        groupId,
        content: String(msg.text || "").slice(0, 500),
        status: "open",
        source: "server",
        createdAt: FieldValue.serverTimestamp(),
      });
      // BUG 34: recipient = the SENDER (in-app only). key+params; English
      // fallback from the catalog.
      const bkTk = "notifications.group.messageBlocked.title";
      const bkBk = "notifications.group.messageBlocked.body";
      await db.collection("notifications").add({
        userId: msg.senderId,
        type: "message_blocked",
        title: tPush(bkTk, "en", {}),
        message: tPush(bkBk, "en", {}),
        titleKey: bkTk,
        bodyKey: bkBk,
        params: {},
        icon: "🚫",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        metadata: {groupId},
      });
      console.log("🚫 Blocked prohibited group message:", guard.reason);
      return;
    }

    const gSnap = await db.doc(`hostGroups/${groupId}`).get();
    if (!gSnap.exists) return;
    const group = gSnap.data();

    const recipients = new Set([group.hostId, ...(group.memberIds || [])]);
    recipients.delete(msg.senderId);
    if (recipients.size === 0) return;

    // Mark the message delivered to every recipient (drives the ✓✓ delivered
    // tick). readBy is added client-side when each recipient opens the chat.
    await snap.ref.update({deliveredTo: Array.from(recipients)});

    const senderDoc = await db.collection("users").doc(msg.senderId).get();
    const senderName = senderDoc.exists ?
      senderDoc.data().fullName?.split(" ")[0] ||
        senderDoc.data().name?.split(" ")[0] ||
        "Someone" :
      "Someone";
    const preview = `${senderName}: ${msg.text || ""}`.slice(0, 140);

    // BUG 34: recipients = the group members (sender already excluded above).
    // This notification is USER CONTENT — the group name + "sender: message"
    // preview — so it is NOT keyed/localized (same policy as event-chat/DM bodies).
    const pushes = [];
    for (const uid of recipients) {
      await db.collection("notifications").add({
        userId: uid,
        type: "group_message",
        title: group.name || "Group",
        message: preview,
        icon: "💬",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        metadata: {groupId, groupName: group.name || ""},
      });
      const u = await db.collection("users").doc(uid).get();
      if (u.exists && u.data().pushToken) {
        pushes.push({
          pushToken: u.data().pushToken,
          title: group.name || "Group",
          body: preview,
          data: {type: "group_message", groupId},
          // Icon badge = their unread total (the notification above is already
          // written, so it's included) — Fix B.
          badge: await unreadTotalForUser(uid),
        });
      }
    }
    if (pushes.length > 0) await sendBatchPushNotifications(pushes);
    console.log(`✅ Group message notified ${recipients.size} member(s)`);
  },
);

/**
 * Join a host group via its invite code. Runs server-side because members
 * can't write the group doc directly (rules allow only the host to edit it).
 */
exports.joinGroupByCode = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const code = (request.data?.code || "").trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Missing invite code.");

  const snap = await db
    .collection("hostGroups")
    .where("inviteCode", "==", code)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new HttpsError("not-found", "That invite code is invalid.");
  }

  const groupDoc = snap.docs[0];
  if ((groupDoc.data().blockedIds || []).includes(uid)) {
    throw new HttpsError(
      "permission-denied",
      "You've been blocked from this group by the host.",
    );
  }
  await groupDoc.ref.update({
    memberIds: FieldValue.arrayUnion(uid),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {groupId: groupDoc.id, groupName: groupDoc.data().name || ""};
});

/**
 * Redeem a Kinlo for Business guest code (kinlo_business/01 §2).
 * An attendee (NOT staff of the business) enters the code the host gave them;
 * this links their app account to the existing CRM member record and unlocks
 * their business check-in pass. Server-side because the attendee has no write
 * access to the host's members. Idempotent for the same user.
 */
exports.redeemBusinessGuestCode = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const code = (request.data?.code || "").trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Missing code.");

  const snap = await db
    .collectionGroup("members")
    .where("inviteCode", "==", code)
    .limit(5)
    .get();
  if (snap.empty) throw new HttpsError("not-found", "That code is invalid.");

  // Prefer a record already linked to this user (idempotent re-entry), else the
  // first unredeemed one.
  const docs = snap.docs;
  const mine = docs.find((d) => d.data().linkedUid === uid);
  const target = mine || docs.find((d) => !d.data().linkedUid) || docs[0];
  const data = target.data();

  if (data.linkedUid && data.linkedUid !== uid) {
    throw new HttpsError("already-exists", "That code is already in use.");
  }

  const bizId = target.ref.parent.parent.id;
  const bizSnap = await db.collection("businesses").doc(bizId).get();
  const businessName = bizSnap.exists ? (bizSnap.data().name || "") : "";

  if (!mine) {
    await target.ref.update({
      linkedUid: uid,
      redeemedAt: FieldValue.serverTimestamp(),
      qrPassId: require("crypto").randomUUID(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return {
    bizId,
    memberId: target.id,
    businessName,
    memberName: data.name || "",
  };
});

/**
 * Atomic join for FREE events — enforces capacity inside a transaction so two
 * users can't both pass a stale capacity check and overbook. Paid events go
 * through checkout; membership joins go through reserveMembershipCredit.
 */
/**
 * F2 — set an event's GATED location. The client sends the exact venue/address/
 * coords; the server writes only a coarse { area, approxCoords, locationLocked }
 * to the public event doc and the exact detail to events/{id}/private/location
 * (readable only by participants). The exact fields never leave the private doc.
 * Only the event creator / co-host may call this. Additive in Phase A: the legacy
 * public location/locationCoords are left untouched (Phase B strips them).
 */
exports.setEventLocation = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const {eventId, venueName, address, exactCoords, area, entryNotes} =
    request.data || {};
  if (!eventId) throw new HttpsError("invalid-argument", "Missing eventId.");
  if (!area || typeof area !== "string" || !area.trim()) {
    throw new HttpsError("invalid-argument", "Missing area (coarse label).");
  }

  const ref = db.collection("events").doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Event not found.");
  const e = snap.data();
  const creatorId = getEventCreatorId(e);
  const coHosts = Array.isArray(e.coHosts) ? e.coHosts : [];
  if (uid !== creatorId && !coHosts.includes(uid)) {
    throw new HttpsError("permission-denied", "Only the host can set the location.");
  }

  const approxCoords = snapApproxGrid(exactCoords);

  const batch = db.batch();
  // Public doc: coarse only. merge so legacy fields stay put in Phase A.
  const publicUpdate = {
    area: area.trim(),
    locationLocked: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (approxCoords) publicUpdate.approxCoords = approxCoords;
  batch.set(ref, publicUpdate, {merge: true});

  // Private doc: the exact detail, participant-gated by rules.
  const privateDoc = {updatedAt: FieldValue.serverTimestamp()};
  if (venueName != null) privateDoc.venueName = venueName;
  if (address != null) privateDoc.address = address;
  if (approxCoords && exactCoords) {
    privateDoc.exactCoords = {
      latitude: exactCoords.latitude,
      longitude: exactCoords.longitude,
    };
  }
  if (entryNotes != null) privateDoc.entryNotes = entryNotes;
  batch.set(ref.collection("private").doc("location"), privateDoc, {merge: true});

  await batch.commit();
  return {success: true, area: area.trim(), approxCoords: approxCoords || null};
});

exports.joinEvent = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const {eventId} = request.data || {};
  if (!eventId) throw new HttpsError("invalid-argument", "Missing eventId.");

  return db.runTransaction(async (tx) => {
    const ref = db.collection("events").doc(eventId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Event not found.");
    const e = snap.data();

    if (e.status === "cancelled") {
      throw new HttpsError("failed-precondition", "This event was cancelled.");
    }
    if ((e.price || 0) > 0) {
      throw new HttpsError("failed-precondition", "paid_event");
    }
    if (e.date && new Date(e.date).getTime() < Date.now()) {
      throw new HttpsError("failed-precondition", "This event has already happened.");
    }

    const attendees = Array.isArray(e.attendees) ? e.attendees : [];
    const ids = attendees
      .map((a) => (typeof a === "string" ? a : a && a.userId))
      .filter(Boolean);
    if (ids.includes(uid)) return {success: true, already: true};

    const max = e.maxAttendees || e.maxPeople || 0;
    if (max && ids.length >= max) {
      // Full → waitlist (FIFO). onEventAttendeesChanged promotes when a spot opens.
      const waitlist = Array.isArray(e.waitlist) ? e.waitlist : [];
      if (waitlist.includes(uid)) {
        return {success: true, waitlisted: true, already: true};
      }
      tx.update(ref, {waitlist: FieldValue.arrayUnion(uid)});
      return {success: true, waitlisted: true, position: waitlist.length + 1};
    }

    tx.update(ref, {attendees: FieldValue.arrayUnion(uid)});
    return {success: true};
  });
});

/**
 * Build search keyword tokens from an event's text fields: lowercase word
 * tokens (>= 2 chars), deduped. Mirrored by the client query tokenizer in
 * SearchEventsScreen so server-side keyword search and client refine agree.
 * Each word is expanded into its prefixes (>= 2 chars) so the client can match
 * partial typing (e.g. "yog" → "yoga") via array-contains.
 * @param {object} data - Event document data.
 * @return {string[]} Deduped lowercase keyword/prefix tokens.
 */
function eventSearchKeywords(data) {
  // F2: fold in `area` so gated events are still findable by their coarse zone
  // even once the exact `location` is stripped from the public doc (Phase B).
  const text = [data.title, data.location, data.area, data.city, data.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const words = text.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  const set = new Set();
  for (const w of words) {
    const max = Math.min(w.length, 14);
    for (let n = 2; n <= max; n++) set.add(w.slice(0, n));
  }
  return Array.from(set).slice(0, 80);
}

/**
 * Maintain events/{id}.searchKeywords so the client can run server-side,
 * paginated keyword search (where searchKeywords array-contains token).
 * Loop-guarded: only writes when the keyword set actually changes.
 */
exports.onEventWritten = onDocumentWritten("events/{eventId}", async (event) => {
  const after = event.data?.after;
  if (!after || !after.exists) return; // deleted
  const data = after.data();

  // ESCROW §8: if the event's end time moved (date or durationMinutes changed),
  // recompute releaseAt on its still-HELD ledger rows so payouts release at the
  // right time. released/refunded/reversed are terminal; frozen is admin-held.
  const before = event.data?.before;
  const beforeData = before && before.exists ? before.data() : null;
  if (beforeData) {
    const escrow = require("./stripe/escrow");
    const beforeEnd = escrow.eventEndAtMs(beforeData);
    const afterEnd = escrow.eventEndAtMs(data);
    if (Number.isFinite(afterEnd) && beforeEnd !== afterEnd) {
      const eventId = event.params.eventId;
      const heldSnap = await db.collection("paymentLedger")
        .where("eventId", "==", eventId)
        .where("state", "==", "held")
        .get();
      if (!heldSnap.empty) {
        const newEndISO = new Date(afterEnd).toISOString();
        for (const d of heldSnap.docs) {
          const hostSnap = await db.collection("users").doc(d.data().hostUid).get();
          const hostData = hostSnap.exists ? hostSnap.data() : {};
          const retention = await escrow.effectiveRetentionHours(db, hostData);
          await d.ref.update({
            eventEndAt: newEndISO,
            releaseAt: escrow.computeReleaseAtISO(afterEnd, retention),
          });
        }
        console.log(
          `♻️ Recomputed releaseAt for ${heldSnap.size} held ledger(s) of ${eventId}`,
        );
      }
    }
  }

  // F2 Phase A: derive the coarse gated fields (area + approxCoords) and mirror
  // the exact detail into the participant-gated private doc. ADDITIVE — the
  // legacy public location/locationCoords are left in place (Phase B strips
  // them). Idempotent + loop-guarded: only writes when something actually
  // changed, so the self-update below doesn't cause an infinite trigger loop.
  const exact = coordFromData(data.locationCoords);
  const approx = snapApproxGrid(exact);
  // Always carry a coarse `area` on a gated doc so list cards have a safe label
  // (never the venue) — fall back to the city when the location has no parseable
  // area but we still have coords to gate.
  const area = deriveArea(data.location, data.city) || (approx ? data.city || null : null);

  const gatingPatch = {};
  if (area && data.area !== area) gatingPatch.area = area;
  if (approx && !coordsEqual(data.approxCoords, approx)) gatingPatch.approxCoords = approx;
  if ((area || approx) && data.locationLocked !== true) gatingPatch.locationLocked = true;
  const gatingChanged = Object.keys(gatingPatch).length > 0;

  // BUG 27: a host can opt an event out of Discover/search via the
  // "List event publicly" toggle. Private events (listedPublicly === false)
  // carry no keywords so the server-side keyword query never returns them.
  const desired = data.listedPublicly === false ?
    [] : eventSearchKeywords({...data, area}); // fold the fresh area in now
  const current = Array.isArray(data.searchKeywords) ? data.searchKeywords : [];
  const kwChanged = !(
    current.length === desired.length &&
    desired.every((k) => current.includes(k))
  );

  if (!kwChanged && !gatingChanged) return; // steady state — nothing to do

  const update = {...gatingPatch};
  if (kwChanged) update.searchKeywords = desired;
  await after.ref.update(update);

  // Mirror the exact detail into the participant-gated private doc when the
  // gating fields were (re)computed. Writing a subcollection doc does NOT
  // re-fire this events/{id} trigger, so there's no loop.
  if (gatingChanged && (exact || data.venueAddress || data.location)) {
    await after.ref.collection("private").doc("location").set({
      venueName: deriveVenue(data.location),
      address: data.venueAddress || data.location || null,
      exactCoords: exact || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }
});

/**
 * Premium AI coaching: analyze a host's attendee reviews and return concise,
 * actionable advice to improve future events. Gated behind users/{uid}.isPremium
 * (set server-side, never by the client).
 */
/**
 * Call Claude (Anthropic) and parse a JSON object from its reply.
 * @param {string} system - system prompt
 * @param {string} userContent - user message content
 * @param {number} [maxTokens=1024] - max output tokens
 * @return {Promise<object>} parsed JSON (or { raw } on parse failure)
 */
async function callClaudeJSON(system, userContent, maxTokens = 1024) {
  let resp;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey.value(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        messages: [{role: "user", content: userContent}],
      }),
    });
  } catch (e) {
    console.error("Anthropic fetch failed:", e);
    throw new HttpsError("internal", "AI service unavailable.");
  }
  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Anthropic error:", resp.status, errText);
    throw new HttpsError("internal", "AI service error.");
  }
  const data = await resp.json();
  const raw = (data.content?.[0]?.text || "").trim();
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {raw};
  }
}

/**
 * Ensure the caller is a signed-in premium user.
 * @param {object} request - the onCall request
 * @return {Promise<string>} the caller uid
 */
async function requirePremiumUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists || userDoc.data().isPremium !== true) {
    throw new HttpsError("permission-denied", "premium_required");
  }
  return uid;
}

/**
 * Premium AI coaching with advanced insights: sentiment, rating trend, and
 * concrete changes for the next event, from the host's attendee reviews.
 */
exports.getHostFeedbackInsights = onCall(
  {secrets: [anthropicKey]},
  async (request) => {
    const uid = await requirePremiumUid(request);

    const snap = await db
      .collection("ratings")
      .where("hostId", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(80)
      .get();
    const all = snap.docs.map((d) => d.data());
    const reviews = all
      .filter((r) => (r.comment || "").trim().length > 0)
      .map((r) => ({rating: r.rating, comment: r.comment, event: r.eventTitle || ""}));

    if (reviews.length < 3) {
      return {enough: false, reviewCount: reviews.length};
    }

    // Rating trend: recent third vs oldest third (docs are newest-first).
    const nums = all.map((r) => r.rating).filter((n) => typeof n === "number");
    const chunk = Math.max(3, Math.floor(nums.length / 3));
    const avg = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);
    const recentAvg = avg(nums.slice(0, chunk));
    const olderAvg = avg(nums.slice(-chunk));
    const dir = recentAvg > olderAvg + 0.2 ? "up" :
      recentAvg < olderAvg - 0.2 ? "down" : "flat";

    const reviewText = reviews
      .map((r, idx) =>
        `${idx + 1}. [${r.rating}★]${r.event ? ` (${r.event})` : ""} ${r.comment}`)
      .join("\n");

    const system =
      "You are an expert event-hosting coach analyzing attendee reviews. " +
      "Return ONLY valid JSON (no markdown fences) with this shape: " +
      "{\"summary\": string, \"sentiment\": string, \"trend\": string, " +
      "\"strengths\": string[], \"improvements\": string[], " +
      "\"nextEvent\": string[]}. 'sentiment' = one sentence on overall " +
      "attendee sentiment. 'trend' = one sentence interpreting the rating " +
      `trend (it is going ${dir}; recent avg ${recentAvg.toFixed(1)} vs ` +
      `older ${olderAvg.toFixed(1)}). 'nextEvent' = 3-5 concrete changes for ` +
      "the next event. Keep arrays to 3-5 short items. Respond in the " +
      "language the reviews are mostly written in.";

    const insights = await callClaudeJSON(
      system, `Reviews (${reviews.length}):\n\n${reviewText}`, 1200);
    return {
      enough: true,
      reviewCount: reviews.length,
      trend: {dir, recentAvg, olderAvg},
      insights,
    };
  },
);

/**
 * Premium AI listing writer: generate catchy title options + a description
 * from a short idea + category.
 */
exports.generateEventListing = onCall(
  {secrets: [anthropicKey]},
  async (request) => {
    await requirePremiumUid(request);
    const idea = (request.data?.idea || "").toString().trim().slice(0, 600);
    const category = (request.data?.category || "").toString().slice(0, 60);
    const language = (request.data?.language || "es").toString().slice(0, 5);
    if (!idea) throw new HttpsError("invalid-argument", "Describe your event first.");

    const system =
      "You write attractive event listings. Return ONLY valid JSON (no " +
      "markdown fences): {\"titles\": string[], \"description\": string}. " +
      "'titles' = 3 short catchy options (max ~6 words each). 'description' = " +
      "one engaging paragraph (60-110 words) that sells the experience and " +
      `sets expectations. Write everything in language code: ${language}.`;

    const result = await callClaudeJSON(
      system, `Category: ${category}\nIdea: ${idea}`, 700);
    return {success: true, ...result};
  },
);

/**
 * AI icebreakers for a Community Matching pair. Available to either person in a
 * match; generates a few opener lines from both public match profiles.
 * data: { matchId, language? }
 */
exports.generateIcebreakers = onCall(
  {secrets: [anthropicKey]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
    const {matchId} = request.data || {};
    const language = (request.data?.language || "en").toString().slice(0, 5);
    if (!matchId) throw new HttpsError("invalid-argument", "Missing matchId.");

    const chatSnap = await db.collection("matchChats").doc(matchId).get();
    if (!chatSnap.exists) throw new HttpsError("not-found", "Match not found.");
    const chat = chatSnap.data();
    if (!Array.isArray(chat.users) || !chat.users.includes(uid)) {
      throw new HttpsError("permission-denied", "Not your match.");
    }
    const otherUid = chat.users.find((u) => u !== uid);

    const load = async (who) => {
      const s = await db
        .collection("matchProfiles").doc(chat.eventId)
        .collection("attendees").doc(who).get();
      return s.exists ? s.data() : {};
    };
    const [me, them] = await Promise.all([load(uid), load(otherUid)]);
    const brief = (p) => JSON.stringify({
      interests: p.interests || [],
      profession: p.profession || "",
      lookingFor: p.lookingFor || [],
      bio: (p.bio || "").slice(0, 200),
    });

    const system =
      "You write friendly, non-cheesy icebreaker openers to help two people " +
      "who matched at an event start a conversation. Return ONLY valid JSON " +
      "(no markdown fences): {\"icebreakers\": string[]}. 3 short openers " +
      "(max ~18 words each), specific to their shared interests, never " +
      `romantic-forward. Write in language code: ${language}.`;

    const result = await callClaudeJSON(
      system, `Me: ${brief(me)}\nThem: ${brief(them)}`, 500);
    return {success: true, ...result};
  },
);

/**
 * Premium AI: suggest a gracious host reply to an attendee review.
 */
exports.generateReviewReply = onCall(
  {secrets: [anthropicKey]},
  async (request) => {
    await requirePremiumUid(request);
    const rating = Number(request.data?.rating) || 0;
    const comment = (request.data?.comment || "").toString().slice(0, 600);
    const language = (request.data?.language || "es").toString().slice(0, 5);

    const system =
      "You are a gracious event host replying to an attendee review. Return " +
      "ONLY valid JSON (no markdown fences): {\"reply\": string}. The reply is " +
      "warm, specific and professional, 1-3 sentences; thank positives and " +
      "address concerns constructively without being defensive. Language " +
      `code: ${language}.`;

    const result = await callClaudeJSON(
      system, `Rating: ${rating}/5\nComment: ${comment}`, 400);
    return {success: true, reply: result.reply || result.raw || ""};
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
exports.claimHandle = claimHandle;
exports.checkHandle = checkHandle;
exports.adminReassignHandle = adminReassignHandle;
exports.sendVerificationEmail = sendVerificationEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;

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

// ============================================================================
// PAYMENTS ESCROW — release cron (docs/DISENO_escrow_pagos.md §4)
// After a paid event ends + its retention window, transfer the host's cut from
// Kinlo's balance to the host's Connect account. Separate charges + transfers.
// ============================================================================

// §7 admin control: freeze/unfreeze a payout (the ledger is Admin-SDK-only, so
// this is how an admin toggles `frozen` — the dispute webhook does it
// automatically; this covers manual holds). Only frozen==false payouts release.
exports.setPayoutFrozen = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const {paymentIntentId, frozen} = request.data || {};
  if (!paymentIntentId || typeof frozen !== "boolean") {
    throw new HttpsError("invalid-argument", "paymentIntentId + frozen required.");
  }
  const ref = db.collection("paymentLedger").doc(paymentIntentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ledger not found.");
  await ref.set({
    frozen,
    frozenBy: uid,
    frozenAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return {ok: true, paymentIntentId, frozen};
});

// Runs hourly. Pages through held payouts whose releaseAt has passed and that
// aren't frozen, and releases each (escrow.releaseOnePayout — same code the
// tests drive). Paginated to avoid the unbounded-query bug (§4). Needs a
// composite index (state, frozen, releaseAt) — firestore.indexes.json.
const escrow = require("./stripe/escrow");
exports.releaseHostPayouts = onSchedule(
  {schedule: "every 1 hours", secrets: [stripeSecretKey]},
  async () => {
    if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
    const nowISO = new Date().toISOString();
    const PAGE = 100;
    let processed = 0; let released = 0; let held = 0; let last = null;
    for (;;) {
      let q = db.collection("paymentLedger")
        .where("state", "==", "held")
        .where("frozen", "==", false)
        .where("releaseAt", "<=", nowISO)
        .orderBy("releaseAt", "asc")
        .limit(PAGE);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        last = doc;
        processed++;
        try {
          const r = await escrow.releaseOnePayout(stripe, db, doc);
          if (r === "released") released++; else if (r === "held") held++;
        } catch (e) {
          console.error(`releaseOnePayout error ${doc.id}:`, e.message);
        }
      }
      if (snap.size < PAGE) break;
    }
    console.log(
      `releaseHostPayouts: processed=${processed} released=${released} held=${held}`,
    );
  },
);

// ============================================
// ADMIN PAYOUTS — read + act on the escrow ledger (docs/DISENO_admin_payouts_backend.md)
// paymentLedger + hostPayoutAccounts are DENY-ALL (server-only). The admin payouts
// UI (Diseño 2) can't read them directly, so it goes through these callables. All
// three are isAdmin-gated (same pattern as setPayoutFrozen) and REUSE the escrow /
// refunds money code — no money flow is re-implemented here.
// ============================================

/**
 * List escrow ledger rows for the admin payouts UI, paginated + filtered, each
 * enriched with the host's outstanding debt (hostPayoutAccounts.penaltyOwed).
 * data: { status?, type?, cursor?, limit=25 }. `status` filters the ledger
 * `state`; `cursor` is the paymentIntentId to resume the scan after.
 *
 * NO composite index required: the query is always `orderBy(capturedAt desc)`
 * (automatic single-field index) and state/type are filtered in code, so it can
 * never break on a missing/still-building index. Fine for admin volume.
 */
exports.adminListPayouts = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const {status, type, cursor} = request.data || {};
  const limit = Math.min(
    Math.max(parseInt((request.data || {}).limit, 10) || 25, 1), 100);

  // The query is ALWAYS just `orderBy(capturedAt desc)` — served by the automatic
  // single-field index that every collection has — so it can NEVER fail on a
  // missing or still-building composite index. state/type are filtered IN CODE
  // over the scanned pages (paymentLedger is admin-volume + low-frequency, so a
  // bounded forward scan is cheap and avoids the index-deploy coupling entirely).
  const coll = db.collection("paymentLedger");
  const filtered = !!(status || type);
  const BATCH = filtered ? 200 : limit; // over-fetch when filtering to fill a page
  const MAX_SCAN = 3000; // hard safety bound on docs read per call

  const mapRow = (l, d) => ({
    paymentIntentId: l.paymentIntentId || d.id,
    type: l.type || null,
    sourceId: l.sourceId || null,
    bizId: l.bizId || null,
    hostUid: l.hostUid || null,
    buyerUid: l.buyerUid || null,
    grossAmount: l.grossAmount || 0,
    hostAmount: l.hostAmount || 0,
    platformFee: l.platformFee || 0,
    stripeFee: l.stripeFee || 0,
    currency: l.currency || "mxn",
    state: l.state || null,
    frozen: l.frozen === true,
    releaseAt: l.releaseAt || null,
    deliveryEndAt: l.deliveryEndAt || null,
    transferId: l.transferId || null,
    refundId: l.refundId || null,
    hostPenaltyOwed: l.hostPenaltyOwed || 0,
  });

  const rows = [];
  let scanCursorId = cursor || null; // a position in capturedAt-desc order
  let scanned = 0;
  let exhausted = false;
  while (rows.length < limit && scanned < MAX_SCAN) {
    let q = coll.orderBy("capturedAt", "desc").limit(BATCH);
    if (scanCursorId) {
      // startAfter(docSnapshot) positions by the doc's capturedAt (Firestore
      // appends __name__), so the cursor works whether or not that doc matched.
      const cs = await coll.doc(scanCursorId).get();
      if (cs.exists) q = q.startAfter(cs);
    }
    const snap = await q.get();
    if (snap.empty) {
      exhausted = true;
      break;
    }
    let pageFilled = false;
    for (const d of snap.docs) {
      scanned++;
      scanCursorId = d.id;
      const l = d.data();
      if (status && l.state !== status) continue;
      if (type && l.type !== type) continue;
      rows.push(mapRow(l, d));
      if (rows.length >= limit) {
        pageFilled = true;
        break;
      }
    }
    if (pageFilled) break; // more rows may follow — do NOT mark exhausted
    // Only now (whole batch scanned) can a short batch mean the collection ended.
    if (snap.size < BATCH) {
      exhausted = true;
      break;
    }
  }

  // Per-host debt for the "Deuda de hosts" card (deny-all → Admin SDK only).
  const hostUids = [...new Set(rows.map((r) => r.hostUid).filter(Boolean))];
  const debts = {};
  await Promise.all(hostUids.map(async (h) => {
    const s = await db.collection("hostPayoutAccounts").doc(h).get();
    debts[h] = s.exists ? (s.data().penaltyOwed || 0) : 0;
  }));
  const payouts = rows.map((r) => ({
    ...r, hostDebtOwed: r.hostUid ? (debts[r.hostUid] || 0) : 0,
  }));

  // Continue from the last scanned position unless we reached the collection end.
  // (May yield one final empty page when a full page lands exactly on the end —
  // harmless for an admin list.)
  const nextCursor = exhausted ? null : scanCursorId;
  return {payouts, hostDebts: debts, nextCursor};
});

/**
 * "Release now" — release a HELD payout immediately (ignores releaseAt), reusing
 * escrow.releaseOnePayout (idempotent, transactional, nets hostPenaltyOwed).
 * REJECTS a frozen ledger (a disputed/held-for-review payout must not be paid) and
 * anything not in state "held" (never re-pay a refunded/released row). data:
 * { paymentIntentId }.
 */
exports.adminReleasePayout = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const {paymentIntentId} = request.data || {};
  if (!paymentIntentId) {
    throw new HttpsError("invalid-argument", "paymentIntentId required.");
  }
  const ref = db.collection("paymentLedger").doc(paymentIntentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Ledger not found.");
  const l = snap.data();
  if (l.frozen === true) {
    throw new HttpsError("failed-precondition", "payout_frozen");
  }
  if (l.state !== "held") {
    // Guard BEFORE delegating: releaseOnePayout would otherwise transfer to the
    // host for a refunded/reversed row (its idempotency key never fired).
    throw new HttpsError("failed-precondition", "not_releasable");
  }
  if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
  const outcome = await escrow.releaseOnePayout(stripe, db, snap);
  return {ok: true, paymentIntentId, outcome};
});

/**
 * "Refund" — refund a payout, reusing refunds.processRefund (ledger-aware:
 * held→refund from the platform balance, released→transfer reversal + refund).
 * Full gross refund (fees included). The UI confirms first (irreversible).
 * data: { paymentIntentId, reason? }.
 */
exports.adminRefundPayout = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const {paymentIntentId, reason} = request.data || {};
  if (!paymentIntentId) {
    throw new HttpsError("invalid-argument", "paymentIntentId required.");
  }
  const ledSnap = await db.collection("paymentLedger").doc(paymentIntentId).get();
  if (!ledSnap.exists) throw new HttpsError("not-found", "Ledger not found.");
  if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
  // Full refund (1.0), fees included, so an admin refund returns the whole charge.
  const result = await processRefund(
    stripe, paymentIntentId, 1.0, reason || "admin_refund", true);
  if (!result || result.success !== true) {
    throw new HttpsError(
      "failed-precondition", (result && result.error) || "refund_failed");
  }
  return {ok: true, paymentIntentId, refund: result.refund};
});

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
      // AUTH: identity comes from the verified ID token, never the body.
      // A user may delete only their OWN account (admins may delete any).
      const caller = await verifyBearer(req);
      if (!caller) {
        return res.status(401).json({error: "unauthenticated"});
      }
      const bodyUserId = req.body.userId;
      const userId =
        bodyUserId && bodyUserId !== caller.uid ?
          (await isAdminUid(caller.uid) ? bodyUserId : null) :
          caller.uid;
      if (!userId) {
        return res.status(403).json({error: "forbidden"});
      }

      console.log("🗑️ Starting FULL account deletion for user:", userId);
      const counts = {};

      // Helper: delete every doc a query returns (recursively, so any
      // subcollections go too). Failures on one query never abort the rest —
      // deletion must be best-effort-complete.
      const purgeQuery = async (label, ref) => {
        try {
          const snap = await ref.get();
          await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
          counts[label] = snap.size;
          console.log(`✅ Purged ${snap.size} ${label}`);
        } catch (e) {
          counts[label] = `error: ${e.message}`;
          console.error(`⚠️ Purge ${label} failed:`, e.message);
        }
      };

      // 1. Events the user created — recursiveDelete also clears their
      //    messages / checkins / recapPhotos subcollections.
      await purgeQuery("events",
        db.collection("events").where("creatorId", "==", userId));

      // 2. Social posts the user authored.
      await purgeQuery("posts",
        db.collection("posts").where("authorId", "==", userId));

      // 3. Top-level notifications addressed to the user.
      await purgeQuery("notifications",
        db.collection("notifications").where("userId", "==", userId));

      // 4. Ratings the user wrote.
      await purgeQuery("ratings",
        db.collection("ratings").where("raterId", "==", userId));

      // 5. Match profiles across every event (sensitive data). Stored at
      //    matchProfiles/{eventId}/attendees/{uid} with a userId field.
      await purgeQuery("matchProfiles",
        db.collectionGroup("attendees").where("userId", "==", userId));

      // 6. Direct-message threads the user is part of (+ their messages).
      await purgeQuery("dmThreads",
        db.collection("dms").where("users", "array-contains", userId));

      // 7. Host groups the user OWNS — remove entirely.
      await purgeQuery("ownedGroups",
        db.collection("hostGroups").where("hostId", "==", userId));

      // 8. Detach the user from groups they're only a MEMBER of.
      try {
        const memberGroups = await db.collection("hostGroups")
          .where("memberIds", "array-contains", userId).get();
        await Promise.all(memberGroups.docs.map((g) =>
          g.ref.update({
            memberIds: FieldValue.arrayRemove(userId),
            blockedIds: FieldValue.arrayRemove(userId),
          })));
        counts.groupMemberships = memberGroups.size;
        console.log(`✅ Removed from ${memberGroups.size} group memberships`);
      } catch (e) {
        console.error("⚠️ group membership detach failed:", e.message);
      }

      // 9. Detach the user from events they only JOINED (not created).
      try {
        const joined = await db.collection("events")
          .where("attendees", "array-contains", userId).get();
        await Promise.all(joined.docs.map((ev) =>
          ev.ref.update({
            attendees: FieldValue.arrayRemove(userId),
            waitlist: FieldValue.arrayRemove(userId),
            interested: FieldValue.arrayRemove(userId),
          })));
        counts.eventsLeft = joined.size;
        console.log(`✅ Removed from ${joined.size} joined events`);
      } catch (e) {
        console.error("⚠️ event attendee detach failed:", e.message);
      }

      // 10. The user document AND all its subcollections (private/contact =
      //     phone, notifications, blocks, stripeConnect). recursiveDelete is
      //     essential here — deleting the doc alone would ORPHAN these.
      try {
        await db.recursiveDelete(db.collection("users").doc(userId));
        console.log("✅ Deleted user document + subcollections");
      } catch (e) {
        console.error("⚠️ user doc delete failed:", e.message);
      }

      // 11. Firebase Auth account.
      try {
        await admin.auth().deleteUser(userId);
        console.log("✅ Deleted Firebase Auth user");
      } catch (authError) {
        console.error("⚠️ Auth delete (may already be gone):", authError.message);
      }

      // 12. Storage: everything the user uploaded — avatar, posts, and the
      //     legacy users/{uid}/ prefix.
      try {
        const bucket = admin.storage().bucket();
        const prefixes = [
          `users/${userId}/`,
          `avatars/${userId}/`,
          `posts/${userId}/`,
        ];
        let removed = 0;
        for (const prefix of prefixes) {
          const [files] = await bucket.getFiles({prefix});
          await Promise.all(files.map((f) => f.delete()));
          removed += files.length;
        }
        counts.storageFiles = removed;
        console.log(`✅ Deleted ${removed} storage files`);
      } catch (storageError) {
        console.error("⚠️ Storage delete failed:", storageError.message);
      }

      console.log("🎉 FULL account deletion complete for user:", userId);
      res.json({
        success: true,
        message: "Account and personal data deleted",
        deletedData: counts,
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

      // BUG 34: recipient = each ADMIN. key+params; English fallback from the
      // catalog; the push carries each admin's own language (from adminData).
      const hrParams = {name: requesterName};
      for (const adminDoc of adminsSnapshot.docs) {
        const adminData = adminDoc.data();
        const pushToken = adminData.pushToken;

        // Create in-app notification
        await db.collection("notifications").add({
          userId: adminDoc.id,
          type: "host_request",
          title: tPush("notifications.host.request.title", "en", hrParams),
          message: tPush("notifications.host.request.body", "en", hrParams),
          titleKey: "notifications.host.request.title",
          bodyKey: "notifications.host.request.body",
          params: hrParams,
          icon: "👑",
          read: false,
          metadata: {
            requestId: requestId,
            requesterId: requestData.userId,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        console.log("📝 Created in-app notification for admin:", adminDoc.id);

        // Queue push notification if token exists
        if (pushToken) {
          notifications.push({
            pushToken,
            uid: adminDoc.id,
            lang: baseLang(adminData.language),
            titleKey: "notifications.host.request.title",
            bodyKey: "notifications.host.request.pushBody",
            params: hrParams,
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

// ============================================
// MERCADO PAGO — Checkout Pro (single-account, Option B)
// ============================================
const mercadopago = require("./mercadopago");
exports.createMercadoPagoPreference = mercadopago.createMercadoPagoPreference;
exports.mercadoPagoWebhook = mercadopago.mercadoPagoWebhook;

// ============================================
// ADMIN — user management (master/admin only)
// ============================================

/**
 * Assert the caller is an admin; returns their uid.
 * @param {object} request - onCall request
 * @return {Promise<string>} caller uid
 */
async function requireAdminUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  // Claim-first admin check (isAdminUid), consistent across functions/.
  if (!(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  return uid;
}

/**
 * Delete a user (admin only): removes their Firebase Auth account and user doc.
 */
exports.adminDeleteUser = onCall(async (request) => {
  const callerUid = await requireAdminUid(request);
  const {uid} = request.data || {};
  if (!uid) throw new HttpsError("invalid-argument", "Missing uid.");
  if (uid === callerUid) {
    throw new HttpsError("failed-precondition", "You can't delete your own account here.");
  }
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    console.warn("adminDeleteUser auth:", e.message); // may already be gone
  }
  await db.collection("users").doc(uid).delete();
  return {success: true};
});

/**
 * Generate a password-reset link for a user (admin only). The admin shares the
 * returned link with the user — no need to open Firebase.
 */
exports.adminResetPassword = onCall(async (request) => {
  await requireAdminUid(request);
  const {email} = request.data || {};
  if (!email) throw new HttpsError("invalid-argument", "Missing email.");
  const link = await admin.auth().generatePasswordResetLink(email);
  return {success: true, link};
});

// ============================================
// BONDVIBE PRO — subscription checkout (Stripe)
// ============================================

const HOSTING_ORIGIN = `https://${process.env.GCLOUD_PROJECT || "kinlo-app-dev"}.web.app`;
const PRO_RETURN_URL = `${HOSTING_ORIGIN}/pro-return.html`;
const PLUS_RETURN_URL = `${HOSTING_ORIGIN}/plus-return.html`;

// Admin-editable subscription pricing (config/subscriptions). Amounts are in
// major currency units in Firestore; converted to centavos for Stripe here.
const SUBSCRIPTION_DEFAULTS = {
  pro: {amountCentavos: 19900, currency: "mxn", interval: "month"},
  plus: {amountCentavos: 12900, currency: "mxn", interval: "month"},
};

/**
 * Read subscription pricing from config/subscriptions, with defaults.
 * @return {Promise<{pro:object, plus:object}>} centavos-based pricing per tier
 */
async function getSubscriptionPricing() {
  try {
    const snap = await db.collection("config").doc("subscriptions").get();
    if (!snap.exists) return SUBSCRIPTION_DEFAULTS;
    const d = snap.data() || {};
    const conv = (tier, def) => {
      const amt = Number(d?.[tier]?.amount);
      return {
        amountCentavos: Number.isFinite(amt) ? Math.round(amt * 100) : def.amountCentavos,
        currency: (d?.[tier]?.currency || def.currency).toLowerCase(),
        interval: d?.[tier]?.interval || def.interval,
      };
    };
    return {
      pro: conv("pro", SUBSCRIPTION_DEFAULTS.pro),
      plus: conv("plus", SUBSCRIPTION_DEFAULTS.plus),
    };
  } catch (e) {
    console.warn("⚠️ getSubscriptionPricing:", e.message);
    return SUBSCRIPTION_DEFAULTS;
  }
}

/**
 * Create a Stripe Checkout Session (subscription) for BondVibe Pro. Returns the
 * hosted checkout URL; the webhook flips isPremium once payment completes.
 */
exports.createProCheckoutSession = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!stripe) stripe = require("stripe")(stripeSecretKey.value());

  const email = await getUserEmail(uid);
  const {pro} = await getSubscriptionPricing();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: uid,
    ...(email ? {customer_email: email} : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: pro.currency,
          recurring: {interval: pro.interval},
          unit_amount: pro.amountCentavos,
          product_data: {
            name: "Kinlo Pro",
            description: "Community Matching, AI coaching, QR check-in and more",
          },
        },
      },
    ],
    metadata: {type: "pro_subscription", uid},
    subscription_data: {metadata: {type: "pro_subscription", uid}},
    allow_promotion_codes: true,
    success_url: `${PRO_RETURN_URL}?status=success`,
    cancel_url: `${PRO_RETURN_URL}?status=cancel`,
  });
  return {url: session.url};
});

/**
 * Create a Stripe Checkout Session (subscription) for Kinlo Plus (attendee).
 * The webhook flips users/{uid}.plan to "kinlo_plus" once payment completes.
 */
exports.createPlusCheckoutSession = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!stripe) stripe = require("stripe")(stripeSecretKey.value());

  const email = await getUserEmail(uid);
  const {plus} = await getSubscriptionPricing();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: uid,
    ...(email ? {customer_email: email} : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: plus.currency,
          recurring: {interval: plus.interval},
          unit_amount: plus.amountCentavos,
          product_data: {
            name: "Kinlo Plus",
            description: "Unlimited matches at every event",
          },
        },
      },
    ],
    metadata: {type: "plus_subscription", uid},
    subscription_data: {metadata: {type: "plus_subscription", uid}},
    allow_promotion_codes: true,
    success_url: `${PLUS_RETURN_URL}?status=success`,
    cancel_url: `${PLUS_RETURN_URL}?status=cancel`,
  });
  return {url: session.url};
});

/**
 * Create a Stripe Billing Portal session so a Kinlo Plus member can manage/cancel.
 */
exports.createPlusPortalSession = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!stripe) stripe = require("stripe")(stripeSecretKey.value());

  const snap = await db.collection("users").doc(uid).get();
  const customerId = snap.exists ? snap.data().stripePlusCustomerId : null;
  if (!customerId) {
    throw new HttpsError("failed-precondition", "No active subscription found.");
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: PLUS_RETURN_URL,
  });
  return {url: portal.url};
});

/**
 * Create a Stripe Billing Portal session so a Pro member can manage/cancel.
 */
exports.createProPortalSession = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!stripe) stripe = require("stripe")(stripeSecretKey.value());

  const snap = await db.collection("users").doc(uid).get();
  const customerId = snap.exists ? snap.data().stripeProCustomerId : null;
  if (!customerId) {
    throw new HttpsError("failed-precondition", "No active subscription found.");
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: PRO_RETURN_URL,
  });
  return {url: portal.url};
});

// ============================================
// VEHICLE RENTAL MARKETPLACE (model A)
// Mirrors reserveMembershipCredit (atomic tx) + createEventPaymentIntent
// (Stripe Connect payout). No maps/geo — city-scoped list + static pickup.
// ============================================
const RENTAL_RESERVE_TTL_MS = 20 * 60 * 1000; // unpaid holds expire after 20 min

/**
 * Whether two [start,end) date ranges overlap.
 * @param {string} aStart - first range start (ISO)
 * @param {string} aEnd - first range end (ISO)
 * @param {string} bStart - second range start (ISO)
 * @param {string} bEnd - second range end (ISO)
 * @return {boolean} true when the ranges overlap
 */
const rentalRangesOverlap = (aStart, aEnd, bStart, bEnd) =>
  new Date(aStart).getTime() < new Date(bEnd).getTime() &&
  new Date(aEnd).getTime() > new Date(bStart).getTime();

/**
 * Remove a booking's range from a vehicle's bookedRanges (frees those dates).
 * @param {string} vehicleId - the vehicle to update
 * @param {string} rentalId - the rental whose range should be released
 * @return {Promise<void>}
 */
async function releaseVehicleRange(vehicleId, rentalId) {
  if (!vehicleId) return;
  const vRef = db.collection("vehicles").doc(vehicleId);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(vRef);
      if (!snap.exists) return;
      const ranges = Array.isArray(snap.data().bookedRanges) ?
        snap.data().bookedRanges : [];
      tx.update(vRef, {
        bookedRanges: ranges.filter((r) => r.rentalId !== rentalId),
      });
    });
  } catch (e) {
    console.warn("releaseVehicleRange:", e.message);
  }
}

/**
 * Atomically reserve an available vehicle and open the payment.
 *
 * Marketplace stance (ESCROW B3, docs/DISENO_escrow_rentas.md §1): the rental
 * payment uses SEPARATE CHARGES + TRANSFERS — the charge lands in Kinlo's own
 * balance (no on_behalf_of / transfer_data / application_fee), so Kinlo is the
 * merchant of record and bears PAYMENT chargebacks only. The releaseHostPayouts
 * cron transfers the host's cut after the return + retention window. Any security
 * deposit and any damage/theft are settled OFF-PLATFORM directly between renter
 * and host on pickup — Kinlo never holds or captures the deposit.
 *
 * data: { vehicleId, startAt (ISO), endAt (ISO), eventId? }
 * Returns { rentalId, clientSecret } (or { free:true } for free vehicles).
 */
exports.reserveVehicle = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "email_not_verified");
  }
  const {vehicleId, startAt, endAt, eventId} = request.data || {};
  if (!vehicleId || !startAt || !endAt) {
    throw new HttpsError("invalid-argument", "Missing rental details.");
  }

  // Rental duration in whole days (at least 1) — the fee is per-day.
  const spanMs = new Date(endAt).getTime() - new Date(startAt).getTime();
  const days = Math.max(1, Math.ceil((spanMs || 0) / 864e5)) || 1;

  // Pre-read the vehicle to validate payability BEFORE reserving, so a host
  // who can't receive payouts never leaves a vehicle stuck as "rented".
  const preSnap = await db.collection("vehicles").doc(vehicleId).get();
  if (!preSnap.exists) throw new HttpsError("not-found", "Vehicle not found.");
  const pre = preSnap.data();
  const perDay = pre.pricePerDayCentavos || (pre.specs && pre.specs.pricePerDayCentavos) || 0;
  const price = perDay * days;
  const deposit = pre.depositCentavos || (pre.specs && pre.specs.depositCentavos) || 0;
  const isFree = price === 0;

  // Resolve the payout account (reused from their host payouts). BUG 32.6: a
  // vehicle listed by staff pays the business OWNER (businessOwnerUid), else the
  // listing owner.
  let hostAccount = null;
  const payoutUid = pre.businessOwnerUid || pre.ownerId;
  const paidToBusinessOwner = !!pre.businessOwnerUid;
  if (!isFree) {
    const ownerSnap = payoutUid ?
      await db.collection("users").doc(payoutUid).get() : null;
    const sc = ownerSnap && ownerSnap.exists ? ownerSnap.data().stripeConnect : null;
    hostAccount = sc && sc.accountId ? sc.accountId : null;
    if (!hostAccount && paidToBusinessOwner) {
      throw new HttpsError("failed-precondition", "business_owner_stripe_incomplete");
    }
    // Ask Stripe whether the account can actually charge — the Firestore
    // chargesEnabled/payoutsEnabled flags are client-forgeable.
    if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
    const {assertCanCharge} = require("./stripe/verify");
    try {
      await assertCanCharge(stripe, hostAccount);
    } catch (e) {
      throw new HttpsError("failed-precondition", "host_payouts_not_ready");
    }
  }

  // Event-style pricing (USER_PAYS_FEES): the renter pays the rental fee plus
  // the platform fee and the Stripe fee; the host receives 100% of the fee.
  // Reuses the same pricing model as event tickets, with the admin-configurable
  // RENTAL platform-fee rate.
  const {calculateCheckoutAmount, getPricingConfig} = require("./stripe/pricing");
  const rentCfg = isFree ? null : await getPricingConfig(db);
  const pricing = isFree ? null : calculateCheckoutAmount(price, "stripe", {
    platformFeePercent: rentCfg.rentalPlatformFeePercent,
    processorPercent: rentCfg.stripeFeePercent,
    processorFixed: rentCfg.stripeFixedCentavos,
  });

  // 1) Atomic reservation — the transaction is the source of truth against
  //    double-booking. Availability is per date range: the vehicle keeps a
  //    `bookedRanges` list (public-readable) and we reject any overlap.
  const reserved = await db.runTransaction(async (tx) => {
    const vRef = db.collection("vehicles").doc(vehicleId);
    const vSnap = await tx.get(vRef);
    if (!vSnap.exists) throw new HttpsError("not-found", "Vehicle not found.");
    const v = vSnap.data();
    if (v.status !== "available") {
      throw new HttpsError("failed-precondition", "vehicle_unavailable");
    }
    // Requested range must fall inside the host's availability window.
    if ((v.availableFrom && new Date(startAt) < new Date(v.availableFrom)) ||
        (v.availableUntil && new Date(endAt) > new Date(v.availableUntil))) {
      throw new HttpsError("failed-precondition", "outside_availability");
    }
    // Reject overlap with any existing reserved/active booking.
    const ranges = Array.isArray(v.bookedRanges) ? v.bookedRanges : [];
    const overlaps = ranges.some((r) => rentalRangesOverlap(startAt, endAt, r.start, r.end));
    if (overlaps) {
      throw new HttpsError("failed-precondition", "dates_unavailable");
    }
    const rentalRef = db.collection("rentals").doc();
    tx.update(vRef, {
      bookedRanges: [...ranges, {start: startAt, end: endAt, rentalId: rentalRef.id}],
    });
    tx.set(rentalRef, {
      vehicleId,
      providerId: v.providerId || null,
      ownerId: v.ownerId || null,
      // ESCROW (B3 §4): the payout host is businessOwnerUid || ownerId. Store it
      // so the webhook can key the ledger's hostUid without re-reading the vehicle.
      businessOwnerUid: v.businessOwnerUid || null,
      renterId: uid,
      eventId: eventId || null,
      startAt,
      endAt,
      days,
      priceCentavos: price,
      // Deposit is informational only — settled directly with the host.
      depositCentavos: deposit,
      currency: "mxn",
      ...(pricing ? {
        platformFeeCentavos: pricing.platformFee,
        stripeFeeCentavos: pricing.stripeFee,
        totalCentavos: pricing.totalAmount,
        hostReceivesCentavos: pricing.hostReceives,
      } : {}),
      // Free vehicles skip payment and confirm immediately.
      status: isFree ? "active" : "reserved",
      reservedAt: FieldValue.serverTimestamp(),
      ...(isFree ? {paidAt: FieldValue.serverTimestamp()} : {}),
    });
    return {rentalId: rentalRef.id};
  });

  // Free rental — no PaymentIntent needed.
  if (isFree) {
    return {success: true, rentalId: reserved.rentalId, free: true};
  }

  // 2) Rental-fee PaymentIntent — ESCROW (B3 §3, docs/DISENO_escrow_rentas.md):
  //    SEPARATE CHARGES AND TRANSFERS, identical to createEventPaymentIntent. No
  //    on_behalf_of / transfer_data / application_fee — the funds land in Kinlo's
  //    OWN balance; the releaseHostPayouts cron pays the host after the return +
  //    retention. Kinlo becomes MoR for PAYMENT chargebacks only (§1); the
  //    deposit/damage/theft stay off-platform. transfer_group links the future
  //    transfer. Amounts live on the rental doc (read by the webhook).
  if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
  const fee = await stripe.paymentIntents.create({
    amount: pricing.totalAmount,
    currency: "mxn",
    transfer_group: reserved.rentalId,
    metadata: {
      type: "rental",
      rentalId: reserved.rentalId,
      vehicleId,
      renterId: uid,
    },
  });

  await db.collection("rentals").doc(reserved.rentalId).update({
    paymentIntentId: fee.id,
    stripeAccountId: hostAccount,
  });

  return {
    success: true,
    rentalId: reserved.rentalId,
    clientSecret: fee.client_secret,
  };
});

/**
 * Complete (return) a rental: mark it returned and free the vehicle.
 * data: { rentalId }. Callable by the renter or the vehicle owner.
 *
 * BondVibe does not hold a deposit, so there is nothing to release/capture —
 * any deposit is settled directly between renter and host.
 */
exports.completeRental = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const {rentalId} = request.data || {};
  if (!rentalId) throw new HttpsError("invalid-argument", "Missing rentalId.");

  const rRef = db.collection("rentals").doc(rentalId);
  const rSnap = await rRef.get();
  if (!rSnap.exists) throw new HttpsError("not-found", "Rental not found.");
  const r = rSnap.data();
  if (r.renterId !== uid && r.ownerId !== uid) {
    throw new HttpsError("permission-denied", "Not your rental.");
  }
  if (r.status === "completed" || r.status === "cancelled") {
    return {success: true, already: true};
  }

  await rRef.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
  });
  await releaseVehicleRange(r.vehicleId, rentalId);
  return {success: true};
});

/**
 * Release vehicles whose reservation was never paid within the TTL.
 * Runs every 15 minutes; mirrors the membership reminder scheduler pattern.
 */
exports.expireVehicleReservations = onSchedule(
  {schedule: "every 15 minutes", secrets: [stripeSecretKey]},
  async () => {
    const cutoff = Date.now() - RENTAL_RESERVE_TTL_MS;
    const snap = await db.collection("rentals")
      .where("status", "==", "reserved").get();
    let expired = 0;
    for (const docSnap of snap.docs) {
      const r = docSnap.data();
      const ms = r.reservedAt && r.reservedAt.toMillis ? r.reservedAt.toMillis() : 0;
      if (!ms || ms > cutoff) continue;
      if (r.paymentIntentId) {
        if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
        try {
          await stripe.paymentIntents.cancel(r.paymentIntentId);
        } catch (e) {
          // already captured/cancelled — ignore
        }
      }
      await docSnap.ref.update({
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
      });
      await releaseVehicleRange(r.vehicleId, docSnap.id);
      expired++;
    }
    console.log(`🛴 Expired ${expired} unpaid vehicle reservations`);
  },
);

// ── Marketplace — paid service bookings (Marketplace P1 · M4) ────────────────
// A "service" is a public SessionType. A paid slot booking mirrors reserveVehicle
// exactly: SERVER is the price source of truth, an atomic transaction is the
// guard against over-booking (capacityMax + overlap), a failed/abandoned payment
// leaves NO confirmed booking (reserved holds expire), and the applied fee % is
// snapshotted on the order so a later config change never rewrites history.
const SERVICE_RESERVE_TTL_MS = 20 * 60 * 1000; // unpaid holds expire after 20 min

/**
 * Remove a booking's slot from a sessionType's bookedSlots (frees capacity).
 * @param {string} bizId - business owning the sessionType
 * @param {string} sessionTypeId - the sessionType to update
 * @param {string} bookingId - the booking whose slot should be released
 * @return {Promise<void>}
 */
async function releaseServiceSlot(bizId, sessionTypeId, bookingId) {
  if (!bizId || !sessionTypeId) return;
  const stRef = db.collection("businesses").doc(bizId)
    .collection("sessionTypes").doc(sessionTypeId);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(stRef);
      if (!snap.exists) return;
      const slots = Array.isArray(snap.data().bookedSlots) ? snap.data().bookedSlots : [];
      tx.update(stRef, {bookedSlots: slots.filter((r) => r.bookingId !== bookingId)});
    });
  } catch (e) {
    console.warn("releaseServiceSlot:", e.message);
  }
}

/**
 * Atomically reserve a slot on a public service (SessionType) and open payment.
 * data: { bizId, sessionTypeId, startAt (ISO), buyerName? }
 * Returns { bookingId, clientSecret } (or { free:true } for zero-price services).
 */
exports.reserveServiceBooking = onCall({secrets: [stripeSecretKey]}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "email_not_verified");
  }
  const {bizId, sessionTypeId, startAt, buyerName} = request.data || {};
  if (!bizId || !sessionTypeId || !startAt) {
    throw new HttpsError("invalid-argument", "Missing booking details.");
  }
  if (isNaN(new Date(startAt).getTime())) {
    throw new HttpsError("invalid-argument", "Invalid start time.");
  }

  // Pre-read the service — the SERVER owns price/duration/capacity. The client
  // never sends an amount (fix H2). Only a public, slot-mode service is bookable.
  const stRef = db.collection("businesses").doc(bizId)
    .collection("sessionTypes").doc(sessionTypeId);
  const preSnap = await stRef.get();
  if (!preSnap.exists) throw new HttpsError("not-found", "Service not found.");
  const pre = preSnap.data();
  if (pre.publicListing !== true) throw new HttpsError("failed-precondition", "not_public");
  if (pre.bookingMode === "quote") throw new HttpsError("failed-precondition", "quote_only");
  const durationMin = parseInt(pre.durationMin, 10) || 60;
  const capacityMax = Math.max(1, parseInt(pre.capacityMax, 10) || 1);
  const price = Math.max(0, parseInt(pre.priceCents, 10) || 0);
  const endAt = new Date(new Date(startAt).getTime() + durationMin * 60000).toISOString();
  const isFree = price === 0;

  // Resolve the payout account — the business owner's Stripe Connect (survives an
  // ownership transfer via businesses/{bizId}.ownerUid; falls back to bizId).
  const bizSnap = await db.collection("businesses").doc(bizId).get();
  const ownerUid = (bizSnap.exists && bizSnap.data().ownerUid) || bizId;
  let hostAccount = null;
  if (!isFree) {
    const ownerSnap = await db.collection("users").doc(ownerUid).get();
    const sc = ownerSnap.exists ? ownerSnap.data().stripeConnect : null;
    hostAccount = sc && sc.accountId ? sc.accountId : null;
    if (!hostAccount) throw new HttpsError("failed-precondition", "host_payouts_not_ready");
    // The Firestore chargesEnabled flag is client-forgeable — ask Stripe.
    if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
    const {assertCanCharge} = require("./stripe/verify");
    try {
      await assertCanCharge(stripe, hostAccount);
    } catch (e) {
      throw new HttpsError("failed-precondition", "host_payouts_not_ready");
    }
  }

  // Fee math — services reuse the memberships/event Kinlo fee (admin-configurable
  // eventPlatformFeePercent). USER_PAYS_FEES: buyer pays price + platform + Stripe;
  // host receives 100% of the price they set.
  const {calculateCheckoutAmount, getPricingConfig} = require("./stripe/pricing");
  const cfg = isFree ? null : await getPricingConfig(db);
  const feePct = cfg ? cfg.eventPlatformFeePercent : 0;
  const pricing = isFree ? null : calculateCheckoutAmount(price, "stripe", {
    platformFeePercent: feePct,
    processorPercent: cfg.stripeFeePercent,
    processorFixed: cfg.stripeFixedCentavos,
  });

  // 1) Atomic slot guard — the transaction is the source of truth against
  //    over-booking. The sessionType keeps a bookedSlots list; reject once the
  //    overlapping active bookings reach capacityMax.
  const reserved = await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(stRef);
    if (!sSnap.exists) throw new HttpsError("not-found", "Service not found.");
    const s = sSnap.data();
    const slots = Array.isArray(s.bookedSlots) ? s.bookedSlots : [];
    const overlapping = slots.filter((r) => rentalRangesOverlap(startAt, endAt, r.start, r.end));
    if (overlapping.length >= capacityMax) {
      throw new HttpsError("failed-precondition", "slot_full");
    }
    const bookingRef = db.collection("businesses").doc(bizId).collection("bookings").doc();
    tx.update(stRef, {bookedSlots: [...slots, {start: startAt, end: endAt, bookingId: bookingRef.id}]});
    tx.set(bookingRef, {
      // Rendered by the existing agenda (members[].name). buyerUid keys the
      // buyer's own reads; ownerUid/instructorUid land it on the host's agenda.
      members: [{memberId: null, name: String(buyerName || "").slice(0, 80) || "Guest", linkedUid: uid}],
      buyerUid: uid,
      ownerUid,
      instructorUid: ownerUid,
      sessionTypeId,
      sessionTypeName: s.name || "",
      vertical: s.vertical || null,
      locationMode: s.locationMode || "at_business",
      start: startAt,
      end: endAt,
      durationMin,
      capacityMax,
      location: null,
      status: isFree ? "confirmed" : "reserved",
      paidWith: "stripe",
      priceCents: price,
      currency: "mxn",
      source: "marketplace",
      ...(pricing ? {
        platformFeeCentavos: pricing.platformFee,
        stripeFeeCentavos: pricing.stripeFee,
        totalCentavos: pricing.totalAmount,
        hostReceivesCentavos: pricing.hostReceives,
        // The applied % snapshot (not just the amount) — history-proof audit.
        platformFeePercentApplied: feePct,
      } : {}),
      reservedAt: FieldValue.serverTimestamp(),
      ...(isFree ? {paidAt: FieldValue.serverTimestamp()} : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {bookingId: bookingRef.id};
  });

  // Free service — confirmed server-side, no PaymentIntent.
  if (isFree) return {success: true, bookingId: reserved.bookingId, free: true};

  // 2) PaymentIntent — ESCROW (B3 §3): separate charges + transfers, identical to
  //    events. No on_behalf_of / transfer_data / application_fee → funds to Kinlo's
  //    balance; the release cron pays the host after the slot + retention. Amounts
  //    live on the booking doc (read by the webhook). transfer_group = bookingId.
  if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
  const pi = await stripe.paymentIntents.create({
    amount: pricing.totalAmount,
    currency: "mxn",
    transfer_group: reserved.bookingId,
    metadata: {
      type: "service_booking",
      bizId,
      bookingId: reserved.bookingId,
      sessionTypeId,
      buyerId: uid,
      platformFeePercentApplied: String(feePct),
    },
  });

  await db.collection("businesses").doc(bizId).collection("bookings")
    .doc(reserved.bookingId).update({
      stripePaymentIntentId: pi.id,
      stripeAccountId: hostAccount,
    });

  return {success: true, bookingId: reserved.bookingId, clientSecret: pi.client_secret};
});

/**
 * Release service slots whose reservation was never paid within the TTL.
 * Mirrors expireVehicleReservations; runs every 15 minutes.
 */
exports.expireServiceReservations = onSchedule(
  {schedule: "every 15 minutes", secrets: [stripeSecretKey]},
  async () => {
    const cutoff = Date.now() - SERVICE_RESERVE_TTL_MS;
    // Reuses the bookings.status collection-group index (fieldOverride).
    const snap = await db.collectionGroup("bookings")
      .where("status", "==", "reserved").get();
    let expired = 0;
    for (const docSnap of snap.docs) {
      const b = docSnap.data();
      if (b.source !== "marketplace") continue;
      const ms = b.reservedAt && b.reservedAt.toMillis ? b.reservedAt.toMillis() : 0;
      if (!ms || ms > cutoff) continue;
      if (b.stripePaymentIntentId) {
        if (!stripe) stripe = require("stripe")(stripeSecretKey.value());
        try {
          await stripe.paymentIntents.cancel(b.stripePaymentIntentId);
        } catch (e) {
          // already captured/cancelled — ignore
        }
      }
      await docSnap.ref.update({status: "cancelled", cancelledAt: FieldValue.serverTimestamp()});
      const bizIdFromPath = docSnap.ref.parent.parent && docSnap.ref.parent.parent.id;
      await releaseServiceSlot(bizIdFromPath, b.sessionTypeId, docSnap.id);
      expired++;
    }
    console.log(`📅 Expired ${expired} unpaid service reservations`);
  },
);

// ── Kinlo for Business — Automations (kinlo_business/04) ─────────────────────
// Send-now broadcast, the reminders scheduler, and the Twilio STOP webhook.
// SMS/email are inert until credentials are configured (see business/
// automations.js). To activate SMS: set the TWILIO_* secrets, then bind them
// here — {secrets: [twilioSid, twilioToken, twilioMg]} — and redeploy.
exports.sendBusinessMessage = onCall(bizAutomations.sendBusinessMessage);
exports.businessRemindersCron = onSchedule(
  {schedule: "every day 09:00", timeZone: "America/Mexico_City"},
  bizAutomations.remindersCron,
);
exports.twilioSmsWebhook = onRequest({cors: false}, bizAutomations.twilioWebhook);

// Staff roles an owner may ASSIGN via an invite. Derived from DEFAULT_ROLES
// (src/constants/businessRoles.js) minus "owner": owner is never granted by an
// invite — that path is the admin-gated requestOwnerTransfer (P3, follow-up).
// "admin" is a platform role, never business staff. A business may also define
// CUSTOM roles (businesses/{bizId}/roles, random doc ids) which are allowed too.
// Everything else is rejected so a forged role ("owner"/"admin"/garbage) can't be
// smuggled into a staff record (which would grant finance/ownership access).
const BUILTIN_STAFF_ROLES = ["manager", "instructor", "reception"];

/**
 * Validate a staff role against the REAL assignable set for a business and return
 * the value to store. Blocks "owner"/"admin" (case-insensitive), accepts the
 * built-in roles, and accepts a custom role that actually exists under
 * businesses/{bizId}/roles. Throws invalid-argument otherwise.
 * @param {string} bizId the business id
 * @param {*} role the requested role
 * @return {Promise<string>} the validated role to persist
 */
async function assertAssignableRole(bizId, role) {
  const r = String(role || "").trim();
  const lower = r.toLowerCase();
  if (!r || lower === "owner" || lower === "admin") {
    throw new HttpsError("invalid-argument", "invalid_role");
  }
  if (BUILTIN_STAFF_ROLES.includes(lower)) return lower;
  // A custom role the business actually defined (owner/admin already blocked).
  const roleSnap = await db.collection("businesses").doc(bizId)
    .collection("roles").doc(r).get();
  if (roleSnap.exists) return r;
  throw new HttpsError("invalid-argument", "invalid_role");
}

/**
 * Invite a staff member to a business (owner-only). Looks up the user by email
 * and grants a scoped role. kinlo_business/01 §7. v1: bizId === owner uid.
 */
exports.inviteBusinessStaff = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  // P1 (fix/staff-invite-email-verified): staff access must not be grantable to
  // an UNVERIFIED email. Without this, an attacker registers a Firebase account
  // with the invitee's email (email_verified:false), then claims/accepts the
  // invite and becomes active staff of a business they don't belong to. Mirrors
  // the reserveVehicle / reserveServiceBooking gate.
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "email_not_verified");
  }
  const bizId = uid; // one business per owner
  // Normalize: trim + lowercase so any real account email matches (incl. Gmail).
  const email = String((request.data && request.data.email) || "").trim().toLowerCase();
  const role = await assertAssignableRole(bizId, (request.data && request.data.role) || "reception");
  const handle = String((request.data && request.data.handle) || "")
    .trim().toLowerCase().replace(/^@+/, "");

  // BUG 32.1: an invite now needs the invitee's consent. We write the staff
  // record as status:"invited" (no access — Firestore rules + membership only
  // count "active") and notify them; they Accept/Decline via respondToStaffInvite.
  const bizSnap = await db.collection("businesses").doc(bizId).get();
  const bizName = bizSnap.exists ? (bizSnap.data().name || "") : "";
  let ownerName = "";
  try {
    const ou = await admin.auth().getUser(uid);
    ownerName = ou.displayName || "";
  } catch (e) {
    ownerName = "";
  }
  // BUG 34: recipient = the INVITEE (in-app only). key+params; English fallback
  // from the catalog.
  const notifyInvite = (targetUid, roleVal) => {
    const params = {business: bizName || "A business", role: roleVal};
    return db.collection("notifications").add({
      userId: targetUid,
      type: "staff_invite",
      title: tPush("notifications.staff.invite.title", "en", params),
      message: tPush("notifications.staff.invite.body", "en", params),
      titleKey: "notifications.staff.invite.title",
      bodyKey: "notifications.staff.invite.body",
      params,
      icon: "👥",
      read: false,
      resolved: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {bizId, role: roleVal, businessName: bizName || "", fromUid: uid, fromName: ownerName || ""},
    });
  };

  // Add by @handle (spec 10): resolve the handle → an existing app user and
  // send them an invite (status:"invited" + notification).
  if (handle) {
    const hSnap = await db.collection("handles").doc(handle).get();
    const targetUid = hSnap.exists ? hSnap.data().uid : null;
    if (!targetUid) throw new HttpsError("not-found", "No user with that handle.");
    if (targetUid === uid) throw new HttpsError("already-exists", "You're already the owner.");
    let u = null;
    try {
      u = await admin.auth().getUser(targetUid);
    } catch (e) {
      u = null;
    }
    await db.collection("businesses").doc(bizId)
      .collection("staff").doc(targetUid).set({
        uid: targetUid,
        role,
        email: (u && u.email) || "",
        name: (u && u.displayName) || "",
        branchIds: [],
        status: "invited",
        invitedBy: uid,
        createdAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    await notifyInvite(targetUid, role);
    return {uid: targetUid, role, name: (u && u.displayName) || "", pending: false, invited: true};
  }

  if (!email) throw new HttpsError("invalid-argument", "Email or handle required.");

  let staff = null;
  try {
    staff = await admin.auth().getUserByEmail(email);
  } catch (e) {
    staff = null; // no account yet → pending invite (below)
  }

  if (staff) {
    if (staff.uid === uid) {
      throw new HttpsError("already-exists", "You're already the owner.");
    }
    await db.collection("businesses").doc(bizId)
      .collection("staff").doc(staff.uid).set({
        uid: staff.uid,
        role,
        email,
        name: staff.displayName || "",
        branchIds: [],
        status: "invited",
        invitedBy: uid,
        createdAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    await notifyInvite(staff.uid, role);
    return {uid: staff.uid, role, name: staff.displayName || "", email, pending: false, invited: true};
  }

  // No account yet: store a pending invite keyed by email; it auto-links when
  // the person signs up/logs in (claimStaffInvites).
  await db.collection("staffInvites").doc(`${bizId}_${email}`).set({
    bizId,
    email,
    role,
    status: "pending",
    invitedBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {pending: true, email, role};
});

/**
 * Claim any pending staff invites for the caller's email (called on login).
 * Converts each into a real staff doc under the inviting business.
 */
exports.claimStaffInvites = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  // P1: this converts a pending email invite into a staff record keyed by the
  // TOKEN's email. If the email isn't verified, the caller hasn't proven they
  // own it — refuse, so a squatted account can't claim someone else's invite.
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "email_not_verified");
  }
  const email = String((request.auth.token && request.auth.token.email) || "").trim().toLowerCase();
  if (!email) return {claimed: 0};

  const snap = await db.collection("staffInvites")
    .where("email", "==", email)
    .where("status", "==", "pending")
    .get();
  if (snap.empty) return {claimed: 0};

  let name = "";
  try {
    const u = await admin.auth().getUser(uid);
    name = u.displayName || "";
  } catch (e) {
    // best-effort
  }

  // BUG 32.1: a claimed email invite becomes an "invited" staff record (NOT
  // active) + a notification, so the new user still Accepts before gaining
  // access — same consent step as a handle invite.
  let claimed = 0;
  for (const d of snap.docs) {
    const inv = d.data();
    // Defense in depth: re-validate the stored role against the business's REAL
    // assignable set before materializing the staff record. A pre-existing or
    // tampered invite with a forbidden role ("owner"/"admin") or an unknown role
    // is skipped (left pending), never converted into staff.
    try {
      await assertAssignableRole(inv.bizId, inv.role);
    } catch (e) {
      console.warn(`Skipping invite ${d.id} — invalid role ${inv.role}`);
      continue;
    }
    let bizName = "";
    try {
      const b = await db.collection("businesses").doc(inv.bizId).get();
      bizName = b.exists ? (b.data().name || "") : "";
    } catch (e) {
      bizName = "";
    }
    await db.collection("businesses").doc(inv.bizId).collection("staff").doc(uid).set({
      uid,
      role: inv.role,
      email,
      name,
      branchIds: [],
      status: "invited",
      invitedBy: inv.invitedBy || inv.bizId,
      createdAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    // BUG 34: recipient = the INVITEE. key+params; English fallback from catalog.
    const inviteParams = {business: bizName || "A business", role: inv.role};
    await db.collection("notifications").add({
      userId: uid,
      type: "staff_invite",
      title: tPush("notifications.staff.invite.title", "en", inviteParams),
      message: tPush("notifications.staff.invite.body", "en", inviteParams),
      titleKey: "notifications.staff.invite.title",
      bodyKey: "notifications.staff.invite.body",
      params: inviteParams,
      icon: "👥",
      read: false,
      resolved: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        bizId: inv.bizId,
        role: inv.role,
        businessName: bizName || "",
        fromUid: inv.invitedBy || inv.bizId,
        fromName: "",
      },
    });
    await d.ref.update({
      status: "claimed",
      claimedBy: uid,
      claimedAt: FieldValue.serverTimestamp(),
    });
    claimed += 1;
  }
  return {claimed};
});

/**
 * Respond to a staff invite (BUG 32.1). Only the invitee can respond; the staff
 * record must be status:"invited". Accept → status:"active" (the onStaffWritten
 * trigger adds the membership to users/{uid}.staffOf). Decline → delete it.
 */
exports.respondToStaffInvite = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  // P1: accepting an invite flips a staff record to "active" (grants access). An
  // unverified email hasn't been proven to belong to the caller, so block it here
  // too — the last gate before access, closing the claim→respond hijack chain.
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "email_not_verified");
  }
  const bizId = String((request.data && request.data.bizId) || "").trim();
  const accept = !!(request.data && request.data.accept);
  if (!bizId) throw new HttpsError("invalid-argument", "bizId required.");

  const ref = db.collection("businesses").doc(bizId).collection("staff").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No invite found.");
  const data = snap.data();
  if (data.status !== "invited") {
    // Already handled (or already active) — idempotent success.
    return {ok: true, status: data.status || "active"};
  }

  if (accept) {
    await ref.update({
      status: "active",
      acceptedAt: FieldValue.serverTimestamp(),
    });
    return {ok: true, status: "active", role: data.role || null};
  }
  await ref.delete();
  return {ok: true, status: "declined"};
});

/**
 * Maintain users/{uid}.staffOf (the membership index, BUG 32.2) whenever a staff
 * record is written/removed. Active → ensure { bizId, role } is present; invited
 * or deleted → remove it. Keeps BusinessContext's resolution index in sync
 * regardless of who mutated the staff doc (owner add/remove, invitee accept/decline).
 */
exports.onStaffWritten = onDocumentWritten(
  "businesses/{bizId}/staff/{staffUid}",
  async (event) => {
    const {bizId, staffUid} = event.params;
    const after = event.data && event.data.after;
    const active = after && after.exists && after.data().status === "active";
    const role = active ? (after.data().role || "instructor") : null;

    const userRef = db.collection("users").doc(staffUid);
    await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(userRef);
      if (!uSnap.exists) {
        // No user doc (e.g. email invite before signup) — nothing to index yet.
        if (active) tx.set(userRef, {staffOf: [{bizId, role}]}, {merge: true});
        return;
      }
      const cur = Array.isArray(uSnap.data().staffOf) ? uSnap.data().staffOf : [];
      const without = cur.filter((m) => m && m.bizId !== bizId);
      const next = active ? [...without, {bizId, role}] : without;
      tx.set(userRef, {staffOf: next}, {merge: true});
    });
  },
);

/**
 * Request an ownership transfer (BUG 32.4, Phase 2). Only the CURRENT owner can
 * initiate, and only to a VALIDATED host (users/{toUid}.role in host/admin). It
 * creates an ownerTransfers request in status "pending_admin" and notifies Kinlo
 * admins — nothing changes until an admin approves (approveOwnerTransfer).
 */
exports.requestOwnerTransfer = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const bizId = String((request.data && request.data.bizId) || "").trim();
  const toUid = String((request.data && request.data.toUid) || "").trim();
  if (!bizId || !toUid) throw new HttpsError("invalid-argument", "bizId and toUid required.");
  if (toUid === uid) throw new HttpsError("invalid-argument", "You're already the owner.");

  // Only the current owner (source of truth: business.ownerUid) may initiate.
  const bizSnap = await db.collection("businesses").doc(bizId).get();
  if (!bizSnap.exists) throw new HttpsError("not-found", "Business not found.");
  const ownerUid = bizSnap.data().ownerUid || bizId;
  if (ownerUid !== uid) throw new HttpsError("permission-denied", "Only the owner can transfer.");

  // Recipient must be a validated host.
  const toSnap = await db.collection("users").doc(toUid).get();
  const toRole = toSnap.exists ? (toSnap.data().role || "user") : "user";
  if (toRole !== "host" && toRole !== "admin") {
    throw new HttpsError("failed-precondition", "Recipient must be a validated host.");
  }

  // One pending request at a time per business.
  const existing = await db.collection("ownerTransfers")
    .where("bizId", "==", bizId)
    .where("status", "==", "pending_admin")
    .limit(1)
    .get();
  if (!existing.empty) throw new HttpsError("already-exists", "A transfer is already pending.");

  const bizName = bizSnap.data().name || "";
  const toName = (toSnap.exists && (toSnap.data().fullName || toSnap.data().name)) || "";
  const ref = await db.collection("ownerTransfers").add({
    bizId,
    fromUid: uid,
    toUid,
    toName,
    businessName: bizName,
    status: "pending_admin",
    createdAt: FieldValue.serverTimestamp(),
  });

  // Notify Kinlo admins (recipient = each admin; in-app only). BUG 34: key+params.
  const otrParams = {business: bizName || "A business"};
  const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
  await Promise.all(adminsSnap.docs.map((d) => db.collection("notifications").add({
    userId: d.id,
    type: "owner_transfer_request",
    title: tPush("notifications.ownerTransfer.request.title", "en", otrParams),
    message: tPush("notifications.ownerTransfer.request.body", "en", otrParams),
    titleKey: "notifications.ownerTransfer.request.title",
    bodyKey: "notifications.ownerTransfer.request.body",
    params: otrParams,
    icon: "🔑",
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    metadata: {transferId: ref.id, bizId, fromUid: uid, toUid},
  })));

  return {ok: true, transferId: ref.id};
});

/**
 * Approve or reject an ownership transfer (BUG 32.4). Admin-only. On approve:
 * the recipient's staff role becomes "owner" (active), the old owner is demoted
 * to "manager", and businesses/{bizId}.ownerUid is updated — the source of truth
 * for every owner check. The onStaffWritten trigger re-indexes both memberships.
 */
exports.approveOwnerTransfer = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid || !(await isAdminUid(uid))) {
    throw new HttpsError("permission-denied", "Admin only.");
  }
  const transferId = String((request.data && request.data.transferId) || "").trim();
  const approve = !!(request.data && request.data.approve);
  const demoteRole = String((request.data && request.data.demoteRole) || "manager");
  if (!transferId) throw new HttpsError("invalid-argument", "transferId required.");

  const tRef = db.collection("ownerTransfers").doc(transferId);
  const tSnap = await tRef.get();
  if (!tSnap.exists) throw new HttpsError("not-found", "Transfer not found.");
  const tr = tSnap.data();
  if (tr.status !== "pending_admin") {
    return {ok: true, status: tr.status}; // already decided — idempotent
  }
  const {bizId, fromUid, toUid} = tr;

  if (!approve) {
    await tRef.update({
      status: "rejected",
      decidedBy: uid,
      decidedAt: FieldValue.serverTimestamp(),
    });
    // Recipient = the requesting OWNER (in-app only). BUG 34: key+params.
    await db.collection("notifications").add({
      userId: fromUid,
      type: "owner_transfer_result",
      title: tPush("notifications.ownerTransfer.declined.title", "en", {}),
      message: tPush("notifications.ownerTransfer.declined.body", "en", {}),
      titleKey: "notifications.ownerTransfer.declined.title",
      bodyKey: "notifications.ownerTransfer.declined.body",
      params: {},
      icon: "🔑",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {transferId, bizId, approved: false},
    });
    return {ok: true, status: "rejected"};
  }

  // Approve: promote recipient, demote old owner, move ownership source-of-truth.
  const staffCol = db.collection("businesses").doc(bizId).collection("staff");
  await staffCol.doc(toUid).set({
    uid: toUid,
    role: "owner",
    status: "active",
    branchIds: [],
    ownerSince: FieldValue.serverTimestamp(),
  }, {merge: true});
  await staffCol.doc(fromUid).set({
    role: demoteRole,
    status: "active",
  }, {merge: true});
  await db.collection("businesses").doc(bizId).update({
    ownerUid: toUid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await tRef.update({
    status: "approved",
    decidedBy: uid,
    decidedAt: FieldValue.serverTimestamp(),
  });

  // Recipients = the NEW owner (toUid) and the demoted OLD owner (fromUid) — each
  // gets its own body key. BUG 34: key+params; English fallback from the catalog.
  await Promise.all([toUid, fromUid].map((target) => {
    const isNew = target === toUid;
    const params = {business: tr.businessName || "your business"};
    const titleKey = "notifications.ownerTransfer.approved.title";
    const bodyKey = isNew ?
      "notifications.ownerTransfer.approved.newBody" :
      "notifications.ownerTransfer.approved.oldBody";
    return db.collection("notifications").add({
      userId: target,
      type: "owner_transfer_result",
      title: tPush(titleKey, "en", params),
      message: tPush(bodyKey, "en", params),
      titleKey,
      bodyKey,
      params,
      icon: "🔑",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {transferId, bizId, approved: true},
    });
  }));

  return {ok: true, status: "approved"};
});

// Session reminders (both sides) + the no-request Momentum detector.
exports.businessSessionRemindersCron = onSchedule(
  {schedule: "every 2 hours"}, bizAutomations.sessionRemindersCron);
exports.businessMomentumDetectorCron = onSchedule(
  {schedule: "every day 08:00", timeZone: "America/Mexico_City"},
  bizAutomations.momentumDetectorCron);

/**
 * Attendee self-serve: request a private session from a business they're a
 * linked member of (kinlo_business/03 flow 5). Creates a 'requested' booking;
 * the host confirms/declines. Server-side because the attendee isn't staff.
 */
exports.requestBusinessSession = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const d = request.data || {};
  const bizId = String(d.bizId || "");
  if (!bizId) throw new HttpsError("invalid-argument", "Missing business.");
  // Must be a linked member of this business.
  const mem = await db.collection("businesses").doc(bizId)
    .collection("members").where("linkedUid", "==", uid).limit(1).get();
  if (mem.empty) throw new HttpsError("permission-denied", "Not a member.");
  const member = mem.docs[0];
  const start = d.start ? new Date(d.start) : new Date();
  const ref = await db.collection("businesses").doc(bizId)
    .collection("bookings").add({
      members: [{memberId: member.id, name: member.data().name || ""}],
      sessionTypeId: d.sessionTypeId || null,
      sessionTypeName: String(d.sessionTypeName || ""),
      start: start.toISOString(),
      durationMin: parseInt(d.durationMin, 10) || 60,
      location: null,
      status: "requested",
      paidWith: "credit",
      priceCents: 0,
      reminderHostAt: null,
      reminderAttendeeAt: null,
      notes: String(d.notes || "").slice(0, 500) || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  // Nudge the host (recipient = the host). Title is the member name (user
  // content); the body is a localized system key (BUG 34).
  await db.collection("notifications").add({
    userId: bizId,
    type: "business_session_request",
    title: member.data().name || "New request",
    message: tPush("notifications.business.sessionRequest.body", "en", {}),
    bodyKey: "notifications.business.sessionRequest.body",
    params: {},
    icon: "calendarCheck",
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {bookingId: ref.id};
});
