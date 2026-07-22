/**
 * Community Matching — Cloud Functions (Kinlo Pro feature).
 *
 * - setMatchingConfig       host (Kinlo Pro) enables/updates matching + resolves the window
 * - advanceMatchingWindows  scheduled: enabled_locked→open at opensAt, open→closed at closesAt
 * - createLikeAndMaybeMatch  atomic like; enforces the per-event match cap unless Kinlo Plus;
 *                            forms a match (+chat) on a reciprocal like. Likes stay private.
 * - getHostMatchAnalytics    host-only aggregates; never exposes pairs or likes
 *
 * Required after admin.initializeApp() (see index.js), so admin.firestore() is ready.
 */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const {FieldValue, Timestamp} = require("firebase-admin/firestore");
const {sendBatchPushNotifications} = require("../notifications/pushService");
const {tPush, baseLang} = require("../i18n");
const {getEventCreatorId} = require("../utils/eventHelpers");

const db = admin.firestore();

const MATCH_TYPES = ["friend", "professional", "romantic"];
const OPENS_AT = ["now", "1h_before", "after_checkin", "after_event"];
const CLOSES_AFTER = ["24h", "3d", "1w", "forever"];
const MAX_MATCHES = [10, 20, 50, -1];

// Events store only a start time; assume this default duration to derive the end.
const DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000; // 3h
const H = 60 * 60 * 1000;
const CLOSE_MS = {"24h": 24 * H, "3d": 72 * H, "1w": 168 * H, "forever": null};

/**
 * Event start epoch ms from a Firestore Timestamp or ISO string.
 * @param {object} eventData the event document
 * @return {(number|null)} start time in ms, or null
 */
function eventStartMs(eventData) {
  const d = eventData.date;
  if (!d) return null;
  return d.toMillis ? d.toMillis() : new Date(d).getTime();
}

/**
 * Event end epoch ms — explicit endDate if present, else start + the host's
 * chosen durationMinutes, else start + the default duration.
 * @param {object} eventData the event document
 * @return {(number|null)} end time in ms, or null
 */
function eventEndMs(eventData) {
  const end = eventData.endDate;
  if (end) return end.toMillis ? end.toMillis() : new Date(end).getTime();
  const start = eventStartMs(eventData);
  if (!start) return null;
  const mins = Number(eventData.durationMinutes);
  return start + (mins > 0 ? mins * 60 * 1000 : DEFAULT_EVENT_DURATION_MS);
}

/**
 * Resolve opensAt/closesAt to absolute epoch ms from the host's choices.
 * @param {object} eventData the event document
 * @param {object} config { opensAt, closesAfter }
 * @return {{opensMs:number, closesMs:(number|null)}} resolved window
 */
function resolveMatchingWindow(eventData, config) {
  const start = eventStartMs(eventData);
  const end = eventEndMs(eventData);
  const now = Date.now();
  const opensBy = {
    "now": now,
    "1h_before": (start || now) - H,
    "after_checkin": start || now,
    "after_event": end || now,
  };
  const opensMs = Object.prototype.hasOwnProperty.call(opensBy, config.opensAt) ?
    opensBy[config.opensAt] : (end || now);
  const span = CLOSE_MS[config.closesAfter];
  const closesMs = span == null ? null : opensMs + span;
  return {opensMs, closesMs};
}

/**
 * Current window state from resolved millis.
 * @param {object} matching the event's matching block
 * @param {number} [now] epoch ms (defaults to Date.now())
 * @return {string} disabled | enabled_locked | open | closed
 */
function windowState(matching, now = Date.now()) {
  if (!matching || !matching.enabled) return "disabled";
  const opensMs = matching.opensAtResolved?.toMillis?.() ?? null;
  const closesMs = matching.closesAtResolved?.toMillis?.() ?? null;
  if (opensMs != null && now < opensMs) return "enabled_locked";
  if (closesMs != null && now >= closesMs) return "closed";
  return "open";
}

/**
 * Whether a user is the host (creator or co-host) of an event.
 * @param {object} eventData the event document
 * @param {string} uid user id
 * @return {boolean} true if host
 */
function isHost(eventData, uid) {
  return (
    getEventCreatorId(eventData) === uid ||
    (Array.isArray(eventData.coHosts) && eventData.coHosts.includes(uid))
  );
}

// ---------------------------------------------------------------------------
// setMatchingConfig — host (Kinlo Pro) enables/updates matching for an event.
// data: { eventId, config: { enabled, types[], opensAt, closesAfter,
//                            allowMessaging, maxMatches } }
// ---------------------------------------------------------------------------
const setMatchingConfig = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const {eventId, config} = request.data || {};
  if (!eventId || !config) {
    throw new HttpsError("invalid-argument", "Missing eventId or config.");
  }

  const eventRef = db.collection("events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  const eventData = eventSnap.data();
  if (!isHost(eventData, uid)) {
    throw new HttpsError("permission-denied", "Only the host can configure matching.");
  }

  // Kinlo Pro gate.
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists || userSnap.data().isPremium !== true) {
    throw new HttpsError("permission-denied", "pro_required");
  }

  // Validate.
  const enabled = config.enabled !== false;
  const types = Array.isArray(config.types) ?
    config.types.filter((t) => MATCH_TYPES.includes(t)) : [];
  if (enabled && types.length === 0) {
    throw new HttpsError("invalid-argument", "Pick at least one match type.");
  }
  const opensAt = OPENS_AT.includes(config.opensAt) ? config.opensAt : "after_event";
  const closesAfter = CLOSES_AFTER.includes(config.closesAfter) ?
    config.closesAfter : "1w";
  const maxMatches = MAX_MATCHES.includes(config.maxMatches) ? config.maxMatches : 20;
  const allowMessaging = config.allowMessaging !== false;

  const {opensMs, closesMs} = resolveMatchingWindow(eventData, {opensAt, closesAfter});

  const matching = {
    enabled,
    isProFeature: true,
    types,
    opensAt,
    opensAtResolved: Timestamp.fromMillis(opensMs),
    closesAfter,
    closesAtResolved: closesMs == null ? null : Timestamp.fromMillis(closesMs),
    allowMessaging,
    maxMatches,
  };
  matching.state = windowState(matching);

  await eventRef.set({matching}, {merge: true});
  return {success: true, matching: {...matching, opensAtResolved: opensMs, closesAtResolved: closesMs}};
});

// ---------------------------------------------------------------------------
// advanceMatchingWindows — scheduled: open when opensAt is reached (notify),
// close when closesAt passes. Covers openMatchingOnEventEnd + closeMatching.
// ---------------------------------------------------------------------------
const advanceMatchingWindows = onSchedule(
  {schedule: "every 30 minutes", timeZone: "America/Mexico_City"},
  async () => {
    const now = Date.now();
    const snap = await db
      .collection("events")
      .where("matching.enabled", "==", true)
      .get();
    let opened = 0;
    let closed = 0;
    for (const docSnap of snap.docs) {
      const e = docSnap.data();
      const m = e.matching || {};
      const desired = windowState(m, now);
      if (m.state === desired) continue;

      await docSnap.ref.update({"matching.state": desired});

      if (desired === "open" && m.state !== "open") {
        opened++;
        // Notify attendees who opted in (have a match profile).
        const profiles = await db
          .collection("matchProfiles")
          .doc(docSnap.id)
          .collection("attendees")
          .get();
        // BUG 34: recipient = each opted-in attendee. key+params; English
        // fallback from the catalog; push carries the recipient's own lang.
        const tk = "notifications.match.open.title";
        const bk = "notifications.match.open.body";
        const params = {event: e.title || "your event"};
        const pushes = [];
        for (const p of profiles.docs) {
          const targetUid = p.id;
          await db.collection("notifications").add({
            userId: targetUid,
            type: "matching_open",
            title: tPush(tk, "en", params),
            message: tPush(bk, "en", params),
            titleKey: tk,
            bodyKey: bk,
            params,
            icon: "🎉",
            read: false,
            createdAt: FieldValue.serverTimestamp(),
            metadata: {eventId: docSnap.id},
          });
          const u = await db.collection("users").doc(targetUid).get();
          if (u.exists && u.data().pushToken) {
            pushes.push({
              pushToken: u.data().pushToken,
              uid: targetUid,
              lang: baseLang(u.data().language), // reuse the loaded user doc
              titleKey: tk,
              bodyKey: bk,
              params,
              data: {type: "matching_open", eventId: docSnap.id},
            });
          }
        }
        if (pushes.length) await sendBatchPushNotifications(pushes);
      } else if (desired === "closed") {
        closed++;
      }
    }
    console.log(`💞 Matching windows: opened ${opened}, closed ${closed}`);
  },
);

// ---------------------------------------------------------------------------
// createLikeAndMaybeMatch — atomic like with the per-event match cap.
// data: { eventId, toUid }
// ---------------------------------------------------------------------------
const createLikeAndMaybeMatch = onCall(async (request) => {
  const from = request.auth?.uid;
  if (!from) throw new HttpsError("unauthenticated", "Sign in required.");
  const {eventId, toUid} = request.data || {};
  if (!eventId || !toUid) throw new HttpsError("invalid-argument", "Missing eventId/toUid.");
  if (toUid === from) throw new HttpsError("invalid-argument", "You can't like yourself.");

  const eventSnap = await db.collection("events").doc(eventId).get();
  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  const eventData = eventSnap.data();
  const m = eventData.matching || {};
  if (windowState(m) !== "open") {
    throw new HttpsError("failed-precondition", "matching_closed");
  }

  // Both people must have checked in to the event. SECURITY
  // (fix/security-functions-4a): only the CALLER's check-in was verified despite
  // the comment — so an attendee could like (and, on a reciprocal like, match +
  // open a chat with) someone who was never at the event, e.g. by liking an
  // uploaded/known uid. Require the TARGET's check-in too.
  const [meCheckedIn, targetCheckedIn] = await Promise.all([
    db.collection("events").doc(eventId).collection("checkins").doc(from).get(),
    db.collection("events").doc(eventId).collection("checkins").doc(toUid).get(),
  ]);
  if (!meCheckedIn.exists) {
    throw new HttpsError("failed-precondition", "not_checked_in");
  }
  if (!targetCheckedIn.exists) {
    throw new HttpsError("failed-precondition", "target_not_checked_in");
  }

  const maxMatches = typeof m.maxMatches === "number" ? m.maxMatches : 20;
  const allowMessaging = m.allowMessaging !== false;
  const types = Array.isArray(m.types) ? m.types : [];

  const likeRef = db.collection("likes").doc(eventId).collection("edges").doc(`${from}_${toUid}`);
  const reciprocalRef = db.collection("likes").doc(eventId).collection("edges").doc(`${toUid}_${from}`);
  const fromUserRef = db.collection("users").doc(from);
  const toUserRef = db.collection("users").doc(toUid);
  const matchId = [from, toUid].sort().join("_");
  const matchRef = db.collection("matches").doc(eventId).collection("pairs").doc(matchId);
  const chatRef = db.collection("matchChats").doc(matchId);

  const result = await db.runTransaction(async (tx) => {
    const [fromUserSnap, reciprocalSnap, existingLike] = await Promise.all([
      tx.get(fromUserRef),
      tx.get(reciprocalRef),
      tx.get(likeRef),
    ]);

    const fromUser = fromUserSnap.exists ? fromUserSnap.data() : {};
    const plan = fromUser.plan || "free";
    const currentCount = (fromUser.matchCountByEvent || {})[eventId] || 0;
    const unlimited = maxMatches === -1 || plan === "kinlo_plus";

    // Cap: at max matches, a free attendee can't like anyone new → paywall (C4).
    if (!unlimited && currentCount >= maxMatches) {
      return {matched: false, capReached: true, matchCount: currentCount, maxMatches};
    }

    // Record the (private) like idempotently.
    if (!existingLike.exists) {
      tx.set(likeRef, {from, to: toUid, createdAt: FieldValue.serverTimestamp()});
    }

    // Reciprocal like already present → it's a match.
    if (reciprocalSnap.exists) {
      const users = [from, toUid].sort();
      tx.set(matchRef, {
        users, eventId, types,
        createdAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(chatRef, {
        users, eventId, allowMessaging,
        createdAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(fromUserRef, {matchCountByEvent: {[eventId]: FieldValue.increment(1)}}, {merge: true});
      tx.set(toUserRef, {matchCountByEvent: {[eventId]: FieldValue.increment(1)}}, {merge: true});
      return {matched: true, matchId, allowMessaging};
    }

    return {matched: false};
  });

  // Notify BOTH matched users (outside the transaction). BUG 34: each push entry
  // carries its OWN recipient uid + lang, read from that user's already-fetched
  // doc (no double read) — a mixed-language pair gets each their own language.
  if (result.matched) {
    const tk = "notifications.match.new.title";
    const bk = "notifications.match.new.body";
    const params = {};
    const recipients = [toUid, from];
    for (const ruid of recipients) {
      await db.collection("notifications").add({
        userId: ruid,
        type: "new_match",
        title: tPush(tk, "en", params),
        message: tPush(bk, "en", params),
        titleKey: tk,
        bodyKey: bk,
        params,
        icon: "💜",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        metadata: {eventId, matchId},
      });
    }
    // Push ONLY to the passive recipient (toUid). The actor (from) just tapped
    // like and their client surfaces the match synchronously (result.matched),
    // so a push to them is redundant. Both still get the in-app doc above.
    const toDoc = await toUserRef.get();
    if (toDoc.exists && toDoc.data().pushToken) {
      await sendBatchPushNotifications([{
        pushToken: toDoc.data().pushToken,
        uid: toUid,
        lang: baseLang(toDoc.data().language),
        titleKey: tk,
        bodyKey: bk,
        params,
        data: {type: "new_match", eventId, matchId},
      }]);
    }
  }
  return result;
});

// ---------------------------------------------------------------------------
// getHostMatchAnalytics — host-only aggregates. Never exposes pairs or likes.
// data: { eventId }
// ---------------------------------------------------------------------------
const getHostMatchAnalytics = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const {eventId} = request.data || {};
  if (!eventId) throw new HttpsError("invalid-argument", "Missing eventId.");

  const eventSnap = await db.collection("events").doc(eventId).get();
  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");
  if (!isHost(eventSnap.data(), uid)) {
    throw new HttpsError("permission-denied", "Host only.");
  }

  const [profilesSnap, pairsSnap] = await Promise.all([
    db.collection("matchProfiles").doc(eventId).collection("attendees").get(),
    db.collection("matches").doc(eventId).collection("pairs").get(),
  ]);

  // "Attendees on Kinlo Plus" — count only, no identities.
  let plusUpgrades = 0;
  for (const p of profilesSnap.docs) {
    const u = await db.collection("users").doc(p.id).get();
    if (u.exists && u.data().plan === "kinlo_plus") plusUpgrades++;
  }

  return {
    participants: profilesSnap.size,
    matches: pairsSnap.size,
    conversations: pairsSnap.size, // pair = a chat exists (approx)
    plusUpgrades,
  };
});

module.exports = {
  setMatchingConfig,
  advanceMatchingWindows,
  createLikeAndMaybeMatch,
  getHostMatchAnalytics,
  // exported pure helpers (unit-testable)
  resolveMatchingWindow,
  windowState,
};
