import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Send a notification to a user
 */
export const sendNotification = async ({
  userId,
  type,
  title,
  body,
  relatedEventId = null,
  relatedUserId = null,
}) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      type,
      title,
      body,
      relatedEventId,
      relatedUserId,
      read: false,
      createdAt: new Date().toISOString(),
    });
    
    console.log(`✅ Notification sent to ${userId}: ${title}`);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

/**
 * Notification types and their templates
 */
export const NotificationTypes = {
  HOST_APPROVED: 'host_approved',
  HOST_REJECTED: 'host_rejected',
  EVENT_REMINDER: 'event_reminder',
  USER_JOINED_YOUR_EVENT: 'user_joined_your_event',
  NEW_MESSAGE: 'new_message',
  EVENT_CANCELLED: 'event_cancelled',
  EVENT_UPDATED: 'event_updated',
};

/**
 * Send host approval notification
 */
export const notifyHostApproved = async (userId) => {
  await sendNotification({
    userId,
    type: NotificationTypes.HOST_APPROVED,
    title: 'You\'re now a Verified Host!',
    body: 'Your host request has been approved. You can now create and manage events!',
  });
};

/**
 * Send host rejection notification
 */
export const notifyHostRejected = async (userId) => {
  await sendNotification({
    userId,
    type: NotificationTypes.HOST_REJECTED,
    title: 'Host Request Update',
    body: 'Unfortunately, your host request was not approved at this time. You can reapply in the future.',
  });
};

/**
 * Send event reminder (24h before)
 */
export const notifyEventReminder = async (userId, eventId, eventTitle) => {
  await sendNotification({
    userId,
    type: NotificationTypes.EVENT_REMINDER,
    title: 'Event Tomorrow!',
    body: `Don't forget: "${eventTitle}" is happening tomorrow!`,
    relatedEventId: eventId,
  });
};

/**
 * Notify host when someone joins their event
 */
export const notifyUserJoinedEvent = async (hostId, eventId, userName, eventTitle) => {
  await sendNotification({
    userId: hostId,
    type: NotificationTypes.USER_JOINED_YOUR_EVENT,
    title: 'New Attendee!',
    body: `${userName} just joined your event "${eventTitle}"`,
    relatedEventId: eventId,
  });
};

/**
 * Notify attendees about new message in event chat
 */
export const notifyNewMessage = async (attendeeIds, eventId, senderName, eventTitle) => {
  // Send notification to all attendees except sender
  const notifications = attendeeIds.map(userId => 
    sendNotification({
      userId,
      type: NotificationTypes.NEW_MESSAGE,
      title: 'New Message',
      body: `${senderName} sent a message in "${eventTitle}"`,
      relatedEventId: eventId,
    })
  );
  
  await Promise.all(notifications);
};

/**
 * Notify about event cancellation
 */
export const notifyEventCancelled = async (userId, eventId, eventTitle) => {
  await sendNotification({
    userId,
    type: NotificationTypes.EVENT_CANCELLED,
    title: 'Event Cancelled',
    body: `"${eventTitle}" has been cancelled by the host.`,
    relatedEventId: eventId,
  });
};

/**
 * Notify about event update
 */
export const notifyEventUpdated = async (userId, eventId, eventTitle) => {
  await sendNotification({
    userId,
    type: NotificationTypes.EVENT_UPDATED,
    title: 'Event Updated',
    body: `"${eventTitle}" has been updated. Check the new details!`,
    relatedEventId: eventId,
  });
};
