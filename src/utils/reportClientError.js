/**
 * KIN-221 — send a client-side failure somewhere a human can actually see it.
 *
 * A `console.error` on a phone reaches nobody: not Cloud Logging, not a
 * dashboard, not us. That's why a paid promotion
 * (pi_3U3TqARZsYFCeXAc0BxkLiX7) sat invisible for days — the query was failing
 * silently and there was no signal to notice.
 *
 * Fire-and-forget on purpose, and swallowing on purpose: telemetry must never
 * become a second error on top of the one being reported. Every failure path
 * here — no user, no network, a 500 from the endpoint — ends in the same
 * silence, because the caller is a catch block that already has a problem.
 *
 * Signed-in only. Without a token the endpoint can't attribute the report, and
 * an unauthenticated write endpoint is a spam target.
 */
import { Platform } from "react-native";

const FUNCTIONS_BASE_URL = "https://us-central1-kinlo-app-dev.cloudfunctions.net";

/**
 * @param {string} surface where it broke, e.g. "promotionService.getFeaturedEventsNearby"
 * @param {Error|*} error the thrown value (not assumed to be an Error)
 * @param {object} [meta] anything else worth having in the log — NEVER secrets,
 *   tokens or PII; this is written to Cloud Logging verbatim
 * @returns {Promise<void>} always resolves
 */
export async function reportClientError(surface, error, meta = {}) {
  try {
    // Required lazily, NOT imported at the top. useAsyncLoad imports this
    // module, and a static import made every one of its 35 call sites
    // initialize Firebase at load time — which broke two test suites that
    // legitimately never touch it. Telemetry must not drag the auth stack into
    // modules that only wanted a loading flag.
    const { auth } = require("../services/firebase");
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    if (!token) return;
    await fetch(`${FUNCTIONS_BASE_URL}/reportClientError`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        surface,
        message: error?.message || String(error),
        stack: error?.stack || null,
        meta,
        platform: Platform.OS,
      }),
    });
  } catch (_) {
    // Deliberately empty: see the header. Reporting must not throw.
  }
}

export default reportClientError;
