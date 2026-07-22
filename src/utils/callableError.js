/**
 * Map a Cloud Functions callable error to a friendly, localized message
 * (fix/post-deploy-closures). The functions throw HttpsError whose message is a
 * stable code string (e.g. "email_not_verified", "target_not_checked_in"); this
 * turns those into human copy instead of leaking the raw code to users.
 *
 * Usage:  Alert.alert(t("common.error"), friendlyCallableError(err, t));
 */
export const CALLABLE_ERROR_KEYS = {
  email_not_verified: "errors.emailNotVerified",
  target_not_checked_in: "errors.targetNotCheckedIn",
  not_checked_in: "errors.notCheckedIn",
  host_payouts_not_ready: "errors.hostPayoutsNotReady",
  business_owner_stripe_incomplete: "errors.hostPayoutsNotReady",
  too_many_attempts: "errors.tooManyAttempts",
  too_many_notifications: "errors.tooManyAttempts",
  carpool_full: "errors.carpoolFull",
  already_enrolled: "errors.alreadyEnrolled",
  slot_full: "errors.slotFull",
  dates_unavailable: "errors.datesUnavailable",
  not_a_participant: "errors.notAParticipant",
};

/**
 * @param {any} err the thrown error (Firebase HttpsError-ish)
 * @param {function} t i18next t()
 * @param {string} [fallbackKey] i18n key when no code matches
 * @returns {string} localized message
 */
export const friendlyCallableError = (err, t, fallbackKey = "errors.generic") => {
  const raw = `${(err && (err.message || err.code)) || ""}`;
  for (const [code, key] of Object.entries(CALLABLE_ERROR_KEYS)) {
    if (raw.includes(code)) return t(key);
  }
  return t(fallbackKey);
};
