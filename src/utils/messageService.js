import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  getDocs,
  where,
  updateDoc,
  writeBatch,
  limit,
} from "firebase/firestore";
import { db } from "../services/firebase";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { getEventCreatorId, isUserAttending } from "./eventHelpers";
import { logger } from "./logger";

// ============================================
// FUNCIONES DE CONVERSACIÓN
// ============================================

/**
 * Asegurar que existe una conversación para un evento
 */
export const ensureEventConversation = async (conversationId) => {
  try {
    const eventId = conversationId.replace("event_", "");
    const eventRef = doc(db, "events", eventId);
    const eventDoc = await getDoc(eventRef);

    if (!eventDoc.exists()) {
      throw new Error(`Event ${eventId} does not exist`);
    }

    console.log("✅ Event conversation ready:", eventId);
  } catch (error) {
    console.error("❌ Error ensuring conversation:", error);
    throw error;
  }
};

// ============================================
// ENVÍO DE MENSAJES
// ============================================

/**
 * Enviar mensaje de texto
 */
export const sendMessage = async (conversationId, senderId, text) => {
  try {
    console.log("📤 Attempting to send message...");
    console.log("👤 Sender ID:", senderId);
    console.log("💬 Conversation ID:", conversationId);

    const eventId = conversationId.replace("event_", "");
    console.log("📍 Event ID:", eventId);

    const messagesRef = collection(db, "events", eventId, "messages");

    const messageData = {
      senderId,
      text,
      type: "text",
      createdAt: new Date().toISOString(),
      deliveredTo: {},  // { userId: true } — per-user delivery tracking
      readBy: {},       // { userId: true } — per-user read tracking
    };

    console.log("📝 Message data:", JSON.stringify(messageData));

    const docRef = await addDoc(messagesRef, messageData);
    console.log("✅ Message sent successfully! Doc ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error sending message:", error);
    console.error("❌ Error code:", error.code);
    console.error("❌ Error message:", error.message);
    throw error;
  }
};

/**
 * Enviar mensaje de ubicación
 */
export const sendLocationMessage = async (
  conversationId,
  senderId,
  latitude,
  longitude,
  address = null
) => {
  try {
    const eventId = conversationId.replace("event_", "");
    const messagesRef = collection(db, "events", eventId, "messages");

    const messageData = {
      senderId,
      type: "location",
      location: {
        latitude,
        longitude,
        address: address || `${latitude}, ${longitude}`,
      },
      createdAt: new Date().toISOString(),
      deliveredTo: {},
      readBy: {},
    };

    const docRef = await addDoc(messagesRef, messageData);
    console.log("✅ Location message sent:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error sending location:", error);
    throw error;
  }
};

// ============================================
// SUSCRIPCIONES REAL-TIME
// ============================================

/**
 * Suscribirse a mensajes de una conversación (real-time)
 */
export const subscribeToMessages = (conversationId, callback) => {
  const eventId = conversationId.replace("event_", "");
  const messagesRef = collection(db, "events", eventId, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));

  const unsubscribe = onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const messages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(messages);
    },
    (error) => {
      console.error("❌ Error in messages subscription:", error);
    }
  );

  return unsubscribe;
};

/**
 * Suscribirse a indicadores de "escribiendo" (real-time)
 */
export const subscribeToTypingStatus = (conversationId, callback) => {
  const eventId = conversationId.replace("event_", "");
  const typingRef = collection(db, "events", eventId, "typing");

  const unsubscribe = onSnapshot(
    typingRef,
    (snapshot) => {
      const now = Date.now();
      const activeTypers = [];

      snapshot.docs.forEach((doc) => {
        const userId = doc.id;
        const data = doc.data();
        const timestamp = data.timestamp || 0;

        const timeSince = now - timestamp;
        if (timeSince < 10000) {
          activeTypers.push(userId);
        }
      });

      callback(activeTypers);
    },
    (error) => {
      console.error("❌ Error in typing subscription:", error);
    }
  );

  return unsubscribe;
};

// ============================================
// INDICADORES DE ESTADO
// ============================================

/**
 * Establecer estado de "escribiendo"
 */
export const setTypingStatus = async (conversationId, userId, isTyping) => {
  try {
    const eventId = conversationId.replace("event_", "");
    const typingRef = doc(db, "events", eventId, "typing", userId);

    if (isTyping) {
      await setDoc(typingRef, {
        timestamp: Date.now(),
        userId: userId,
      });
    } else {
      await setDoc(typingRef, {
        timestamp: 0,
        userId: userId,
      });
    }
  } catch (error) {
    console.error("❌ Error setting typing status:", error);
  }
};

/**
 * Marcar mensajes como entregados al usuario actual.
 * Usa mapa por usuario: deliveredTo.{userId} = true
 */
export const markMessagesAsDelivered = async (
  conversationId,
  currentUserId
) => {
  try {
    const eventId = conversationId.replace("event_", "");
    const messagesRef = collection(db, "events", eventId, "messages");

    // Read last 100 messages and filter those not yet delivered to this user
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(100));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    const batch = writeBatch(db);
    let count = 0;

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.senderId !== currentUserId && !data.deliveredTo?.[currentUserId]) {
        batch.update(docSnap.ref, { [`deliveredTo.${currentUserId}`]: true });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`✅ Marked ${count} messages as delivered`);
    }
  } catch (error) {
    console.error("❌ Error marking as delivered:", error);
  }
};

/**
 * Marcar mensajes como leídos por el usuario actual.
 * Usa mapa por usuario: readBy.{userId} = true
 */
export const markMessagesAsRead = async (conversationId, currentUserId) => {
  try {
    const eventId = conversationId.replace("event_", "");
    const messagesRef = collection(db, "events", eventId, "messages");

    // Read last 100 messages and filter those not yet read by this user
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(100));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      await clearEventMessageNotifications(conversationId, currentUserId);
      return;
    }

    const batch = writeBatch(db);
    let count = 0;

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.senderId !== currentUserId && !data.readBy?.[currentUserId]) {
        batch.update(docSnap.ref, {
          [`readBy.${currentUserId}`]: true,
          [`deliveredTo.${currentUserId}`]: true,
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`✅ Marked ${count} messages as read`);
    }

    await clearEventMessageNotifications(conversationId, currentUserId);
  } catch (error) {
    console.error("❌ Error marking as read:", error);
    await clearEventMessageNotifications(conversationId, currentUserId);
  }
};

// ============================================
// NOTIFICACIONES IN-APP
// ============================================

/**
 * ✅ FIXED: Limpiar notificaciones de mensajes de un evento
 * Silencia errores si la notificación no existe (comportamiento esperado)
 */
export const clearEventMessageNotifications = async (
  conversationId,
  userId
) => {
  try {
    const cleanEventId = conversationId.replace("event_", "");
    const notificationId = `event_msg_${cleanEventId}_${userId}`;

    const notificationRef = doc(db, "notifications", notificationId);
    const notifDoc = await getDoc(notificationRef);

    if (notifDoc.exists()) {
      const currentData = notifDoc.data();

      // Verify this notification belongs to the current user
      if (currentData.userId !== userId) {
        return;
      }

      await updateDoc(notificationRef, {
        read: true,
        unreadCount: 0,
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      console.log("✅ Notification cleared");
    }
    // If notification doesn't exist, that's fine - nothing to clear
  } catch (error) {
    // Silently handle errors - this is not critical
    // The notification might have been deleted or never existed
    // This is expected behavior when user sends their own messages
  }
};

// ============================================
// PUSH TOKEN REGISTRATION
// ============================================

/**
 * Registrar token de push del dispositivo
 */
export const registerPushToken = async (userId) => {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("⚠️ Push notification permission not granted");
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.error("❌ EAS Project ID not found in app.json");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId,
    });

    const token = tokenData.data;
    logger.log("🔔 Expo Push Token obtained");

    // Clear this token from any other user document (same device, different account).
    // Without this, old UIDs on the same device keep receiving notifications.
    const staleSnap = await getDocs(
      query(collection(db, "users"), where("pushToken", "==", token))
    );
    if (!staleSnap.empty) {
      const cleanupBatch = writeBatch(db);
      staleSnap.forEach((staleDoc) => {
        if (staleDoc.id !== userId) {
          console.log(`🧹 Removing stale push token from old user: ${staleDoc.id}`);
          cleanupBatch.update(staleDoc.ref, {
            pushToken: null,
            pushTokenUpdatedAt: new Date().toISOString(),
          });
        }
      });
      await cleanupBatch.commit();
    }

    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      pushToken: token,
      pushTokenUpdatedAt: new Date().toISOString(),
    });

    console.log("✅ Push token registered for user:", userId);
    return token;
  } catch (error) {
    console.error("❌ Error registering push token:", error);
    return null;
  }
};

/**
 * Remove the push token from a user's document. Call this on logout so that
 * notifications for this account stop arriving on a device that another user
 * may sign into next (prevents cross-account notification leakage).
 * @param {string} userId
 */
export const clearPushToken = async (userId) => {
  if (!userId) return;
  try {
    await updateDoc(doc(db, "users", userId), {
      pushToken: null,
      pushTokenUpdatedAt: new Date().toISOString(),
    });
    logger.log("🧹 Push token cleared on logout for:", userId);
  } catch (error) {
    console.error("❌ Error clearing push token:", error);
  }
};

// ============================================
// CONTADORES PARA BADGES
// ============================================

/**
 * Obtener contador de mensajes no leídos para un usuario
 */
export const getUnreadMessagesCount = async (userId) => {
  try {
    let totalUnread = 0;

    const eventsSnapshot = await getDocs(collection(db, "events"));

    for (const eventDoc of eventsSnapshot.docs) {
      const eventData = eventDoc.data();

      const isParticipant =
        getEventCreatorId(eventData) === userId ||
        isUserAttending(eventData.attendees, userId);

      if (!isParticipant) continue;

      const eventId = eventDoc.id;

      try {
        const messagesRef = collection(db, "events", eventId, "messages");
        const unreadQuery = query(messagesRef, where("read", "==", false));

        const unreadSnapshot = await getDocs(unreadQuery);

        unreadSnapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.senderId !== userId) {
            totalUnread++;
          }
        });
      } catch (err) {
        continue;
      }
    }

    return totalUnread;
  } catch (error) {
    console.error("❌ Error getting unread count:", error);
    return 0;
  }
};

/**
 * Suscribirse a cambios en mensajes no leídos (real-time)
 */
export const subscribeToUnreadCount = (userId, callback) => {
  const interval = setInterval(async () => {
    const count = await getUnreadMessagesCount(userId);
    callback(count);
  }, 10000);

  return () => clearInterval(interval);
};
