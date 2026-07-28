/**
 * Expo Push Notification Service
 * Sends push notifications via Expo Push Notification API, and polls
 * delivery receipts so a token that Apple/Google reject (DeviceNotRegistered)
 * gets cleared instead of silently retried forever.
 *
 * KIN-135: sending a push only ever produces a *ticket* — Expo enqueued it,
 * nothing more. Whether Apple/Google actually delivered it (or rejected the
 * token outright) only shows up ~15-30min later in a *receipt*, which this
 * file never fetched before this change. That's exactly how "Firebase has no
 * APNs key for this bundle id" stayed invisible: sends looked "successful"
 * (ticket status "ok") while every receipt would have said otherwise.
 */

const admin = require("firebase-admin");
const {Expo} = require("expo-server-sdk");
const {getUserLang, getUserLangs, tPush} = require("../i18n");

const expo = new Expo();

// Expo docs: a receipt is usually ready within minutes but can take up to
// ~30min under load — polling sooner just wastes a call. Receipts stay
// available for "at least a day" then get deleted; give up after that so a
// ticket Expo never produced a receipt for doesn't sit in `checked: false`
// forever.
const RECEIPT_MIN_AGE_MS = 20 * 60 * 1000;
const RECEIPT_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Resolve the localized title/body for a notification entry (BUG 34).
 * Keyed path: `key` → `${key}.title`/`${key}.body`, or explicit `titleKey`/
 * `bodyKey` (for cases where the body key differs from the title key). Legacy
 * path: a caller that still passes `title`/`body` is sent as-is (English), so
 * nothing breaks mid-migration.
 * @param {object} entry {key?, titleKey?, bodyKey?, params?, title?, body?}
 * @param {string} lang already-resolved recipient language
 * @return {{title:(string|undefined), body:(string|undefined)}}
 */
const renderKeyed = (entry, lang) => {
  const titleKey = entry.titleKey || (entry.key ? `${entry.key}.title` : null);
  const bodyKey = entry.bodyKey || (entry.key ? `${entry.key}.body` : null);
  return {
    title: titleKey ? tPush(titleKey, lang, entry.params || {}) : entry.title,
    body: bodyKey ? tPush(bodyKey, lang, entry.params || {}) : entry.body,
  };
};
const isKeyed = (entry) => !!(entry.key || entry.titleKey || entry.bodyKey);

/**
 * Recipient's current unread total for the native app-icon badge (spec 12,
 * Fix B). Mirrors the client: event_messages unreadCount + every other unread
 * notification. Best-effort — returns 0 on error.
 * @param {string} uid
 * @return {Promise<number>}
 */
const unreadTotalForUser = async (uid) => {
  try {
    const snap = await admin.firestore().collection("notifications")
      .where("userId", "==", uid).get();
    let total = 0;
    snap.forEach((d) => {
      const data = d.data();
      if (data.type === "event_messages") total += data.unreadCount || 0;
      else if (data.read === false) total += 1;
    });
    return total;
  } catch (e) {
    return 0;
  }
};

/**
 * A token Expo/Apple/Google have confirmed dead — clear it from every user
 * doc carrying it (should be one, but a device re-registering under a
 * different account before the old one logged out can leave more than one).
 * @param {string} pushToken
 * @return {Promise<number>} how many docs were cleared
 */
const clearPushTokenEverywhere = async (pushToken) => {
  const snap = await admin.firestore().collection("users")
    .where("pushToken", "==", pushToken).get();
  if (snap.empty) return 0;
  const batch = admin.firestore().batch();
  snap.forEach((d) => {
    batch.update(d.ref, {
      pushToken: null,
      pushTokenUpdatedAt: new Date().toISOString(),
    });
  });
  await batch.commit();
  return snap.size;
};

/**
 * Persist a sent ticket's receipt id so pollPushReceipts can look it up
 * later. Doc id = the receipt id itself (natural unique key).
 * @param {object} batch a Firestore WriteBatch
 * @param {object} ticket has at least {id}
 * @param {string} pushToken
 * @param {string} uid
 */
const queueReceiptCheck = (batch, ticket, pushToken, uid) => {
  const ref = admin.firestore().collection("pushReceipts").doc(ticket.id);
  batch.set(ref, {
    ticketId: ticket.id,
    pushToken,
    uid: uid || null,
    checked: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

/**
 * Handle one ticket from sendPushNotificationsAsync: queue its receipt for
 * later polling on success, or react immediately on a send-time error (Expo
 * can report DeviceNotRegistered at ticket time too, not only at receipt
 * time — no need to wait ~20min for that case).
 * @param {object} batch a Firestore WriteBatch
 * @param {object} ticket
 * @param {string} pushToken
 * @param {string} uid
 * @return {Promise<void>}
 */
const handleTicket = async (batch, ticket, pushToken, uid) => {
  if (ticket.status === "ok") {
    queueReceiptCheck(batch, ticket, pushToken, uid);
    return;
  }
  console.error(`❌ [push-ticket] send-time error for ${pushToken}:`, ticket.message, ticket.details);
  if (ticket.details?.error === "DeviceNotRegistered") {
    await clearPushTokenEverywhere(pushToken);
  }
};

/**
 * Send push notification to a single user.
 * @param {string} pushToken - Expo push token
 * @param {object} notification - localized `{ key|titleKey|bodyKey, params, uid,
 *   data, badge? }` (BUG 34) OR legacy pre-rendered `{ title, body, data, badge? }`.
 */
const sendPushNotification = async (pushToken, notification) => {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`❌ Invalid Expo push token: ${pushToken}`);
    return {success: false, error: "Invalid push token"};
  }

  // BUG 34: localize to the recipient's language when the caller passes a key.
  let title = notification.title;
  let body = notification.body;
  if (isKeyed(notification)) {
    const lang = notification.lang || (await getUserLang(notification.uid)) || "en";
    ({title, body} = renderKeyed(notification, lang));
  }

  const message = {
    to: pushToken,
    sound: "default",
    title,
    body,
    data: notification.data || {},
    priority: "high",
    channelId: "default",
  };
  // Native app-icon badge = recipient's new unread total (lets iOS bump the
  // home-screen icon even while the app is killed).
  if (typeof notification.badge === "number") message.badge = notification.badge;

  try {
    const [ticket] = await expo.sendPushNotificationsAsync([message]);
    console.log("✅ Push notification sent:", ticket);

    const batch = admin.firestore().batch();
    await handleTicket(batch, ticket, pushToken, notification.uid);
    await batch.commit();

    return {success: ticket.status === "ok", result: ticket};
  } catch (error) {
    console.error("❌ Error sending push notification:", error);
    return {success: false, error: error.message};
  }
};

/**
 * Send push notifications to multiple users.
 * @param {Array} notifications - Array of localized `{ pushToken, key|titleKey|
 *   bodyKey, params, uid, data, badge? }` (BUG 34) OR legacy `{ pushToken, title,
 *   body, data }`. Language is resolved PER ENTRY (per recipient) — a mixed-
 *   language audience gets each person their own language, not one global one.
 */
const sendBatchPushNotifications = async (notifications) => {
  // Pre-resolve each keyed recipient's language in chunked `in` queries, so a
  // batch to a mixed-language audience localizes per recipient.
  const keyedUids = notifications
    .filter((n) => isKeyed(n) && !n.lang)
    .map((n) => n.uid)
    .filter(Boolean);
  const langByUid = keyedUids.length ? await getUserLangs(keyedUids) : {};

  // Keep `validNotifs[i]` aligned with `messages[i]` — chunking both the
  // same way (below) is what lets a ticket be zipped back to its sender.
  const messages = [];
  const validNotifs = [];

  for (const notif of notifications) {
    if (!Expo.isExpoPushToken(notif.pushToken)) {
      console.error(`❌ Invalid token skipped: ${notif.pushToken}`);
      continue;
    }

    let title = notif.title;
    let body = notif.body;
    if (isKeyed(notif)) {
      const lang = notif.lang || langByUid[notif.uid] || "en";
      ({title, body} = renderKeyed(notif, lang));
    }

    const msg = {
      to: notif.pushToken,
      sound: "default",
      title,
      body,
      data: notif.data || {},
      priority: "high",
      channelId: "default",
    };
    if (typeof notif.badge === "number") msg.badge = notif.badge;
    messages.push(msg);
    validNotifs.push(notif);
  }

  if (messages.length === 0) {
    console.log("⚠️ No valid push tokens to send");
    return [];
  }

  console.log(`📤 Attempting to send ${messages.length} notifications...`);

  const chunks = expo.chunkPushNotifications(messages);
  const allTickets = [];
  let cursor = 0;

  for (const chunk of chunks) {
    const notifChunk = validNotifs.slice(cursor, cursor + chunk.length);
    cursor += chunk.length;

    let tickets;
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error("❌ Error sending batch chunk:", error);
      continue; // other chunks still get a shot
    }

    const batch = admin.firestore().batch();
    for (let i = 0; i < tickets.length; i++) {
      await handleTicket(batch, tickets[i], notifChunk[i].pushToken, notifChunk[i].uid);
    }
    await batch.commit();

    allTickets.push(...tickets);
  }

  console.log(`✅ Sent ${allTickets.length} push notifications`);
  return allTickets;
};

/**
 * Scheduled job (KIN-135): poll delivery receipts for tickets queued by
 * sendPushNotification/sendBatchPushNotifications. A receipt with
 * details.error === "DeviceNotRegistered" means Apple/Google have
 * permanently rejected this token — clear it so nothing keeps sending to a
 * dead token indefinitely. Wire this up with onSchedule in index.js; kept
 * as a plain function here so it's unit-testable without a scheduler.
 * @return {Promise<{ok:number, cleared:number, expired:number}>}
 */
const pollPushReceipts = async () => {
  const db = admin.firestore();
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - RECEIPT_MIN_AGE_MS);
  const snap = await db.collection("pushReceipts")
    .where("checked", "==", false)
    .where("createdAt", "<=", cutoff)
    .limit(1000) // re-runs every 30min; anything left over just picks up next run
    .get();

  if (snap.empty) {
    console.log("📭 pollPushReceipts: nothing to check");
    return {ok: 0, cleared: 0, expired: 0};
  }

  const docs = snap.docs;
  const receiptIds = docs.map((d) => d.data().ticketId);
  const chunks = expo.chunkPushNotificationReceiptIds(receiptIds);

  const now = Date.now();
  let okCount = 0;
  let cleared = 0;
  let expiredCount = 0;
  let cursor = 0;

  for (const chunk of chunks) {
    const docChunk = docs.slice(cursor, cursor + chunk.length);
    cursor += chunk.length;

    let receipts;
    try {
      receipts = await expo.getPushNotificationReceiptsAsync(chunk);
    } catch (error) {
      console.error("❌ getPushNotificationReceiptsAsync failed for chunk:", error);
      continue; // leave this chunk's docs unchecked, retried next run
    }

    const batch = db.batch();

    for (const docSnap of docChunk) {
      const data = docSnap.data();
      const receipt = receipts[data.ticketId];

      if (!receipt) {
        const ageMs = now - (data.createdAt?.toMillis?.() ?? now);
        if (ageMs > RECEIPT_MAX_AGE_MS) {
          batch.update(docSnap.ref, {checked: true, receiptStatus: "expired"});
          expiredCount++;
        }
        continue;
      }

      if (receipt.status === "ok") {
        batch.update(docSnap.ref, {checked: true, receiptStatus: "ok"});
        okCount++;
        continue;
      }

      console.error(
        `❌ [push-receipt] delivery error for ${data.pushToken}:`,
        receipt.message,
        receipt.details,
      );
      batch.update(docSnap.ref, {
        checked: true,
        receiptStatus: "error",
        receiptError: receipt.details?.error || receipt.message || "unknown",
      });

      if (receipt.details?.error === "DeviceNotRegistered" && data.pushToken) {
        cleared += await clearPushTokenEverywhere(data.pushToken);
      }
    }

    await batch.commit();
  }

  console.log(
    `📬 pollPushReceipts: ${okCount} ok, ${cleared} DeviceNotRegistered cleared, ` +
    `${expiredCount} expired-without-receipt`,
  );
  return {ok: okCount, cleared, expired: expiredCount};
};

module.exports = {
  sendPushNotification,
  sendBatchPushNotifications,
  unreadTotalForUser,
  pollPushReceipts,
  clearPushTokenEverywhere,
};
