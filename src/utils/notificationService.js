import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  orderBy,
  limit,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../services/firebase";

// Crear notificación — routed through the server (Firestore rules deny direct
// client create). The Cloud Function stamps fromUserId + a server timestamp so
// the sender can't be spoofed.
export const createNotification = async (userId, notification) => {
  try {
    // Validar que userId existe
    if (!userId) {
      console.error("❌ Cannot create notification: userId is undefined");
      return;
    }

    const fn = httpsCallable(getFunctions(), "createNotification");
    await fn({
      toUserId: userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      // BUG 34: forward i18n key + params so the recipient sees it in THEIR
      // language (not the author's).
      titleKey: notification.titleKey,
      bodyKey: notification.bodyKey,
      params: notification.params || {},
      icon: notification.icon || "bell",
      metadata: notification.metadata || {},
    });
    console.log("✅ Notification created for user:", userId);
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

// Obtener notificaciones del usuario (CON SANITIZACIÓN)
export const getUserNotifications = async (userId) => {
  try {
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const snapshot = await getDocs(notificationsQuery);

    // Sanitizar cada notificación
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();

      // Handle createdAt - support both Firestore Timestamp and ISO string
      let createdAtValue = new Date().toISOString();
      if (data.createdAt) {
        if (data.createdAt.toDate) {
          // It's a Firestore Timestamp
          createdAtValue = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === "string") {
          // It's already an ISO string
          createdAtValue = data.createdAt;
        }
      }

      return {
        id: docSnap.id,
        type: String(data.type || ""),
        title: String(data.title || "Notification"),
        message: String(data.message || ""),
        icon: String(data.icon || "bell"),
        read: Boolean(data.read),
        createdAt: createdAtValue,
        readAt: data.readAt ? String(data.readAt) : undefined,
        metadata:
          data.metadata && typeof data.metadata === "object"
            ? {
                ...data.metadata,
                eventTitle: data.metadata.eventTitle
                  ? String(data.metadata.eventTitle)
                  : undefined,
                eventId: data.metadata.eventId
                  ? String(data.metadata.eventId)
                  : undefined,
                eventTime: data.metadata.eventTime
                  ? String(data.metadata.eventTime)
                  : undefined,
              }
            : {},
      };
    });
  } catch (error) {
    console.error("Error getting notifications:", error);
    return [];
  }
};

// Marcar como leída
export const markAsRead = async (notificationId) => {
  try {
    await updateDoc(doc(db, "notifications", notificationId), {
      read: true,
      readAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
};

// Marcar todas como leídas
export const markAllAsRead = async (userId) => {
  try {
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("read", "==", false)
    );
    const snapshot = await getDocs(notificationsQuery);

    const promises = snapshot.docs.map((docSnap) =>
      updateDoc(doc(db, "notifications", docSnap.id), {
        read: true,
        readAt: new Date().toISOString(),
      })
    );

    await Promise.all(promises);
    console.log("✅ All notifications marked as read");
  } catch (error) {
    console.error("Error marking all as read:", error);
  }
};

// Función helper para crear notificaciones cuando alguien se une a un evento
export const notifyEventJoin = async (
  eventCreatorId,
  joinerName,
  eventTitle,
  eventId
) => {
  if (!eventCreatorId) {
    console.error("❌ Cannot notify: eventCreatorId is undefined");
    return;
  }

  await createNotification(eventCreatorId, {
    type: "event_joined",
    title: "New attendee!",
    message: `${joinerName} joined your "${eventTitle}" event`,
    icon: "users",
    metadata: { eventTitle, eventId },
  });
};

// Función helper para recordatorios de eventos
export const notifyEventReminder = async (
  userId,
  eventTitle,
  eventTime,
  eventId
) => {
  if (!userId) {
    console.error("❌ Cannot notify: userId is undefined");
    return;
  }

  await createNotification(userId, {
    type: "event_reminder",
    title: "Event Tomorrow",
    message: `Don't forget: "${eventTitle}" starts at ${eventTime}`,
    icon: "clock",
    metadata: { eventTitle, eventTime, eventId },
  });
};
