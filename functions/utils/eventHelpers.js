/**
 * Server-side helpers for working with event data consistently.
 *
 * The canonical format for `attendees` is an array of user-id strings.
 * Some legacy documents stored attendees as objects ({ userId, ... }),
 * so these helpers normalize both shapes into plain UID strings.
 */

/**
 * Extract a user id from an attendee entry (string UID or legacy object).
 * @param {string|object} attendee
 * @return {string|null}
 */
function getAttendeeId(attendee) {
  if (!attendee) return null;
  if (typeof attendee === "string") return attendee;
  if (typeof attendee === "object" && attendee.userId) return attendee.userId;
  return null;
}

/**
 * Normalize an attendees array into a list of UID strings.
 * @param {Array} attendees
 * @return {Array<string>}
 */
function getAttendeeIds(attendees) {
  if (!Array.isArray(attendees)) return [];
  return attendees.map(getAttendeeId).filter(Boolean);
}

/**
 * Whether a given user is attending (works with both formats).
 * @param {Array} attendees
 * @param {string} userId
 * @return {boolean}
 */
function isUserAttending(attendees, userId) {
  if (!userId) return false;
  return getAttendeeIds(attendees).includes(userId);
}

/**
 * Canonical event creator id.
 * @param {object} eventData
 * @return {string|undefined}
 */
function getEventCreatorId(eventData) {
  if (!eventData) return undefined;
  return eventData.creatorId || eventData.createdBy || eventData.hostId;
}

/**
 * Who receives the Stripe payout (BUG 32.6). Staff create events/classes inside
 * the owner's business, so the money must go to the business OWNER — not the
 * staff creator (who has no Stripe account). Prefer the explicit
 * `businessOwnerUid` stamped at create; otherwise fall back to the creator.
 * Keeps `createdBy`/`creatorId` honest (authorship, agenda, CRM).
 * @param {object} data event/class/membership/rental doc
 * @return {string|undefined}
 */
function getHostIdForPayout(data) {
  if (!data) return undefined;
  return data.businessOwnerUid || getEventCreatorId(data);
}

module.exports = {
  getAttendeeId,
  getAttendeeIds,
  isUserAttending,
  getEventCreatorId,
  getHostIdForPayout,
};
