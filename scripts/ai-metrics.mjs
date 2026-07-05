#!/usr/bin/env node
/**
 * AI observability (kinlo_build/ai_features/16B) — reads the `aiEvents`
 * collection and prints per-feature health: call counts, ok/fallback/denied
 * rates, latency p50/p95, and token spend.
 *
 * Usage:  node scripts/ai-metrics.mjs [--project bondvibe-dev] [--days 7]
 * Auth:   uses your gcloud user credentials (gcloud auth print-access-token).
 *
 * Targets from the spec: fallback rate <2% · non-chat latency p95 <2.5s.
 */
import { execSync } from "node:child_process";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const PROJECT = arg("project", "bondvibe-dev");
const DAYS = Number(arg("days", "7"));

const token = execSync("gcloud auth print-access-token").toString().trim();
const since = new Date(Date.now() - DAYS * 86400000).toISOString();

const body = {
  structuredQuery: {
    from: [{ collectionId: "aiEvents" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "createdAt" },
        op: "GREATER_THAN_OR_EQUAL",
        value: { stringValue: since },
      },
    },
    limit: 5000,
  },
};

const res = await fetch(
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": PROJECT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }
);
const rows = (await res.json())
  .filter((r) => r.document)
  .map((r) => {
    const f = r.document.fields;
    const v = (k) => f[k] && Object.values(f[k])[0];
    return {
      feature: v("feature"),
      outcome: v("outcome"),
      latencyMs: Number(v("latencyMs") || 0),
      inputTokens: Number(v("inputTokens") || 0),
      outputTokens: Number(v("outputTokens") || 0),
      reason: v("reason") || "",
    };
  });

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "–");
const quantile = (arr, q) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

const features = [...new Set(rows.map((r) => r.feature))].filter(Boolean);
console.log(`\nAI health — last ${DAYS}d · ${rows.length} calls · project ${PROJECT}\n`);
console.log(
  "feature".padEnd(15),
  "calls".padStart(6),
  "ok".padStart(7),
  "fallbk".padStart(7),
  "denied".padStart(7),
  "p50ms".padStart(7),
  "p95ms".padStart(7),
  "tokens".padStart(9)
);
for (const feat of features) {
  const fr = rows.filter((r) => r.feature === feat);
  const ok = fr.filter((r) => r.outcome === "ok");
  const fb = fr.filter((r) => r.outcome === "fallback").length;
  const den = fr.filter((r) => r.outcome === "denied").length;
  const lat = ok.map((r) => r.latencyMs);
  const tokens = fr.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
  console.log(
    String(feat).padEnd(15),
    String(fr.length).padStart(6),
    pct(ok.length, fr.length).padStart(7),
    pct(fb, fr.length).padStart(7),
    pct(den, fr.length).padStart(7),
    String(quantile(lat, 0.5)).padStart(7),
    String(quantile(lat, 0.95)).padStart(7),
    String(tokens).padStart(9)
  );
}

const fallbackReasons = rows.filter((r) => r.outcome === "fallback");
if (fallbackReasons.length) {
  console.log("\nfallback reasons:");
  const byReason = {};
  for (const r of fallbackReasons) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  for (const [reason, n] of Object.entries(byReason)) console.log(`  ${n}× ${reason}`);
}
const deniedReasons = rows.filter((r) => r.outcome === "denied");
if (deniedReasons.length) {
  console.log("\ndenied reasons:");
  const byReason = {};
  for (const r of deniedReasons) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  for (const [reason, n] of Object.entries(byReason)) console.log(`  ${n}× ${reason}`);
}
console.log();
