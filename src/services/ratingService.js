import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { createNotification } from "../utils/notificationService";
import { isUserAttending, getEventCreatorId } from "../utils/eventHelpers";

/**
 * Convert rating number to stars string
 */
const getRatingStars = (rating) => {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
};

/**
 * Submit a rating for an event
 * @param {Object} ratingData - Rating data
 * @returns {Promise<Object>} - Result with success status
 */
export const submitRating = async (ratingData) => {
  try {
    const { eventId, eventTitle, hostId, rating, comment } = ratingData;
    const userId = auth.currentUser.uid;

    // Prevent host from rating their own event
    if (userId === hostId) {
      return {
        success: false,
        error: "You cannot rate your own event",
      };
    }

    // Check if user already rated this event
    const existingRating = await getUserRatingForEvent(eventId, userId);
    if (existingRating) {
      return {
        success: false,
        error: "You have already rated this event",
      };
    }

    // Get user data for the rating
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.data();
    const userName = userData?.fullName || userData?.name || "Someone";

    // Create the rating document
    const ratingDoc = {
      eventId,
      eventTitle,
      hostId,
      userId,
      userName,
      userAvatar: userData?.avatar || userData?.emoji || "😊",
      rating,
      comment: comment?.trim() || "",
      createdAt: serverTimestamp(),
    };

    // Add to ratings collection. The event's and host's average ratings are
    // recomputed server-side by the onRatingCreated Cloud Function so they
    // can't be manipulated by the host.
    const ratingRef = await addDoc(collection(db, "ratings"), ratingDoc);
    console.log("✅ Rating submitted:", ratingRef.id);

    // Send notification to host
    try {
      await createNotification(hostId, {
        type: "event_rating",
        title: "New Rating Received! ⭐",
        message: `${userName} rated "${eventTitle}" ${getRatingStars(rating)}`,
        icon: "⭐",
        metadata: {
          eventId,
          eventTitle,
          rating,
          ratingId: ratingRef.id,
        },
      });
      console.log("✅ Rating notification sent to host");
    } catch (notifError) {
      // Don't fail the rating if notification fails
      console.warn(
        "⚠️ Could not send rating notification:",
        notifError.message
      );
    }

    return { success: true, ratingId: ratingRef.id };
  } catch (error) {
    console.error("❌ Error submitting rating:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Check if user already rated an event
 * @param {string} eventId - Event ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} - Existing rating or null
 */
export const getUserRatingForEvent = async (eventId, userId = null) => {
  try {
    const uid = userId || auth.currentUser?.uid;
    if (!uid) return null;

    const ratingsQuery = query(
      collection(db, "ratings"),
      where("eventId", "==", eventId),
      where("userId", "==", uid)
    );

    const snapshot = await getDocs(ratingsQuery);
    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("❌ Error checking existing rating:", error);
    return null;
  }
};

/**
 * Get all ratings for an event
 * @param {string} eventId - Event ID
 * @returns {Promise<Array>} - Array of ratings
 */
export const getEventRatings = async (eventId) => {
  try {
    const ratingsQuery = query(
      collection(db, "ratings"),
      where("eventId", "==", eventId),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(ratingsQuery);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
    }));
  } catch (error) {
    console.error("❌ Error getting event ratings:", error);
    return [];
  }
};

/**
 * Get all ratings for a host
 * @param {string} hostId - Host user ID
 * @returns {Promise<Array>} - Array of ratings
 */
export const getHostRatings = async (hostId) => {
  try {
    const ratingsQuery = query(
      collection(db, "ratings"),
      where("hostId", "==", hostId),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(ratingsQuery);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
    }));
  } catch (error) {
    console.error("❌ Error getting host ratings:", error);
    return [];
  }
};

/**
 * Update event's average rating
 * @param {string} eventId - Event ID
 */
export const updateEventRating = async (eventId) => {
  try {
    const ratings = await getEventRatings(eventId);

    if (ratings.length === 0) return;

    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRating / ratings.length;

    await updateDoc(doc(db, "events", eventId), {
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      totalRatings: ratings.length,
    });

    console.log(
      `✅ Event ${eventId} rating updated: ${averageRating.toFixed(1)} (${
        ratings.length
      } ratings)`
    );
  } catch (error) {
    console.error("❌ Error updating event rating:", error);
  }
};

/**
 * Update host's average rating across all events
 * @param {string} hostId - Host user ID
 */
export const updateHostRating = async (hostId) => {
  try {
    const ratings = await getHostRatings(hostId);

    if (ratings.length === 0) return;

    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRating / ratings.length;

    // Count unique events hosted that have ratings
    const uniqueEvents = [...new Set(ratings.map((r) => r.eventId))];

    await updateDoc(doc(db, "users", hostId), {
      "hostStats.averageRating": Math.round(averageRating * 10) / 10,
      "hostStats.totalRatings": ratings.length,
      "hostStats.ratedEventsCount": uniqueEvents.length,
    });

    console.log(
      `✅ Host ${hostId} rating updated: ${averageRating.toFixed(1)} (${
        ratings.length
      } ratings)`
    );
  } catch (error) {
    console.error("❌ Error updating host rating:", error);
  }
};

/**
 * Get events that user attended but hasn't rated yet
 * @returns {Promise<Array>} - Array of unrated past events
 */
export const getPendingRatings = async () => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    // Get all events user attended
    const allEventsSnapshot = await getDocs(collection(db, "events"));
    const now = new Date();

    const attendedPastEvents = allEventsSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((event) => {
        // Check if user is an attendee (not creator)
        const isAttendee = isUserAttending(event.attendees, userId);
        const isNotCreator = getEventCreatorId(event) !== userId;

        // Check if event is in the past
        const eventDate = new Date(event.date);
        const isPast = eventDate < now;

        // Check if event is not cancelled
        const isActive = event.status !== "cancelled";

        return isAttendee && isNotCreator && isPast && isActive;
      });

    // Filter out events user has already rated
    const unratedEvents = [];
    for (const event of attendedPastEvents) {
      const existingRating = await getUserRatingForEvent(event.id, userId);
      if (!existingRating) {
        unratedEvents.push(event);
      }
    }

    // Sort by date (most recent first)
    unratedEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log(`📊 Found ${unratedEvents.length} events pending rating`);
    return unratedEvents;
  } catch (error) {
    console.error("❌ Error getting pending ratings:", error);
    return [];
  }
};

/**
 * Format rating as stars string
 * @param {number} rating - Rating value (1-5)
 * @returns {string} - Star string representation
 */
export const formatRatingStars = (rating) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    "★".repeat(fullStars) + (hasHalfStar ? "½" : "") + "☆".repeat(emptyStars)
  );
};
