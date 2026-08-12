/**
 * Event Date Filtering Utilities
 * Helper functions to filter events by date (past, today, upcoming)
 */

/** Fallback length for an event with no durationMinutes, in minutes.
 *  Matches functions/stripe/escrow.js so client and server agree on when an
 *  event is over — that value is what the payout schedule is built on. */
export const DEFAULT_DURATION_MIN = 180;

/**
 * Has the event FINISHED?
 *
 * This used to compare calendar days, which meant an event that ended at 11am
 * stayed "upcoming" until midnight — for up to thirteen more hours it kept
 * showing in discovery as if you could still attend (KIN-158). Now it is
 * start + duration, the same formula the server uses for escrow release.
 *
 * Accepts the whole event OR just its date string. The string form is kept so
 * existing callers don't break, but it CANNOT know the duration and falls back
 * to 180 minutes — pass the event object wherever the real length matters.
 *
 * Deliberately about time only. A cancelled event is not "past" (a cancelled
 * event next week has not happened yet, and MyEventsScreen would wrongly file
 * it under Past); hiding it from discovery is isEventDiscoverable's job.
 *
 * @param {object|string} eventOrDate the event doc, or its ISO date string
 * @returns {boolean} true once the event's end time has passed
 */
export const isEventPast = (eventOrDate) => {
  const event = typeof eventOrDate === "string" ? { date: eventOrDate } : eventOrDate || {};
  const start = new Date(event.date).getTime();
  // An unparseable date is not evidence the event is over — leave it visible
  // rather than silently hiding it.
  if (!Number.isFinite(start)) return false;
  const durationMin = Number(event.durationMinutes) || DEFAULT_DURATION_MIN;
  return start + durationMin * 60000 < Date.now();
};

/**
 * Should this event appear in a discovery surface (search, rows, featured)?
 *
 * Two separate reasons to hide it, kept together here so every surface applies
 * the same rule: it has finished, or it was called off. Cancellation lives in
 * THIS helper and not in isEventPast because "past" and "not worth showing" are
 * different questions — MyEventsScreen needs the first, discovery needs both.
 *
 * @param {object} event the event doc
 * @returns {boolean}
 */
export const isEventDiscoverable = (event) =>
  !!event && event.status !== "cancelled" && !isEventPast(event);

/**
 * Drop finished and cancelled events from a discovery list.
 * @param {Array} events events to filter
 * @returns {Array}
 */
export const filterDiscoverableEvents = (events) =>
  (Array.isArray(events) ? events : []).filter(isEventDiscoverable);

/**
 * Check if an event date is today
 * @param {string} eventDate - ISO date string
 * @returns {boolean}
 */
export const isEventToday = (eventDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const event = new Date(eventDate);
  event.setHours(0, 0, 0, 0);

  return event.getTime() === today.getTime();
};

/**
 * Check if an event date is upcoming (today or future)
 * @param {string} eventDate - ISO date string
 * @returns {boolean}
 */
export const isEventUpcoming = (eventDate) => {
  return !isEventPast(eventDate);
};

/**
 * Filter events array to only include upcoming events
 * @param {Array} events - Array of event objects
 * @returns {Array}
 */
export const filterUpcomingEvents = (events) => {
  // The whole event, not event.date: the string form can't see durationMinutes.
  return events.filter((event) => !isEventPast(event));
};

/**
 * Filter events array to only include past events
 * @param {Array} events - Array of event objects
 * @returns {Array}
 */
export const filterPastEvents = (events) => {
  return events.filter((event) => isEventPast(event));
};

/**
 * Sort events by date (ascending - soonest first)
 * @param {Array} events - Array of event objects
 * @returns {Array}
 */
export const sortEventsByDate = (events) => {
  return [...events].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateA - dateB;
  });
};
