/**
 * Featured-event promotions (client).
 *
 * The platform keeps 100% of promotion fees. The SERVER
 * (functions/stripe/promotions.js) is the source of truth for the price; this
 * client catalog is for display only.
 */

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

const FUNCTIONS_BASE_URL =
  "https://us-central1-kinlo-app-dev.cloudfunctions.net";

// Display catalog — mirrors functions/stripe/promotions.js.
export const PROMOTION_PLANS = [
  { id: "feat_7", days: 7, priceCentavos: 9900, label: "7 days" },
  { id: "feat_14", days: 14, priceCentavos: 17900, label: "14 days" },
  { id: "feat_30", days: 30, priceCentavos: 29900, label: "30 days" },
];

/**
 * Format centavos as a MXN price string.
 * @param {number} centavos
 * @returns {string}
 */
export const formatPromoPrice = (centavos) => {
  const pesos = (Number(centavos) || 0) / 100;
  return `$${pesos.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXN`;
};

/**
 * Create a PaymentIntent to promote an event. The membership/featured doc is
 * applied by the payment webhook on success.
 * @param {string} eventId
 * @param {string} planId
 * @returns {Promise<{success:boolean, clientSecret?:string, error?:string}>}
 */
export const createPromotionPaymentIntent = async (eventId, planId) => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) return { success: false, error: "Not signed in." };
    const response = await fetch(
      `${FUNCTIONS_BASE_URL}/createPromotionPaymentIntent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Identity comes from this token; the server ignores any body userId.
          Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
        },
        body: JSON.stringify({ eventId, planId }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || "Could not start promotion." };
    }
    return { success: true, ...data };
  } catch (e) {
    console.error("❌ createPromotionPaymentIntent:", e);
    return { success: false, error: e.message };
  }
};

/**
 * Fetch currently-featured events (promotion not expired).
 * @param {number} [max] limit
 * @returns {Promise<Array>}
 */
export const getFeaturedEvents = async (max = 10) => {
  try {
    const q = query(
      collection(db, "events"),
      where("featuredUntil", ">", Timestamp.now()),
      orderBy("featuredUntil", "desc")
    );
    const snapshot = await getDocs(q);
    // BUG 37: `featuredUntil` is only the paid promo window (7/14/30 days) and
    // is independent of when the event actually happens, so a past-dated event
    // lingers in the carousel until its promo expires. Also drop events whose
    // date has already passed. The event date lives on `date` (stored as an ISO
    // string; recurring events have date:null). Client-side because Firestore
    // allows only one range field per query and `featuredUntil` already uses it.
    // A 12h grace keeps an event visible through the day it runs; undated
    // (recurring) events are never hidden.
    const cutoffMs = Date.now() - 12 * 60 * 60 * 1000;
    const eventStartMs = (e) => {
      const d = e.date ?? e.startAt ?? e.eventDate;
      if (!d) return Infinity; // undated / recurring → don't hide it
      const ms = d?.toMillis ? d.toMillis() : new Date(d).getTime();
      return Number.isNaN(ms) ? Infinity : ms; // unparseable → keep, don't hide
    };
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((e) => e.status !== "cancelled")
      .filter((e) => eventStartMs(e) >= cutoffMs) // drop events already finished
      .slice(0, max);
  } catch (e) {
    console.error("❌ getFeaturedEvents:", e);
    return [];
  }
};
