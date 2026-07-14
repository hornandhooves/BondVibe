/**
 * Branded auth emails (verify / password reset).
 *
 * Firebase's built-in emails point their link at the default action handler
 * (<project>.firebaseapp.com/__/auth/action), and the Console silently refuses
 * to persist a custom action URL for this project. So instead we:
 *   1. generate the Firebase action link with the Admin SDK (gives us the oobCode),
 *   2. rewrite it to point at OUR hosted pages (app.kinlo.org, which route by
 *      ?mode= and call applyActionCode / confirmPasswordReset), and
 *   3. send a branded email via Gmail SMTP (Google Workspace, admin@kinlo.org).
 *
 * The client calls these callables instead of the firebase/auth SDK helpers.
 * SMTP auth uses the GMAIL_APP_PASSWORD secret (a Workspace app password).
 */
/* eslint-disable max-len -- inline email-HTML style attributes exceed 120 cols */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

const SENDER = "admin@kinlo.org"; // Workspace mailbox: SMTP login + From
const PAGE_BASE = "https://app.kinlo.org"; // our hosted action pages
const RESET_COOLDOWN_MS = 90 * 1000; // at most one reset email per address per 90s
const HOUR_MS = 60 * 60 * 1000;
const RESET_IP_MAX = 20; // max reset requests per client IP per hour
const RESET_GLOBAL_MAX = 300; // global backstop per hour (caps IP-rotation blast radius)

// A Firebase action link carries the oobCode; pull it out so we can point the
// email at OUR page instead of Firebase's default handler.
/**
 * Extract the oobCode from a Firebase action link.
 * @param {string} link Firebase action URL.
 * @return {string} the oobCode.
 */
function oobCodeFrom(link) {
  return new URL(link).searchParams.get("oobCode");
}

/**
 * Per-key cooldown backed by Firestore (mailThrottle/{key}, server-only).
 * @param {string} key throttle bucket (a hash — never raw PII).
 * @param {number} windowMs cooldown length in ms.
 * @return {Promise<boolean>} true if within the window (caller should skip).
 */
function throttled(key, windowMs) {
  const ref = admin.firestore().doc(`mailThrottle/${key}`);
  const now = Date.now();
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = (snap.exists && snap.data().lastMs) || 0;
    if (now - last < windowMs) return true;
    tx.set(ref, {lastMs: now, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return false;
  });
}

/**
 * Fixed-window rate limiter backed by Firestore (rateLimit/{key}, server-only).
 * @param {string} key bucket key (a hash, or a constant like "global_reset").
 * @param {number} limit max hits allowed per window.
 * @param {number} windowMs window length in ms.
 * @return {Promise<boolean>} true if over the limit (caller should skip).
 */
function overLimit(key, limit, windowMs) {
  const ref = admin.firestore().doc(`rateLimit/${key}`);
  const now = Date.now();
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = (snap.exists && snap.data()) || {};
    if (now - (d.windowStart || 0) >= windowMs) { // window elapsed → reset
      tx.set(ref, {windowStart: now, count: 1, updatedAt: FieldValue.serverTimestamp()});
      return false;
    }
    if ((d.count || 0) >= limit) return true;
    tx.set(ref, {count: (d.count || 0) + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return false;
  });
}

/**
 * Nodemailer transport over Gmail SMTP (Workspace app password).
 * @return {object} configured nodemailer transporter.
 */
function transporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {user: SENDER, pass: GMAIL_APP_PASSWORD.value()},
  });
}

// Minimal branded shell — inline styles only (email clients drop <style>/CSS files).
/**
 * Wrap copy + CTA in the branded email HTML shell.
 * @param {string} title heading.
 * @param {string} body paragraph copy.
 * @param {string} cta button label.
 * @param {string} url button href.
 * @return {string} full HTML document.
 */
function shell(title, body, cta, url) {
  return `<!doctype html><html><body style="margin:0;background:#F1F0F4;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
    <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:20px;padding:36px 32px;border:1px solid #ECE8F2">
      <tr><td align="center" style="font-size:28px;font-weight:800;color:#7C3AED;letter-spacing:-1px;padding-bottom:6px">Kinlo</td></tr>
      <tr><td align="center" style="font-size:20px;font-weight:800;color:#17161C;letter-spacing:-0.3px;padding:8px 0 12px">${title}</td></tr>
      <tr><td align="center" style="font-size:15px;color:#5B5766;line-height:22px;padding-bottom:24px">${body}</td></tr>
      <tr><td align="center"><a href="${url}" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:14px">${cta}</a></td></tr>
      <tr><td align="center" style="font-size:12px;color:#9A94A6;line-height:18px;padding-top:24px">If you didn't request this, you can safely ignore this email.<br>— The Kinlo team</td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
}

// Authenticated: the just-signed-in user asks us to (re)send their verification.
exports.sendVerificationEmail = onCall({secrets: [GMAIL_APP_PASSWORD]}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const user = await admin.auth().getUser(uid);
  if (!user.email) throw new HttpsError("failed-precondition", "No email on account.");
  if (user.emailVerified) return {ok: true, alreadyVerified: true};

  const link = await admin.auth().generateEmailVerificationLink(user.email, {url: PAGE_BASE});
  const url = `${PAGE_BASE}/?mode=verifyEmail&oobCode=${encodeURIComponent(oobCodeFrom(link))}`;
  await transporter().sendMail({
    from: `Kinlo <${SENDER}>`,
    to: user.email,
    subject: "Verify your email for Kinlo",
    html: shell("Verify your email", "Confirm your email address to start using Kinlo.", "Verify email", url),
  });
  return {ok: true};
});

// Unauthenticated (user forgot their password). Never reveal whether the account
// exists — always return ok. NOTE: this endpoint is open; add App Check or a
// per-email rate-limit before launch to prevent email-bombing.
exports.sendPasswordResetEmail = onCall({secrets: [GMAIL_APP_PASSWORD]}, async (request) => {
  const email = String((request.data && request.data.email) || "").trim().toLowerCase();
  if (!email) throw new HttpsError("invalid-argument", "Email is required.");

  // This endpoint is public (no auth, no App Check yet — App Check needs a native
  // client build). Three layers of rate-limiting stand in for that:
  //   1. per-email cooldown  — one reset per address per RESET_COOLDOWN_MS
  //   2. per-IP window       — caps how many addresses one client can bomb
  //   3. global window       — backstop against IP rotation / botnets
  const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

  if (await throttled("reset_" + sha(email).slice(0, 40), RESET_COOLDOWN_MS)) {
    console.log("sendPasswordResetEmail: throttled (email)");
    return {ok: true};
  }

  const req = request.rawRequest || {};
  const fwd = (req.headers && req.headers["x-forwarded-for"]) || "";
  const ip = String(fwd).split(",")[0].trim() || req.ip || "unknown";
  if (await overLimit("ip_" + sha(ip).slice(0, 32), RESET_IP_MAX, HOUR_MS)) {
    console.warn("sendPasswordResetEmail: rate-limited (ip)");
    return {ok: true};
  }
  if (await overLimit("global_reset", RESET_GLOBAL_MAX, HOUR_MS)) {
    console.warn("sendPasswordResetEmail: rate-limited (global backstop)");
    return {ok: true};
  }

  try {
    const link = await admin.auth().generatePasswordResetLink(email, {url: PAGE_BASE});
    const url = `${PAGE_BASE}/?mode=resetPassword&oobCode=${encodeURIComponent(oobCodeFrom(link))}`;
    await transporter().sendMail({
      from: `Kinlo <${SENDER}>`,
      to: email,
      subject: "Reset your password for Kinlo",
      html: shell("Reset your password", "Choose a new password for your Kinlo account. This link expires soon.", "Reset password", url),
    });
    console.log("sendPasswordResetEmail: sent");
  } catch (e) {
    // No such account — swallow either way (never reveal whether it exists).
    // The Admin SDK signals this as auth/user-not-found OR an internal assert
    // "Unable to create the email action link". Log both benignly so this
    // public endpoint's constant scanner probes don't spam error monitoring.
    // These logs are server-side only (never returned to the caller).
    const msg = (e && e.message) || String(e);
    if (e && (e.code === "auth/user-not-found" ||
        /unable to create the email action link/i.test(msg))) {
      console.log("sendPasswordResetEmail: no account");
    } else {
      console.error("sendPasswordResetEmail:", msg);
    }
  }
  return {ok: true};
});
