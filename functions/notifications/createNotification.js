/**
 * createNotification — the shared write-a-doc + send-a-push helper (KIN-244).
 *
 * Today every notification emitter in this codebase writes to `notifications`
 * and, SEPARATELY and by hand, calls `sendPushNotification`. 45 call sites
 * across 12 files do this. When someone forgets the second call, the
 * notification exists in the app and never reaches the phone — no error, no
 * signal anything is wrong. That's the bug this closes, one caller at a time.
 * This ticket migrates ONLY the staff lifecycle (invite/accept/decline/remove);
 * the other 41 call sites are migrated later, unchanged, out of scope here.
 *
 * A Firestore trigger on `notifications` was explicitly considered and
 * rejected: it can't be half-turned-on for a partial migration, it would
 * break batch sends (sendBatchPushNotifications), and it would lose the push
 * `data` deep-link payload that only the ORIGINAL caller knows how to build.
 *
 * LANGUAGE (KIN-244, a real verified defect): `notifyInvite` built its
 * denormalized `title`/`message` with `tPush(key, "en", params)` — a literal
 * "en", not the recipient's language. The stored `titleKey`/`bodyKey`/`params`
 * let the in-app list re-render correctly regardless, but the frozen `title`/
 * `message` strings (and any push built from them) were always English. This
 * helper resolves the recipient's language from `users/{userId}.language`
 * (the same field `functions/i18n`'s `getUserLang` already reads) and uses it
 * for BOTH the stored strings and the push — no field defaults to "en" except
 * as the documented last-resort when a user has no language on file.
 */
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const {tPush, baseLang} = require("../i18n");
const {sendPushNotification} = require("./pushService");

/**
 * Write a `notifications` doc and (best-effort) send its push, in one call.
 *
 * @param {object} args
 * @param {string} args.userId recipient uid — required.
 * @param {string} args.type the notification's `type` field, e.g. "staff_removed".
 * @param {string} args.titleKey i18n key resolved via tPush for `title`.
 * @param {string} args.bodyKey i18n key resolved via tPush for `message`.
 * @param {object} [args.params] interpolation params for both keys.
 * @param {object} [args.metadata] stored on the doc; also the DEFAULT source
 *   for the push `data` payload (see `data` below).
 * @param {object} [args.data] explicit push `data` deep-link payload. Deviation
 *   from the proposed signature (see functions/README or the PR description):
 *   defaults to `{...metadata, type, notificationId}` when omitted, so the
 *   deep link can never be silently dropped — a caller only needs to pass this
 *   when the push payload must differ from what's stored in `metadata`.
 * @param {string} [args.icon="bell"] the doc's `icon` field. Deviation: the
 *   proposed signature didn't list it, but every existing emitter (incl. the
 *   one cited as the reference shape, notifyInvite) writes one — omitting it
 *   would silently change the doc shape the ticket says to preserve.
 * @param {string} [args.locale] explicit recipient language override. When
 *   omitted, resolved from `users/{userId}.language` (same source as
 *   `functions/i18n`'s `getUserLang`), defaulting to "en" only if the user has
 *   no language on file — documented, not silently embedded.
 * @param {boolean} [args.push=true] whether to also attempt a push.
 * @param {string} [args.actorUid] deviation: optional. When `actorUid ===
 *   userId`, this is a no-op (writes nothing, sends nothing) — "nadie se
 *   autonotifica" is the transversal rule for all 4 staff transitions in
 *   KIN-244/245/246, and centralizing the check here means a future caller
 *   can't forget it. Omit this when the caller has no reliable actor identity
 *   (e.g. a Firestore trigger with no request.auth) — see onStaffWritten's
 *   removal notification, which can't populate it and says so in its comment.
 * @return {Promise<object>} `{id, pushed}`, or `{id: null, pushed: false,
 *   skipped: "self"}` when actorUid === userId.
 */
async function createNotification({
  userId,
  type,
  titleKey,
  bodyKey,
  params = {},
  metadata = {},
  data,
  icon = "bell",
  locale,
  push = true,
  actorUid,
}) {
  if (!userId) throw new Error("createNotification: userId is required");
  if (!type) throw new Error("createNotification: type is required");
  if (!titleKey || !bodyKey) {
    throw new Error("createNotification: titleKey and bodyKey are required");
  }
  if (actorUid && actorUid === userId) {
    return {id: null, pushed: false, skipped: "self"};
  }

  const db = admin.firestore();

  // One read serves both needs: the recipient's language (unless the caller
  // already gave one) and their pushToken (only fetched when push is on).
  let resolvedLocale = locale ? baseLang(locale) : null;
  let pushToken = null;
  if (!resolvedLocale || push) {
    try {
      const uSnap = await db.collection("users").doc(userId).get();
      const u = uSnap.exists ? uSnap.data() : null;
      if (!resolvedLocale) resolvedLocale = baseLang(u && u.language);
      if (push) pushToken = (u && u.pushToken) || null;
    } catch (e) {
      console.error(`createNotification: could not read users/${userId}:`, e?.message || e);
    }
  }
  resolvedLocale = resolvedLocale || "en";

  const title = tPush(titleKey, resolvedLocale, params);
  const message = tPush(bodyKey, resolvedLocale, params);

  const ref = db.collection("notifications").doc();
  await ref.set({
    userId,
    type,
    title,
    message,
    titleKey,
    bodyKey,
    params,
    icon,
    read: false,
    resolved: false,
    createdAt: FieldValue.serverTimestamp(),
    metadata,
  });

  let pushed = false;
  if (push) {
    if (!pushToken) {
      console.log(`createNotification: no pushToken for ${userId} — doc ${ref.id} written, push skipped`);
    } else {
      try {
        const result = await sendPushNotification(pushToken, {
          uid: userId,
          lang: resolvedLocale,
          titleKey,
          bodyKey,
          params,
          data: data || {...metadata, type, notificationId: ref.id},
        });
        // sendPushNotification never throws (it catches internally and
        // returns {success:false, error}) — the doc above is already written
        // either way, but this keeps the return value honest.
        pushed = !!result?.success;
      } catch (e) {
        console.error(`createNotification: push threw for ${userId}, doc ${ref.id} still written:`, e?.message || e);
      }
    }
  }

  return {id: ref.id, pushed};
}

module.exports = {createNotification};
