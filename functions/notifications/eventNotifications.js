/**
 * EVENT PUSH NOTIFICATIONS
 * Sends push notifications for event-related actions
 * functions/notifications/eventNotifications.js
 */

const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const {sendBatchPushNotifications} = require("./pushService");
const {getAttendeeIds, getEventCreatorId} = require("../utils/eventHelpers");

const db = admin.firestore();

/**
 * TRIGGER: When event document is updated
 * Detects when attendees array changes and sends push notifications
 */
exports.onEventAttendeesChanged = onDocumentUpdated(
  "events/{eventId}",
  async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const eventId = event.params.eventId;

    // Skip if event is cancelled
    if (afterData.status === "cancelled") {
      console.log("⏭️ Event is cancelled, skipping notifications");
      return null;
    }

    // Get attendees arrays (normalized to UID strings)
    const beforeAttendees = getAttendeeIds(beforeData.attendees);
    const afterAttendees = getAttendeeIds(afterData.attendees);

    // Detect new attendees (joined)
    const newAttendees = afterAttendees.filter(
      (id) => !beforeAttendees.includes(id),
    );

    // Detect removed attendees (cancelled)
    const removedAttendees = beforeAttendees.filter(
      (id) => !afterAttendees.includes(id),
    );

    console.log("👥 Attendee changes detected:", {
      eventId: eventId,
      eventTitle: afterData.title,
      newAttendees: newAttendees.length,
      removedAttendees: removedAttendees.length,
    });

    // Promote from the waitlist (FIFO) whenever a spot is open. The resulting
    // update re-triggers this function, which then notifies the host of the join.
    const max = afterData.maxAttendees || afterData.maxPeople || 0;
    const waitlist = Array.isArray(afterData.waitlist) ? afterData.waitlist : [];
    if (max && waitlist.length > 0 && afterAttendees.length < max) {
      const promoted = waitlist.slice(0, max - afterAttendees.length);
      if (promoted.length > 0) {
        await db.doc(`events/${eventId}`).update({
          attendees: admin.firestore.FieldValue.arrayUnion(...promoted),
          waitlist: admin.firestore.FieldValue.arrayRemove(...promoted),
        });
        for (const uid of promoted) {
          await db.collection("notifications").add({
            userId: uid,
            type: "waitlist_promoted",
            title: "You're in! 🎉",
            message: `A spot opened in "${afterData.title || "an event"}" — you're confirmed.`,
            icon: "🎉",
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            metadata: {eventId, eventTitle: afterData.title || ""},
          });
          const u = await db.collection("users").doc(uid).get();
          if (u.exists && u.data().pushToken) {
            await sendBatchPushNotifications([{
              pushToken: u.data().pushToken,
              title: "You're in! 🎉",
              body: `A spot opened in "${afterData.title || "an event"}"`,
              data: {type: "waitlist_promoted", eventId},
            }]);
          }
        }
        console.log(`✅ Promoted ${promoted.length} from waitlist`);
      }
    }

    // Process new attendees (someone joined)
    if (newAttendees.length > 0) {
      await notifyHostOfNewAttendees(
        getEventCreatorId(afterData),
        eventId,
        afterData.title,
        afterData.price,
        newAttendees,
      );
    }

    // Process cancelled attendees (someone left)
    if (removedAttendees.length > 0) {
      await notifyHostOfCancellations(
        getEventCreatorId(afterData),
        eventId,
        afterData.title,
        removedAttendees,
      );
    }

    return null;
  },
);

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

    // Format notification message
    let title;
    let body;
    if (eventPrice && eventPrice > 0) {
      const priceMXN = (eventPrice / 100).toFixed(0);
      title =
        attendeeNames.length === 1 ?
          "💰 New Paid Attendee!" :
          `💰 ${attendeeNames.length} New Paid Attendees!`;
      body =
        attendeeNames.length === 1 ?
          `${attendeeNames[0]} paid $${priceMXN} MXN for "${eventTitle}"` :
          `${attendeeNames.join(", ")} joined "${eventTitle}"`;
    } else {
      title =
        attendeeNames.length === 1 ?
          "👋 New Attendee!" :
          `👋 ${attendeeNames.length} New Attendees!`;
      body =
        attendeeNames.length === 1 ?
          `${attendeeNames[0]} joined "${eventTitle}"` :
          `${attendeeNames.join(", ")} joined "${eventTitle}"`;
    }

    // 1. Always write an in-app notification (the bubble), regardless of push.
    //    This is the single source of "someone joined" for free/paid/membership.
    await db.collection("notifications").add({
      userId: hostId,
      type: "event_joined",
      title,
      message: body,
      icon: eventPrice && eventPrice > 0 ? "💰" : "👋",
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {eventId, eventTitle},
    });
    console.log("✅ In-app notification written for host:", hostId);

    // 2. Send a push too, if the host has a token.
    if (pushToken) {
      await sendBatchPushNotifications([
        {
          pushToken,
          title,
          body,
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

    // Format notification message
    let title;
    let body;

    if (attendeeNames.length === 1) {
      title = "🚫 Attendee Cancelled";
      body = `${attendeeNames[0]} cancelled their attendance for "${eventTitle}"`;
    } else {
      title = `🚫 ${attendeeNames.length} Attendees Cancelled`;
      body = `${attendeeNames.join(", ")} cancelled for "${eventTitle}"`;
    }

    // Send push notification
    console.log("📤 Sending cancellation notification to host:", hostId);
    const notifications = [
      {
        pushToken,
        title,
        body,
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
