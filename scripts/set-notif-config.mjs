#!/usr/bin/env node
/**
 * Set settings/notifConfig.whatsappFrom (Twilio sandbox number for dev, e.g.
 * "whatsapp:+14155238886"; swap to your prod WhatsApp sender later -- no code
 * change, no redeploy). DRY RUN BY DEFAULT.
 *
 * Usage:
 *   node scripts/set-notif-config.mjs --from "whatsapp:+14155238886"          # dry
 *   node scripts/set-notif-config.mjs --from "whatsapp:+14155238886" --apply  # write
 * Auth: gcloud Owner/Editor, account hornandhoovesdev@gmail.com.
 */
import { execSync } from "node:child_process";
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt; };
const PROJECT = arg("project", "kinlo-app-dev");
const FROM = arg("from", null);
const APPLY = process.argv.includes("--apply");
if (!FROM || !FROM.startsWith("whatsapp:")) {
  console.error('Pass --from "whatsapp:+<number>" (sandbox: whatsapp:+14155238886).');
  process.exit(1);
}
const token = execSync("gcloud auth print-access-token").toString().trim();
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Goog-User-Project": PROJECT };
(async () => {
  console.log(`\n=== settings/notifConfig.whatsappFrom · ${PROJECT} · ${APPLY ? "APPLY" : "DRY RUN"} ===`);
  console.log(`whatsappFrom -> ${FROM}`);
  if (!APPLY) { console.log("Dry run only. Re-run with --apply to write.\n"); return; }
  const res = await fetch(`${BASE}/settings/notifConfig?updateMask.fieldPaths=whatsappFrom`,
    { method: "PATCH", headers, body: JSON.stringify({ fields: { whatsappFrom: { stringValue: FROM } } }) });
  if (!res.ok) throw new Error(`PATCH -> ${res.status} ${await res.text()}`);
  console.log("APPLIED.\n");
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
