/**
 * Detects attempts to move payments off-platform (sharing bank details, CLABE,
 * card numbers, transfer instructions). Used to block such messages and report
 * them. Kept in sync with functions/contentGuard.js (server-side enforcement).
 */
const BANK_WORDS =
  /(clabe|spei|transferenc|transfi[eé]r|dep[oó]sit|cuenta\s+bancaria|n[uú]mero\s+de\s+cuenta|\btarjeta\b|oxxo\s*pay|paypal|mercado\s*pago|\bven?mo\b|zelle)/i;

export function detectProhibitedContent(text) {
  const t = String(text || "");
  const digits = t.replace(/[\s\-.]/g, "");

  // CLABE (18) or card (15-19) digit runs.
  if (/\d{15,19}/.test(digits)) return { flagged: true, reason: "account_number" };
  // Explicit banking rails.
  if (/\bclabe\b|\bspei\b/i.test(t)) return { flagged: true, reason: "bank_rail" };
  // A banking keyword together with a longer number = likely account/transfer.
  if (BANK_WORDS.test(t) && /\d{6,}/.test(digits)) {
    return { flagged: true, reason: "bank_details" };
  }
  return { flagged: false };
}

export const PROHIBITED_MESSAGE =
  "For your safety, sharing bank accounts, CLABE, card numbers or off-platform " +
  "payment details isn't allowed. Keep payments inside Kinlo. This attempt " +
  "was reported.";
