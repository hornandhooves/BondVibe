/**
 * Payout SETTINGS — the global retention window (settings/payouts.retentionHours, §7).
 *
 * NOT ledger data: settings/payouts is admin-tunable config that the Firestore
 * rules expose directly (read: signed-in; write: admin && retentionHours is a
 * number >= 0). So — unlike the deny-all paymentLedger (adminPayoutsService,
 * callables only) — this reads/writes the doc directly; the rule is the
 * server-side gate. Source of truth: docs/DISENO_escrow_pagos.md §7.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Mirror of the server default (escrow.js DEFAULT_RETENTION_HOURS) + hard floor 0.
export const DEFAULT_RETENTION_HOURS = 24;

/**
 * Read the global retention window (hours). Falls back to the default when the
 * doc/field is absent or non-numeric; floors a bad stored value at 0
 * (defense-in-depth, mirrors the server read path).
 */
export const getRetentionHours = async () => {
  const snap = await getDoc(doc(db, "settings", "payouts"));
  const raw = snap.exists() ? snap.data().retentionHours : undefined;
  const n = Number(raw);
  if (raw === undefined || !Number.isFinite(n)) return DEFAULT_RETENTION_HOURS;
  return Math.max(0, n);
};

/**
 * Persist the global retention window (hours). Rejects a non-number / negative
 * value client-side (§7: "el form y el server rechazan negativo") — the Firestore
 * rule is the authoritative gate (admin && number >= 0). Merges so any other
 * settings/payouts fields are preserved.
 */
export const setRetentionHours = async (hours) => {
  const n = Number(hours);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error("invalid_retention_hours");
    err.code = "invalid_retention_hours";
    throw err;
  }
  await setDoc(doc(db, "settings", "payouts"), { retentionHours: n }, { merge: true });
  return n;
};
