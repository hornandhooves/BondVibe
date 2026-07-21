/**
 * EVENT PUSH NOTIFICATIONS
 * Sends push notifications for event-related actions
 * functions/notifications/eventNotifications.js
 */

const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const {sendBatchPushNotifications} = require("./pushService");
const {getEventCreatorId} = require("../utils/eventHelpers");
const {tPush, baseLang} = require("../i18n");
const roster = require("../utils/roster");

const db = admin.firestore();

/**
 * TRIGGER (fix/privacy-event-roster): the roster moved into
 * events/{id}/roster/{uid}, so attendee changes are per-doc CREATE / DELETE here
 * (no longer diffs on the event doc's attendees array).
 *   CREATE(active)  → notify the host of the join.
 *   DELETE(active)  → notify the host of the cancellation AND promote the OLDEST
 *                     waitlisted person into the freed spot (FIFO), notifying them
 *                     + the host of the new join.
 * Waitlist CREATE / DELETE are silent (a waitlisted user isn't "attending" yet).
 * A promotion is an UPDATE (status waitlist→active), intentionally NOT handled
 * here, so there is no re-trigger loop.
 */
exports.onEventRosterChanged = onDocumentWritten(
  "events/{eventId}/roster/{rosterUid}",
  async (event) => {
    const eventId = event.params.eventId;
    const rosterUid = event.params.rosterUid;
    const before = event.data && event.data.before;
    const after = event.data && event.data.after;
    const created = (!before || !before.exists) && after && after.exists;
    const deleted = before && before.exists && (!after || !after.exists);
    if (!created && !deleted) return null; // UPDATE (e.g. a promotion) → ignore

    const evSnap = await db.collection("events").doc(eventId).get();
    if (!evSnap.exists) return null;
    const e = evSnap.data();
    if (e.status === "cancelled") return null;
    const creatorId = getEventCreatorId(e);

    if (created && after.data().status === "active") {
      await notifyHostOfNewAttendees(
        creatorId, eventId, e.title, e.price, [rosterUid]);
      return null;
    }

    if (deleted && before.data().status === "active") {
      // A spot freed: tell the host, then promote the oldest waitlisted person
      // (FIFO) into it and notify the promoted user + the host.
      await notifyHostOfCancellations(creatorId, eventId, e.title, [rosterUid]);
      const promotedUid = await roster.promoteOldestWaitlist(db, eventId);
      if (promotedUid) {
        await notifyPromoted(eventId, promotedUid, e.title);
        await notifyHostOfNewAttendees(
          creatorId, eventId, e.title, e.price, [promotedUid]);
        console.log(`✅ Promoted ${promotedUid} from the waitlist`);
      }
    }
    return null;
  },
);

/**
 * Notify a promoted waitlister — in-app bubble + push (localized per recipient).
 * @param {string} eventId - Event ID
 * @param {string} uid - the promoted user's uid (recipient)
 * @param {string} eventTitle - Event title
 * @return {Promise<void>}
 */
async function notifyPromoted(eventId, uid, eventTitle) {
  const params = {event: eventTitle || "an event"};
  const tk = "notifications.event.waitlistPromoted.title";
  const bk = "notifications.event.waitlistPromoted.body";
  await db.collection("notifications").add({
    userId: uid,
    type: "waitlist_promoted",
    title: tPush(tk, "en", params),
    message: tPush(bk, "en", params),
    titleKey: tk,
    bodyKey: bk,
    params,
    icon: "🎉",
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    metadata: {eventId, eventTitle: eventTitle || ""},
  });
  const u = await db.collection("users").doc(uid).get();
  if (u.exists && u.data().pushToken) {
    await sendBatchPushNotifications([{
      pushToken: u.data().pushToken,
      uid,
      lang: baseLang(u.data().language), // recipient = promoted attendee
      titleKey: tk,
      bodyKey: "notifications.event.waitlistPromoted.pushBody",
      params,
      data: {type: "waitlist_promoted", eventId},
    }]);
  }
}

/**
 * Notify host when new attendees join
 * @param {string} hostId - Host user ID
 * @param {string} eventId - Event ID
 * @param {string} eventTitle - Event title
 * @param {number} eventPrice - Event price in centavos
 * @param {Array<string>} attendeeIds - Array of attendee user IDs
 */
async function notifyHostOfNewAttendees(
  hostId,
  eventId,
  eventTitle,
  eventPrice,
  attendeeIds,
) {
  if (!hostId) {
    console.log("⚠️ No host ID, skipping notification");
    return;
  }

  try {
    const hostDoc = await db.collection("users").doc(hostId).get();
    if (!hostDoc.exists) {
      console.log("⚠️ Host not found:", hostId);
      return;
    }
    const hostData = hostDoc.data();
    const pushToken = hostData.pushToken;

    // Get attendee names (skip the host joining their own event)
    const attendeeNames = [];
    for (const attendeeId of attendeeIds) {
      if (attendeeId === hostId) continue;
      try {
        const attendeeDoc = await db.collection("users").doc(attendeeId).get();
        if (attendeeDoc.exists) {
          const attendeeData = attendeeDoc.data();
          const name =
            attendeeData.fullName?.split(" ")[0] ||
            attendeeData.name?.split(" ")[0] ||
            "Someone";
          attendeeNames.push(name);
        }
      } catch (error) {
        console.error(`Error getting attendee ${attendeeId}:`, error);
      }
    }

    if (attendeeNames.length === 0) {
      console.log("⏭️ No valid attendees to notify about");
      return;
    }

    // Format notification — BUG 34: pick a localized key by paid/free + count,
    // pass params, and keep the English title/body as a fallback.
    const n = attendeeNames.length;
    const paid = !!(eventPrice && eventPrice > 0);
    const priceMXN = paid ? (eventPrice / 100).toFixed(0) : null;
    const grp = paid ? "paid" : "free";
    const sfx = n === 1 ? "One" : "Other";
    const titleKey = `notifications.event.joined.${grp}Title${sfx}`;
    const bodyKey = `notifications.event.joined.${grp}Body${sfx}`;
    const params = {
      count: n,
      name: attendeeNames[0],
      names: attendeeNames.join(", "),
      event: eventTitle,
      price: priceMXN,
    };
    const title = tPush(titleKey, "en", params); // English fallback
    const body = tPush(bodyKey, "en", params);

    // 1. Always write an in-app notification (the bubble), regardless of push.
    //    This is the single source of "someone joined" for free/paid/membership.
    await db.collection("notifications").add({
      userId: hostId,
      type: "event_joined",
      title,
      message: body,
      titleKey,
      bodyKey,
      params,
      icon: paid ? "💰" : "👋",
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {eventId, eventTitle},
    });
    console.log("✅ In-app notification written for host:", hostId);

    // 2. Send a push too, if the host has a token.
    if (pushToken) {
      await sendBatchPushNotifications([
        {
          pushToken,
          uid: hostId, // recipient = the host
          lang: baseLang(hostData.language), // reuse the already-loaded host doc
          titleKey,
          bodyKey,
          params,
          data: {type: "event_joined", eventId, eventTitle},
        },
      ]);
      console.log(
        `✅ Push sent for ${attendeeNames.length} new attendee(s)`,
      );
    } else {
      console.log("ℹ️ Host has no push token; bubble written, push skipped");
    }
  } catch (error) {
    console.error("❌ Error sending new attendee notification:", error);
  }
}

/**
 * Notify host when attendees cancel
 * @param {string} hostId - Host user ID
 * @param {string} eventId - Event ID
 * @param {string} eventTitle - Event title
 * @param {Array<string>} attendeeIds - Array of cancelled attendee user IDs
 */
async function notifyHostOfCancellations(
  hostId,
  eventId,
  eventTitle,
  attendeeIds,
) {
  if (!hostId) {
    console.log("⚠️ No host ID, skipping notification");
    return;
  }

  try {
    // Get host's push token
    const hostDoc = await db.collection("users").doc(hostId).get();
    if (!hostDoc.exists) {
      console.log("⚠️ Host not found:", hostId);
      return;
    }

    const hostData = hostDoc.data();
    const pushToken = hostData.pushToken;

    if (!pushToken) {
      console.log("⚠️ Host has no push token:", hostId);
      return;
    }

    // Get attendee names
    const attendeeNames = [];
    for (const attendeeId of attendeeIds) {
      // Skip if host cancelled their own attendance
      if (attendeeId === hostId) {
        continue;
      }

      try {
        const attendeeDoc = await db.collection("users").doc(attendeeId).get();
        if (attendeeDoc.exists) {
          const attendeeData = attendeeDoc.data();
          const name =
            attendeeData.fullName?.split(" ")[0] ||
            attendeeData.name?.split(" ")[0] ||
            "Someone";
          attendeeNames.push(name);
        }
      } catch (error) {
        console.error(`Error getting attendee ${attendeeId}:`, error);
      }
    }

    if (attendeeNames.length === 0) {
      console.log("⏭️ No valid cancellations to notify about");
      return;
    }

    // BUG 34: localized key by count; params carry the names/count/event.
    const n = attendeeNames.length;
    const sfx = n === 1 ? "One" : "Other";
    const params = {
      count: n,
      name: attendeeNames[0],
      names: attendeeNames.join(", "),
      event: eventTitle,
    };

    // Send push notification (host only; no in-app bubble for cancellations).
    console.log("📤 Sending cancellation notification to host:", hostId);
    const notifications = [
      {
        pushToken,
        uid: hostId, // recipient = the host
        lang: baseLang(hostData.language), // reuse the already-loaded host doc
        titleKey: `notifications.event.cancelled.title${sfx}`,
        bodyKey: `notifications.event.cancelled.body${sfx}`,
        params,
        data: {
          type: "attendee_cancelled",
          eventId: eventId,
          eventTitle: eventTitle,
        },
      },
    ];

    await sendBatchPushNotifications(notifications);
    console.log(
      `✅ Cancellation notification sent for ${attendeeNames.length} attendee(s)`,
    );
  } catch (error) {
    console.error("❌ Error sending cancellation notification:", error);
  }
}
