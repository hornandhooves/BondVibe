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
const nodemailer = require("nodemailer");

const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

const SENDER = "admin@kinlo.org"; // Workspace mailbox: SMTP login + From
const PAGE_BASE = "https://app.kinlo.org"; // our hosted action pages

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
  try {
    const link = await admin.auth().generatePasswordResetLink(email, {url: PAGE_BASE});
    const url = `${PAGE_BASE}/?mode=resetPassword&oobCode=${encodeURIComponent(oobCodeFrom(link))}`;
    await transporter().sendMail({
      from: `Kinlo <${SENDER}>`,
      to: email,
      subject: "Reset your password for Kinlo",
      html: shell("Reset your password", "Choose a new password for your Kinlo account. This link expires soon.", "Reset password", url),
    });
  } catch (e) {
    // auth/user-not-found is expected and swallowed (no account enumeration).
    if (e.code !== "auth/user-not-found") console.error("sendPasswordResetEmail:", e.message || e);
  }
  return {ok: true};
});
