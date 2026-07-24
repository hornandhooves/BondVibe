#!/usr/bin/env node
/**
 * Read what the automations engine actually DID for the WA-smoke business.
 * Every send writes a doc to businesses/<biz>/messages (see sendToMember), so
 * this is the authoritative record: sent / failed+reason / skipped+reason.
 *
 * Usage:
 *   node scripts/wa-smoke-status.mjs                 # last 10 for wa-smoke-biz
 *   node scripts/wa-smoke-status.mjs --biz <id> --limit 20
 * Auth: gcloud, account hornandhoovesdev@gmail.com. Read-only.
 */
import { execSync } from "node:child_process";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const PROJECT = arg("project", "kinlo-app-dev");
const BIZ = arg("biz", "wa-smoke-biz");
const LIMIT = Number(arg("limit", "10")) || 10;

const token = execSync("gcloud auth print-access-token").toString().trim();
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Goog-User-Project": PROJECT };

const v = (f) => {
  if (f == null) return "";
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return String(f.integerValue);
  if (f.booleanValue !== undefined) return String(f.booleanValue);
  if (f.timestampValue !== undefined) return f.timestampValue;
  if (f.nullValue !== undefined) return "null";
  if (f.mapValue !== undefined) return "{...}";
  return "";
};

(async () => {
  const body = { structuredQuery: {
    from: [{ collectionId: "messages" }],
    orderBy: [{ field: { fieldPath: "ts" }, direction: "DESCENDING" }],
    limit: LIMIT,
  } };
  const res = await fetch(`${BASE}/businesses/${BIZ}:runQuery`,
    { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`runQuery -> ${res.status} ${await res.text()}`);
  const rows = (await res.json()).filter((r) => r.document);

  console.log(`\n=== businesses/${BIZ}/messages -- last ${LIMIT}, newest first ===`);
  if (!rows.length) {
    console.log("(no messages logged -> the cron never processed a member for this biz:");
    console.log(" rule inactive at read time, date/audience mismatch, or member not matched)\n");
    return;
  }
  for (const r of rows) {
    const f = r.document.fields || {};
    const reason = v(f.reason);
    console.log(
      `${v(f.ts) || "(no ts)"}  channel=${v(f.channel) || "-"}  ` +
      `status=${v(f.status) || "-"}  reason=${reason && reason !== "null" ? reason : "-"}  ` +
      `member=${v(f.memberId) || "-"}`);
  }
  console.log("\nTwilio reason codes: twilio_400/63016 = outside 24h window (re-open it);");
  console.log("twilio_63007 = not a WhatsApp number/format; whatsapp_not_configured = From/secret missing.\n");
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
