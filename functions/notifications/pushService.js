/**
 * Expo Push Notification Service
 * Sends push notifications via Expo Push Notification API
 */

const fetch = require("node-fetch");
const admin = require("firebase-admin");
const {getUserLang, getUserLangs, tPush} = require("../i18n");

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
 * Send push notification to a single user.
 * @param {string} pushToken - Expo push token
 * @param {object} notification - localized `{ key|titleKey|bodyKey, params, uid,
 *   data, badge? }` (BUG 34) OR legacy pre-rendered `{ title, body, data, badge? }`.
 */
const sendPushNotification = async (pushToken, notification) => {
  // Validate Expo push token format
  if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
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
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "<unreadable body>");
      console.error(`❌ Expo push send failed: HTTP ${response.status}`, body);
      return {success: false, error: `HTTP ${response.status}`};
    }

    const result = await response.json();
    // KIN-136 Tier 1: a single-message send returns result.data as one
    // ticket OBJECT, not an array (only a batch send returns an array) —
    // normalize so the error check below is the same either way.
    const tickets = Array.isArray(result.data) ? result.data : [result.data];
    let hasError = false;
    for (const ticket of tickets) {
      if (ticket?.status === "error") {
        hasError = true;
        // Never log the push token itself — long-lived, PII-adjacent. The
        // uid is enough to find the affected user/doc.
        console.error(
          `❌ [push] delivery error for uid ${notification.uid || "unknown"}:`,
          ticket.details?.error,
          ticket.message,
        );
      }
    }

    console.log("✅ Push notification sent:", result);
    return {success: !hasError, result: result};
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

  const messages = [];
  // Kept aligned with `messages` (same filter, same order) so a ticket can
  // be zipped back to the uid that sent it, below.
  const validNotifs = [];

  for (const notif of notifications) {
    // Validate Expo push token format
    if (!notif.pushToken || !notif.pushToken.startsWith("ExponentPushToken[")) {
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

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "<unreadable body>");
      console.error(`❌ Expo push batch send failed: HTTP ${response.status}`, body);
      return [];
    }

    const result = await response.json();
    const tickets = result.data || [];
    // KIN-136 Tier 1: a batch send returns tickets in the same order as the
    // messages sent — zip each error ticket back to its uid (never the
    // token itself, long-lived and PII-adjacent).
    tickets.forEach((ticket, i) => {
      if (ticket?.status === "error") {
        console.error(
          `❌ [push] delivery error for uid ${validNotifs[i]?.uid || "unknown"}:`,
          ticket.details?.error,
          ticket.message,
        );
      }
    });

    console.log(`✅ Sent ${messages.length} push notifications:`, result);
    return tickets;
  } catch (error) {
    console.error("❌ Error sending batch:", error);
    return [];
  }
};

module.exports = {
  sendPushNotification,
  sendBatchPushNotifications,
  unreadTotalForUser,
};
