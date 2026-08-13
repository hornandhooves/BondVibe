/**
 * KIN-221 — a place for client-side failures to land.
 *
 * The bug this exists for: getFeaturedEventsNearby caught its own errors,
 * console.error'd them and returned []. On a phone that log goes nowhere — not
 * to Cloud Logging, not to anyone. A $99 promotion (pi_3U3TqARZsYFCeXAc0BxkLiX7)
 * was invisible for days and the only reason we found out is that a human
 * noticed. There was no signal to notice with.
 *
 * Deliberately NOT Sentry: it isn't installed (`sentry-expo` survives only as a
 * string in jest.config.js's transformIgnorePatterns), and adding a third-party
 * SDK to send our own errors to our own project is more moving parts than this
 * needs. Structured logging into the project we already run is enough to query,
 * alert on, and correlate with the server-side logs already there.
 *
 * Best-effort by design: this endpoint answers 200 unless it genuinely cannot
 * log. Telemetry that fails loudly turns one bug into two, and the caller is a
 * catch block that is already having a bad time.
 */
const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {verifyBearer} = require("./lib/auth");
const {overLimit} = require("./lib/rateLimit");

/** Truncation caps — a runaway payload must not inflate Cloud Logging. */
const MAX_STACK = 4000;
const MAX_META = 2000;
/** 30 reports per user per hour: enough for a burst, not enough to be a firehose. */
const RL_MAX = 30;
const RL_WINDOW_MS = 60 * 60 * 1000;

const clip = (s, n) => (typeof s === "string" && s.length > n ? s.slice(0, n) : s);

exports.reportClientError = onRequest({cors: true}, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({error: "Method not allowed"});
  }
  try {
    // AUTH: identity comes from the verified token, never from the body — a
    // uid a client can name is a uid a client can forge.
    const caller = await verifyBearer(req);
    if (!caller) {
      return res.status(401).json({error: "unauthenticated"});
    }
    // Deliberately NOT gated on email_verified: an unverified account still
    // hits real bugs, and its reports are the ones we'd miss most.

    if (await overLimit("clienterr_" + caller.uid, RL_MAX, RL_WINDOW_MS)) {
      return res.status(429).json({error: "rate_limited"});
    }

    const {surface, message, stack, meta} = req.body || {};
    if (!surface || !message) {
      return res.status(400).json({error: "Missing required fields"});
    }

    let metaStr = null;
    if (meta !== undefined && meta !== null) {
      try {
        metaStr = clip(JSON.stringify(meta), MAX_META);
      } catch (e) {
        metaStr = "[unserializable]"; // a circular meta must not lose the report
      }
    }

    logger.error("[clientError]", {
      uid: caller.uid,
      surface: clip(String(surface), 200),
      message: clip(String(message), 1000),
      stack: clip(stack, MAX_STACK) || null,
      meta: metaStr,
      platform: req.body.platform || null,
    });

    return res.status(200).json({ok: true});
  } catch (e) {
    // Only reached if logging itself broke. Say so, but don't pretend the
    // client can do anything useful about it.
    logger.error("[clientError] failed to record a client error", e);
    return res.status(500).json({error: "internal"});
  }
});
