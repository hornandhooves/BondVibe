/**
 * KIN-117 QA fix #3 — single source of truth for the report reason KEYS.
 * ReportScreen, ModerationReportsScreen, and ModerationReportDetailScreen all
 * need the exact same list to decide whether a stored `reason` is a known
 * i18n key (translate it) or free prose (show as-is — historical docs and
 * user_block's host-typed reason).
 *
 * Deliberately membership-based (REPORT_REASON_KEYS.includes(reason)), NOT
 * `t(key) === key`: i18next's default nsSeparator is ":", so free prose that
 * happens to contain a colon (e.g. a user_block reason like "asked them to
 * stop: they kept messaging") gets split by t() and compared against a
 * fragment, not the original string — a false "yes this translates" that
 * silently truncates the reason shown to the admin.
 */
export const REPORT_REASON_KEYS = [
  'inappropriateContent',
  'harassmentOrBullying',
  'spamOrScam',
  'safetyConcern',
  'fakeProfile',
  'offensiveBehavior',
  'other',
];

/**
 * Resolve a stored reports.reason for display: translate it if it's a known
 * key, otherwise show it as-is (free prose / a historical doc / user_block).
 * @param {(key: string, params?: object) => string} t react-i18next's t
 * @param {string} reason the stored reason value
 * @return {string} display text
 */
export const resolveReasonText = (t, reason) =>
  (REPORT_REASON_KEYS.includes(reason) ? t(`report.reasons.${reason}`) : reason);
