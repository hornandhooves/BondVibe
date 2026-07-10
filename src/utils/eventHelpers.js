/**
 * Helpers for working with event data consistently.
 *
 * The canonical format for `attendees` is an array of user-id strings.
 * Some legacy documents stored attendees as objects ({ userId, ... }),
 * so these helpers normalize both shapes into plain UID strings. New code
 * should always rely on these helpers instead of reading attendees inline.
 */

/**
 * Extract a user id from an attendee entry (string UID or legacy object).
 * @param {string|object} attendee
 * @returns {string|null}
 */
export const getAttendeeId = (attendee) => {
  if (!attendee) return null;
  if (typeof attendee === "string") return attendee;
  if (typeof attendee === "object" && attendee.userId) return attendee.userId;
  return null;
};

/**
 * Normalize an attendees array into a list of UID strings.
 * @param {Array} attendees
 * @returns {string[]}
 */
export const getAttendeeIds = (attendees) => {
  if (!Array.isArray(attendees)) return [];
  return attendees.map(getAttendeeId).filter(Boolean);
};

/**
 * Whether a given user is attending (works with both formats).
 * @param {Array} attendees
 * @param {string} userId
 * @returns {boolean}
 */
export const isUserAttending = (attendees, userId) => {
  if (!userId) return false;
  return getAttendeeIds(attendees).includes(userId);
};

/**
 * Canonical event creator id. Events historically used creatorId, createdBy,
 * and hostId interchangeably — this resolves them in priority order.
 * @param {object} eventData
 * @returns {string|undefined}
 */
export const getEventCreatorId = (eventData) => {
  if (!eventData) return undefined;
  return eventData.creatorId || eventData.createdBy || eventData.hostId;
};

/**
 * Who receives the Stripe payout (BUG 32.6). Prefer the explicit
 * `businessOwnerUid` (staff create inside the owner's business → owner is paid),
 * else the creator. Keeps createdBy/creatorId honest.
 * @param {object} data
 * @returns {string|undefined}
 */
export const getHostIdForPayout = (data) => {
  if (!data) return undefined;
  return data.businessOwnerUid || getEventCreatorId(data);
};
