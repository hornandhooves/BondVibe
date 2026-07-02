// Date formatting utilities for Kinlo

/**
 * Format ISO date string to readable format
 * Handles multiple date formats including partial ISO strings
 * @param {string} isoDate - ISO date string
 * @returns {string} Formatted date like "Nov 29, 2025"
 */
export const formatISODate = (isoDate) => {
  if (!isoDate) return "TBD";

  try {
    // Handle different date formats
    let date;

    // If it's already a Date object
    if (isoDate instanceof Date) {
      date = isoDate;
    } else {
      // Convert string to Date
      // This handles: "2025-11-29T03:00:00.000Z", "2025-11-29T03:00:00", "2025-11-29", etc.
      date = new Date(isoDate);
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn("Invalid date format:", isoDate);
      return "TBD";
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "TBD";
  }
};

/**
 * Format time from event data
 * @param {string|Date} date - The date object or ISO string
 * @param {string} time - Optional time string
 * @returns {string} Formatted time string like "3:00 AM"
 */
export const formatEventTime = (date, time = null) => {
  // If explicit time is provided, return it
  if (time) return time;

  // Otherwise extract from date
  if (!date) return "";

  try {
    let eventDate;

    // If it's already a Date object
    if (date instanceof Date) {
      eventDate = date;
    } else {
      // Convert string to Date
      eventDate = new Date(date);
    }

    // Check if date is valid
    if (isNaN(eventDate.getTime())) {
      console.warn("Invalid date for time formatting:", date);
      return "";
    }

    return eventDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch (error) {
    console.error("Error formatting time:", error);
    return "";
  }
};
