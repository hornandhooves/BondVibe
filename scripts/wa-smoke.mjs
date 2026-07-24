#!/usr/bin/env node
/**
 * WhatsApp end-to-end smoke for Kinlo for Business — NO client rebuild.
 *
 * Seeds a DEDICATED throwaway business + one member (waConsent granted, phone
 * joined to the Twilio WhatsApp sandbox) + one `expiring_credit` automation rule
 * whose channel is `whatsapp`, sized so the deployed `businessRemindersCron`
 * (every day 09:00 America/Mexico_City) matches it. You then fire that scheduler
 * job once, and a WhatsApp lands on your phone through the REAL deployed path:
 *   businessRemindersCron -> remindersCron -> sendToMember -> sendWhatsApp -> Twilio.
 *
 * It writes ONLY to businesses/<biz> (default "wa-smoke-biz") — it never touches
 * a real business. DRY RUN BY DEFAULT. No secrets are read or printed here; the
 * TWILIO_* creds live in Firebase Secret Manager and are used only inside the
 * deployed function.
 *
 * Usage:
 *   node scripts/wa-smoke.mjs                     # dry run: shows the plan + next steps
 *   node scripts/wa-smoke.mjs --apply             # seed the smoke docs
 *   node scripts/wa-smoke.mjs --cleanup --apply   # deactivate the smoke rule when done
 *   node scripts/wa-smoke.mjs --phone "+5214773016660" --apply
 *
 * Auth: gcloud Owner/Editor, account hornandhoovesdev@gmail.com (same as the
 * other scripts). Run from the repo root.
 */
import { execSync } from "node:child_process";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const PROJECT = arg("project", "kinlo-app-dev");
const BIZ = arg("biz", "wa-smoke-biz");
const MEMBER = arg("member", "wa-smoke-member");
const RULE = arg("rule", "wa-smoke-rule");
const PHONE = arg("phone", "+5214773016660"); // your sandbox-joined number
const DAYS = Number(arg("days", "2")) || 2; // avoid the falsy-0 trap in the cron
const MESSAGE = arg("message", "Prueba de WhatsApp de Kinlo ✅ (smoke)");
const APPLY = process.argv.includes("--apply");
const CLEANUP = process.argv.includes("--cleanup");

// The cron computes targetDay in UTC: new Date(now + days*86400000)
// .toISOString().slice(0,10). We store activePackage.expiresAt with the SAME
// formula so member matches rule regardless of local timezone.
const nowIso = new Date().toISOString();
const expiresDay = new Date(Date.now() + DAYS * 86400000)
  .toISOString().slice(0, 10);

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}` +
  `/databases/(default)/documents`;

function token() {
  return execSync("gcloud auth print-access-token").toString().trim();
}
function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    "Content-Type": "application/json",
    "X-Goog-User-Project": PROJECT,
  };
}
async function patch(path, fields, maskFields) {
  const mask = maskFields
    ? "?" + maskFields.map((f) => `updateMask.fieldPaths=${f}`).join("&")
    : "";
  const res = await fetch(`${BASE}/${path}${mask}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`PATCH ${path} -> ${res.status} ${await res.text()}`);
}

const bizFields = { name: { stringValue: "Kinlo WA Smoke" } };
const memberFields = {
  name: { stringValue: "WA Smoke Member" },
  phone: { stringValue: PHONE },
  status: { stringValue: "active" },
  waConsent: { mapValue: { fields: {
    granted: { booleanValue: true },
    at: { stringValue: nowIso },
    purpose: { stringValue: "wa_smoke" },
    source: { stringValue: "smoke" },
  } } },
  activePackage: { mapValue: { fields: {
    expiresAt: { stringValue: expiresDay },
  } } },
};
const ruleFields = {
  active: { booleanValue: true },
  trigger: { stringValue: "expiring_credit" },
  channels: { arrayValue: { values: [{ stringValue: "whatsapp" }] } },
  audience: { mapValue: { fields: {
    type: { stringValue: "member" },
    value: { stringValue: MEMBER },
  } } },
  params: { mapValue: { fields: { days: { integerValue: String(DAYS) } } } },
  message: { stringValue: MESSAGE },
};

const jobHint =
  "gcloud scheduler jobs run " +
  "firebase-schedule-businessRemindersCron-us-central1 " +
  "--location=us-central1";

function printPreconditions() {
  console.log(`
PRECONDITIONS — the smoke is INERT (silently "skipped") if any is false:
  1. PR #76 (WhatsApp channel) merged to main AND deployed:
       firebase deploy --only functions:businessRemindersCron
  2. settings/notifConfig.whatsappFrom is set:
       node scripts/set-notif-config.mjs --from "whatsapp:+14155238886" --apply
  3. TWILIO_* secrets set (#75) and bound to businessRemindersCron (they are).
  4. ${PHONE} has JOINED the Twilio WhatsApp sandbox
     (send the sandbox join code to +1 415 523 8886 from that phone first).`);
}
function printNext() {
  console.log(`
NEXT — fire the daily reminders job now (uses your gcloud, no secrets):
  ${jobHint}
  # if that job id/location 404s, find the real one:
  #   gcloud scheduler jobs list --location=us-central1 | grep -i remindersCron

A WhatsApp ("Kinlo WA Smoke: ${MESSAGE}") should reach ${PHONE} within ~1 min.
Watch the deployed logs if it does not arrive:
  gcloud functions logs read businessRemindersCron --limit 40

When done, deactivate the smoke rule so 09:00 does not re-send:
  node scripts/wa-smoke.mjs --cleanup --apply`);
}

(async () => {
  const mode = CLEANUP ? "CLEANUP" : "SEED";
  console.log(`\n=== WhatsApp smoke · ${PROJECT} · ${mode} · ` +
    `${APPLY ? "APPLY" : "DRY RUN"} ===`);

  if (CLEANUP) {
    console.log(`Deactivating rule businesses/${BIZ}/automations/${RULE} ` +
      `(active -> false).`);
    if (!APPLY) { console.log("\nDry run. Re-run with --apply to write.\n"); return; }
    await patch(`businesses/${BIZ}/automations/${RULE}`,
      { active: { booleanValue: false } }, ["active"]);
    console.log("Rule deactivated.\n");
    return;
  }

  console.log(`biz     businesses/${BIZ}                      name="Kinlo WA Smoke"`);
  console.log(`member  businesses/${BIZ}/members/${MEMBER}`);
  console.log(`          phone=${PHONE}  waConsent.granted=true  status=active`);
  console.log(`          activePackage.expiresAt=${expiresDay}  (today + ${DAYS}d, UTC)`);
  console.log(`rule    businesses/${BIZ}/automations/${RULE}`);
  console.log(`          trigger=expiring_credit  channels=["whatsapp"]  ` +
    `params.days=${DAYS}`);
  console.log(`          audience={type:"member", value:"${MEMBER}"}`);
  console.log(`          message=${JSON.stringify(MESSAGE)}`);
  printPreconditions();

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to seed the docs.");
    printNext();
    return;
  }

  await patch(`businesses/${BIZ}`, bizFields);
  await patch(`businesses/${BIZ}/members/${MEMBER}`, memberFields);
  await patch(`businesses/${BIZ}/automations/${RULE}`, ruleFields);
  console.log("\nSEEDED.");
  printNext();
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
