/**
 * Kinlo for Business — Lifecycle Automations engine (kinlo_business/04).
 * One rule model for all channels: trigger → audience → message → channel(auto).
 * The engine resolves the best available channel per member and logs delivery.
 *
 * Channels: Push + In-app are live (existing infra). SMS (Twilio, model 1) and
 * Email are wired but INERT until credentials are configured — see sendSms /
 * sendEmail. Never sent from the client; all sends go through here (server).
 *
 * Consent (LFPDPPP): SMS only to members with smsConsent.granted === true;
 * inbound STOP flips it off (twilioWebhook). A per-business monthly SMS quota
 * keeps cost predictable.
 */
/* eslint-disable require-jsdoc, valid-jsdoc */
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const {HttpsError} = require("firebase-functions/v2/https");
const twilio = require("twilio");
const {sendPushNotification} = require("../notifications/pushService");
const {tPush, baseLang} = require("../i18n");

const db = () => admin.firestore();
const SMS_MONTHLY_QUOTA = 200;

// ── Channel senders ──────────────────────────────────────────────────────────

/** Send an SMS via Twilio (model 1). Inert until TWILIO_* env is bound. */
async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const mg = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || !mg || !to) {
    return {status: "skipped", reason: "sms_not_configured"};
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const params = new URLSearchParams({
      MessagingServiceSid: mg, To: to, Body: body,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString()});
    if (res.ok) return {status: "sent"};
    return {status: "failed", reason: `twilio_${res.status}`};
  } catch (e) {
    return {status: "failed", reason: String(e.message || e).slice(0, 60)};
  }
}

// WhatsApp "From" (e.g. "whatsapp:+14155238886" sandbox -> your prod sender),
// kept in settings/notifConfig so it swaps sandbox->prod with no redeploy.
let _waFrom;
async function getWaFrom() {
  if (_waFrom !== undefined) return _waFrom;
  try {
    const s = await db().collection("settings").doc("notifConfig").get();
    _waFrom = s.exists && s.data().whatsappFrom ? s.data().whatsappFrom : null;
  } catch (e) {
    _waFrom = null;
  }
  return _waFrom;
}

/**
 * Send a WhatsApp message via Twilio, reusing the SMS TWILIO_* creds. Inert
 * until TWILIO_* are bound AND settings/notifConfig.whatsappFrom is set. v1
 * sends free-form Body (fine in the sandbox and inside the 24h session window);
 * production business-initiated messages need approved templates (ContentSid).
 */
async function sendWhatsApp(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = await getWaFrom();
  if (!sid || !token || !from || !to) {
    return {status: "skipped", reason: "whatsapp_not_configured"};
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const params = new URLSearchParams({
      From: from, To: `whatsapp:${to}`, Body: body,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString()});
    if (res.ok) return {status: "sent"};
    return {status: "failed", reason: `twilio_${res.status}`};
  } catch (e) {
    return {status: "failed", reason: String(e.message || e).slice(0, 60)};
  }
}

/** Send an email. Inert until an email provider key is configured. */
async function sendEmail() {
  return {status: "skipped", reason: "email_not_configured"};
}

async function sendPush(linkedUid, title, body) {
  if (!linkedUid) return {status: "skipped", reason: "no_account"};
  const u = await db().collection("users").doc(linkedUid).get();
  const token = u.exists ? u.data().pushToken : null;
  if (!token) return {status: "skipped", reason: "no_push_token"};
  try {
    await sendPushNotification(token, {title, body, data: {type: "business"}});
    return {status: "sent"};
  } catch (e) {
    return {status: "failed", reason: "push_error"};
  }
}

async function sendInApp(linkedUid, hostName, body) {
  if (!linkedUid) return {status: "skipped", reason: "no_account"};
  await db().collection("notifications").add({
    userId: linkedUid,
    type: "business_message",
    title: hostName || "Kinlo",
    message: body,
    icon: "bell",
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return {status: "sent"};
}

// ── Core ─────────────────────────────────────────────────────────────────────

/** Members matching an audience descriptor. */
async function resolveAudience(bizId, audience = {}) {
  const snap = await db().collection("businesses").doc(bizId)
    .collection("members").limit(2000).get();
  let members = snap.docs.map((d) => ({id: d.id, ...d.data()}));
  const type = audience.type || "all";
  if (type === "member") {
    members = members.filter((m) => m.id === audience.value);
  } else if (type === "active") {
    members = members.filter((m) => (m.status || "active") === "active");
  } else if (type === "at_risk") {
    members = members.filter((m) => m.status === "at_risk");
  } else if (type === "inactive") {
    members = members.filter((m) => m.status === "inactive");
  } else if (type === "tag") {
    members = members.filter((m) =>
      Array.isArray(m.tags) && m.tags.includes(audience.value));
  }
  return members;
}

/**
 * Route a message to one member across allowed channels (first available wins:
 * push → in-app → SMS → email), honoring SMS consent + quota. Logs the result.
 */
async function sendToMember(bizId, member, body, channels, hostName, ruleId, quota) {
  const allowed = Array.isArray(channels) && channels.length ?
    channels : ["push", "inapp"];
  const smsBody = `${hostName ? hostName + ": " : ""}${body}`;
  let result = {status: "skipped", reason: "no_channel"};
  let channel = "none";

  for (const ch of allowed) {
    if (ch === "push" && member.linkedUid) {
      result = await sendPush(member.linkedUid, hostName || "Kinlo", body);
    } else if (ch === "inapp" && member.linkedUid) {
      result = await sendInApp(member.linkedUid, hostName, body);
    } else if (ch === "sms" && member.phone &&
               member.smsConsent && member.smsConsent.granted === true) {
      if (quota && quota.count >= SMS_MONTHLY_QUOTA) {
        result = {status: "skipped", reason: "sms_quota"};
      } else {
        result = await sendSms(member.phone, smsBody);
        if (result.status === "sent" && quota) quota.count += 1;
      }
    } else if (ch === "whatsapp" && member.phone &&
               member.waConsent && member.waConsent.granted === true) {
      result = await sendWhatsApp(member.phone, smsBody);
    } else if (ch === "email" && member.email) {
      result = await sendEmail(member.email, hostName, body);
    } else {
      continue;
    }
    channel = ch;
    if (result.status === "sent") break; // delivered — stop trying channels
  }

  await db().collection("businesses").doc(bizId).collection("messages").add({
    memberId: member.id,
    memberName: member.name || "",
    ruleId: ruleId || null,
    channel,
    body,
    status: result.status,
    reason: result.reason || null,
    ts: FieldValue.serverTimestamp(),
  });
  return {channel, ...result};
}

async function loadQuota(bizId) {
  const ref = db().collection("businesses").doc(bizId);
  const snap = await ref.get();
  const d = snap.exists ? snap.data() : {};
  const month = new Date().toISOString().slice(0, 7);
  return {ref, month, count: d.smsMonth === month ? (d.smsCount || 0) : 0};
}
async function saveQuota(quota) {
  await quota.ref.set(
    {smsMonth: quota.month, smsCount: quota.count}, {merge: true});
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/** Callable: send a message now to an audience (host-triggered broadcast). */
async function sendBusinessMessage(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const {bizId, message, audience, channels, ruleId} = request.data || {};
  // v1: one business per owner → the caller must own this business.
  if (bizId !== uid) throw new HttpsError("permission-denied", "Not your business.");
  if (!message || !String(message).trim()) {
    throw new HttpsError("invalid-argument", "Message is empty.");
  }
  const bizSnap = await db().collection("businesses").doc(bizId).get();
  const hostName = bizSnap.exists ? (bizSnap.data().name || "") : "";
  const members = await resolveAudience(bizId, audience);
  const quota = await loadQuota(bizId);
  let sent = 0; let skipped = 0;
  for (const m of members) {
    const r = await sendToMember(
      bizId, m, String(message).trim(), channels, hostName, ruleId, quota);
    if (r.status === "sent") sent++; else skipped++;
  }
  await saveQuota(quota);
  return {sent, skipped, total: members.length};
}

/**
 * Scheduled: process active "expiring_credit" rules — message members whose
 * package expires exactly `params.days` out (fires once per member/package).
 * Other scheduled triggers are added incrementally.
 */
async function remindersCron() {
  const rules = await db().collectionGroup("automations")
    .where("active", "==", true).limit(500).get();
  for (const doc of rules.docs) {
    const rule = doc.data();
    if (rule.trigger !== "expiring_credit") continue;
    const bizId = doc.ref.parent.parent.id;
    const days = (rule.params && rule.params.days) || 3;
    const bizSnap = await db().collection("businesses").doc(bizId).get();
    const hostName = bizSnap.exists ? (bizSnap.data().name || "") : "";
    const members = await resolveAudience(bizId, rule.audience);
    const quota = await loadQuota(bizId);
    const targetDay = new Date(Date.now() + days * 86400000)
      .toISOString().slice(0, 10);
    for (const m of members) {
      const exp = m.activePackage && m.activePackage.expiresAt ?
        String(m.activePackage.expiresAt).slice(0, 10) : null;
      if (exp === targetDay) {
        await sendToMember(bizId, m, rule.message, rule.channels,
          hostName, doc.id, quota);
      }
    }
    await saveQuota(quota);
  }
}

/**
 * The exact PUBLIC URL(s) Twilio would have signed (scheme+host+path+query). Behind
 * the Cloud Functions v2 proxy the internal request is http and the host may arrive
 * in X-Forwarded-Host, so we force https, prefer X-Forwarded-Host over Host, and keep
 * the original path+query. An explicit TWILIO_WEBHOOK_URL override wins; any candidate
 * that validates is accepted.
 * @param {object} req the Express request
 * @return {string[]} candidate public URLs
 */
function twilioPublicUrls(req) {
  const urls = [];
  if (process.env.TWILIO_WEBHOOK_URL) urls.push(process.env.TWILIO_WEBHOOK_URL);
  const path = req.originalUrl || req.url || "/";
  const hosts = [req.headers["x-forwarded-host"], req.headers.host];
  for (const h of hosts) {
    if (h) urls.push(`https://${h}${path}`);
  }
  return urls;
}

/**
 * Verify the X-Twilio-Signature against the auth token. A missing token OR signature
 * returns false, so an unconfigured or unsigned request is rejected (not trusted).
 * @param {object} req the Express request (headers + parsed form body)
 * @return {boolean} true iff a candidate URL validates the signature
 */
function isValidTwilioRequest(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers["x-twilio-signature"];
  if (!authToken || !signature) return false;
  const params = (req.body && typeof req.body === "object") ? req.body : {};
  return twilioPublicUrls(req).some((url) =>
    twilio.validateRequest(authToken, signature, url, params));
}

/**
 * Twilio inbound webhook — handle STOP/START keywords (LFPDPPP opt-out).
 * Flips the member's consent (smsConsent/waConsent) by matching the sender's phone.
 *
 * SECURITY: every request must carry a valid X-Twilio-Signature (verified with the
 * account auth token). An invalid or absent signature -> 403 (nothing processed).
 */
async function twilioWebhook(req, res) {
  if (!isValidTwilioRequest(req)) {
    console.warn("twilioWebhook: rejected request with missing/invalid signature");
    res.status(403).send("Forbidden");
    return;
  }
  try {
    const rawFrom = (req.body && (req.body.From || req.body.from)) || "";
    const isWa = rawFrom.startsWith("whatsapp:");
    const from = rawFrom.replace(/^whatsapp:/, "");
    const text = String((req.body && (req.body.Body || req.body.body)) || "")
      .trim().toUpperCase();
    const stop = ["STOP", "CANCEL", "UNSUBSCRIBE", "BAJA"].includes(text);
    const start = ["START", "UNSTOP", "ALTA"].includes(text);
    if (from && (stop || start)) {
      const snap = await db().collectionGroup("members")
        .where("phone", "==", from).limit(20).get();
      const field = isWa ? "waConsent" : "smsConsent";
      const batch = db().batch();
      snap.docs.forEach((d) => batch.set(d.ref, {
        [field]: {
          granted: start,
          at: new Date().toISOString(),
          purpose: isWa ? "wa_keyword" : "sms_keyword",
          source: stop ? "stop" : "start",
        },
      }, {merge: true}));
      await batch.commit();
    }
  } catch (e) {
    console.error("twilioWebhook error:", e.message);
  }
  res.set("Content-Type", "text/xml");
  res.status(200).send("<Response></Response>");
}

// Map a base language code to a full locale for date formatting (BUG 34).
const LANG_TO_LOCALE = {
  en: "en-US", es: "es-MX", fr: "fr-FR", de: "de-DE", pt: "pt-BR",
  it: "it-IT", nl: "nl-NL", ja: "ja-JP", ko: "ko-KR", pl: "pl-PL",
  ru: "ru-RU", uk: "uk-UA", zh: "zh-CN",
};

/**
 * Notify a linked app user with a localized SYSTEM message (BUG 34): push +
 * in-app. The body is a catalog key rendered in the recipient's language (title
 * is the business name / brand — user content, left as-is). Reads the user doc
 * ONCE for both the language and the push token (no double read). The stored
 * message is the English fallback; bodyKey/params let the in-app card re-render
 * in the live app language.
 *
 * A `whenAt` param (ISO/date) is formatted HERE into `when` using the RECIPIENT's
 * locale, so non-English recipients get a localized weekday/time (not "Mon 3PM").
 */
async function notifyLocalized(linkedUid, title, bodyKey, params) {
  if (!linkedUid) return;
  const u = await db().collection("users").doc(linkedUid).get();
  if (!u.exists) return;
  const data = u.data();
  const lang = baseLang(data.language);

  const p = {...(params || {})};
  if (p.whenAt) {
    const locale = LANG_TO_LOCALE[lang] || "en-US";
    p.when = new Date(p.whenAt).toLocaleString(locale,
      {weekday: "short", hour: "numeric", minute: "2-digit"});
    delete p.whenAt;
  }

  if (data.pushToken) {
    try {
      await sendPushNotification(data.pushToken, {
        uid: linkedUid, lang, title, bodyKey, params: p, data: {type: "business"},
      });
    } catch (e) {
      // best-effort
    }
  }
  await db().collection("notifications").add({
    userId: linkedUid,
    type: "business_message",
    title: title || "Kinlo",
    message: tPush(bodyKey, "en", p),
    bodyKey,
    params: p,
    icon: "bell",
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Scheduled: send due session reminders to the attendee(s) and the host, once
 * each (marks reminderAttendeeSent / reminderHostSent). Runs every 2 hours.
 */
async function sessionRemindersCron() {
  const now = Date.now();
  const snap = await db().collectionGroup("bookings")
    .where("status", "==", "confirmed").limit(1000).get();
  for (const doc of snap.docs) {
    const b = doc.data();
    const bizId = doc.ref.parent.parent.id;
    const start = b.start ? new Date(b.start).getTime() : 0;
    if (start < now) continue; // past
    const bizSnap = await db().collection("businesses").doc(bizId).get();
    const hostName = bizSnap.exists ? (bizSnap.data().name || "") : "";
    // Pass the raw start; notifyLocalized formats {{when}} in each recipient's
    // own locale (BUG 34) instead of a hardcoded en-US string.
    const patch = {};
    // Attendee reminder.
    if (b.reminderAttendeeAt && new Date(b.reminderAttendeeAt).getTime() <= now &&
        !b.reminderAttendeeSent) {
      for (const m of b.members || []) {
        if (!m.memberId) continue;
        const mem = await db().collection("businesses").doc(bizId)
          .collection("members").doc(m.memberId).get();
        const uid = mem.exists ? mem.data().linkedUid : null;
        if (uid) {
          // Recipient = the ATTENDEE (member). Localized per recipient.
          await notifyLocalized(uid, hostName || "Kinlo",
            "notifications.automation.sessionReminderAttendee.body",
            {session: b.sessionTypeName || "session", whenAt: b.start});
        }
      }
      patch.reminderAttendeeSent = true;
    }
    // Host reminder (recipient = the host's own account).
    if (b.reminderHostAt && new Date(b.reminderHostAt).getTime() <= now &&
        !b.reminderHostSent) {
      const names = (b.members || []).map((m) => m.name).join(", ");
      await notifyLocalized(bizId, "Kinlo",
        "notifications.automation.sessionReminderHost.body",
        {names, whenAt: b.start});
      patch.reminderHostSent = true;
    }
    if (Object.keys(patch).length) await doc.ref.update(patch);
  }
}

/**
 * Scheduled (daily): a private client who has booked before but has no upcoming
 * session and none in N days surfaces on the Momentum board with an AI-ready
 * "re-book" card. Deduped against existing cards for that member.
 */
async function momentumDetectorCron() {
  const now = Date.now();
  const GAP_DAYS = 21;
  const snap = await db().collectionGroup("bookings").limit(3000).get();
  const byBiz = {};
  for (const doc of snap.docs) {
    const bizId = doc.ref.parent.parent.id;
    (byBiz[bizId] = byBiz[bizId] || []).push(doc.data());
  }
  for (const bizId of Object.keys(byBiz)) {
    const bookings = byBiz[bizId];
    const byMember = {};
    for (const b of bookings) {
      for (const m of b.members || []) {
        if (!m.memberId) continue;
        (byMember[m.memberId] = byMember[m.memberId] || {name: m.name, times: []})
          .times.push(new Date(b.start).getTime());
      }
    }
    for (const memberId of Object.keys(byMember)) {
      const info = byMember[memberId];
      const hasUpcoming = info.times.some((t) => t >= now);
      const last = Math.max(...info.times);
      if (hasUpcoming || now - last < GAP_DAYS * 86400000) continue;
      // Dedup: skip if the member already has a card.
      const existing = await db().collection("businesses").doc(bizId)
        .collection("momentumCards").where("memberId", "==", memberId)
        .limit(1).get();
      if (!existing.empty) continue;
      await db().collection("businesses").doc(bizId)
        .collection("momentumCards").add({
          memberId, memberName: info.name || "",
          stage: "at_risk", priority: "high",
          labels: ["no-rebooking"], assigneeUid: null,
          actionTitle: `Re-book ${info.name || "member"}`,
          description: "", actionStatus: "todo", dueDate: null,
          reminder: {on: false, at: null}, checklist: [], channel: "push",
          activity: [{type: "created", text: "Auto: no upcoming session",
            at: new Date().toISOString()}],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
    }
  }
}

module.exports = {
  sendBusinessMessage, remindersCron, twilioWebhook,
  sessionRemindersCron, momentumDetectorCron,
};
