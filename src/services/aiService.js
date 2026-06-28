/**
 * Premium AI helpers (BondVibe Pro). All gated server-side by isPremium; the
 * client maps a "premium_required" error so the UI can upsell.
 */
import { getFunctions, httpsCallable } from "firebase/functions";

const call = async (name, data) => {
  try {
    const fn = httpsCallable(getFunctions(), name);
    const res = await fn(data);
    return { success: true, ...res.data };
  } catch (e) {
    return { success: false, code: e.code, error: e.message };
  }
};

export const isPremiumRequired = (r) =>
  (r?.code || "").includes("permission-denied") || r?.error === "premium_required";

/** Generate catchy title options + a description from an idea + category. */
export const generateEventListing = (idea, category, language = "es") =>
  call("generateEventListing", { idea, category, language });

/** Suggest a gracious host reply to an attendee review. */
export const generateReviewReply = (rating, comment, language = "es") =>
  call("generateReviewReply", { rating, comment, language });
