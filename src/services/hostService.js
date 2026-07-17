import { getFunctions, httpsCallable } from "firebase/functions";

/**
 * Host activation — server-side only.
 *
 * `role` is no longer writable by the client (firestore.rules), because the
 * unified gate trusts `role === 'host'`: while the owner could set it, "approved
 * host" was whatever a modified client claimed. These callables run with the
 * Admin SDK, so the grant happens where it can be enforced.
 *
 * They're thin on purpose — the decisions (who may host, what stays locked)
 * belong on the server, not here.
 */

/**
 * Turn hosting on for the signed-in user.
 *
 * Free is instant. Paid also activates hosting immediately — free events work
 * right away — but never unlocks charging: that waits on Stripe reporting the
 * account charge-enabled.
 *
 * @param {"free"|"paid"} type
 * @returns {Promise<{ok: boolean, type: string}>}
 * @throws the callable's HttpsError (unauthenticated / invalid-argument /
 *   permission-denied for suspended accounts) — callers surface the message.
 */
export async function activateHost(type) {
  const call = httpsCallable(getFunctions(), "activateHost");
  const res = await call({ type });
  return res.data;
}

/**
 * Step back before hosting starts ("decide later"): back to a plain user, with
 * the choice marked deferred so the router stops asking on every login.
 * @returns {Promise<{ok: boolean}>}
 */
export async function deferHostType() {
  const call = httpsCallable(getFunctions(), "deferHostType");
  const res = await call({});
  return res.data;
}
