/**
 * Featured placement (client) — events AND services (KIN-185).
 *
 * The platform keeps 100% of promotion fees. The SERVER
 * (functions/stripe/featuredPricing.js) is the source of truth for the price;
 * this client catalog is for display only.
 */

import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  limit as qLimit,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { shapeListing } from "../utils/marketplaceShape";

const FUNCTIONS_BASE_URL =
  "https://us-central1-kinlo-app-dev.cloudfunctions.net";

// Fallback catalog — mirrors functions/stripe/featuredPricing.js. Used until
// the live config lands, and whenever the read fails; the SERVER still owns
// the price that actually gets charged, so a stale value here can only ever
// misdisplay, never mischarge.
export const PROMOTION_PLANS = [
  { id: "feat_7", days: 7, priceCentavos: 9900, label: "7 days" },
  { id: "feat_14", days: 14, priceCentavos: 17900, label: "14 days" },
  { id: "feat_30", days: 30, priceCentavos: 29900, label: "30 days" },
];

/**
 * KIN-185 — the shared featured catalog (events AND services use the same
 * ladder; Carlos closed this 5-ago-2026). Reads config/featuredPricing and
 * falls back per-field to PROMOTION_PLANS, so a missing doc or a garbage
 * field degrades to the known-good price instead of showing "$0" or "—".
 * @returns {Promise<Array<{id:string,days:number,priceCentavos:number,label:string}>>}
 */
export const getFeaturedPlans = async () => {
  let overrides = {};
  try {
    const snap = await getDoc(doc(db, "config", "featuredPricing"));
    if (snap.exists()) overrides = snap.data() || {};
  } catch (e) {
    console.warn("getFeaturedPlans: using defaults:", e?.message);
  }
  const positive = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
  };
  return PROMOTION_PLANS.map((p) => {
    const o = overrides[p.id] || {};
    const days = positive(o.days, p.days);
    return {
      ...p,
      days,
      priceCentavos: positive(o.priceCentavos, p.priceCentavos),
      // The label is derived, not stored: an admin who edits `days` shouldn't
      // have to remember to edit a string next to it that says something else.
      label: `${days} days`,
    };
  });
};

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

// BUG 37: `featuredUntil` is only the paid promo window (7/14/30 days) and is
// independent of when the event actually happens, so a past-dated event
// lingers in the carousel until its promo expires. Also drop events whose
// date has already passed. The event date lives on `date` (stored as an ISO
// string; recurring events have date:null). Client-side because Firestore
// allows only one range field per query and `featuredUntil` already uses it.
// A 12h grace keeps an event visible through the day it runs; undated
// (recurring) events are never hidden.
const eventStartMs = (e) => {
  const d = e.date ?? e.startAt ?? e.eventDate;
  if (!d) return Infinity; // undated / recurring → don't hide it
  const ms = d?.toMillis ? d.toMillis() : new Date(d).getTime();
  return Number.isNaN(ms) ? Infinity : ms; // unparseable → keep, don't hide
};

/**
 * KIN-219 — does this doc's city match the one the viewer is browsing?
 *
 * The two sides of this comparison are NOT the same kind of string, which is
 * the whole bug. An event/listing stores `city` as a normalized lowercase slug
 * ("tulum"); the viewer's city arrives from HomeScreen as
 * `user?.city || user?.location`, and `location` is free-text profile input
 * ("Tulum"). A strict `===` therefore threw away every result, and silently —
 * a real $99 promotion (pi_3U3TqARZsYFCeXAc0BxkLiX7) was invisible for exactly
 * this. The silence had a separate cause, fixed in KIN-221: these functions
 * used to swallow into a `console.error` that never left the device.
 *
 * Both pre-existing rules are preserved deliberately:
 *   - no city on the doc → matches any city (never hide something for missing
 *     data),
 *   - no city from the viewer → no filter at all.
 *
 * NOT diacritic-insensitive: "Cancún" still won't match "Cancun". No evidence
 * yet that it needs to be, and folding accents would be a guess about how city
 * slugs are generated rather than a fix for something observed.
 *
 * @param {string|undefined|null} docCity the city stored on the event/listing
 * @param {string|undefined|null} userCity the city the viewer is browsing
 * @returns {boolean} true when the doc should be shown
 */
const cityMatches = (docCity, userCity) => {
  const norm = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");
  const wanted = norm(userCity);
  if (!wanted) return true; // viewer has no city → no filter
  const have = norm(docCity);
  if (!have) return true; // doc has no city → matches anything
  return have === wanted;
};

/**
 * Currently-featured events (promotion not expired, not cancelled, not
 * already finished), newest promotion first. Shared by getFeaturedEvents
 * and getFeaturedEventsNearby so the eligibility rules live in one place.
 * @returns {Promise<Array>}
 */
const fetchFeaturedEventDocs = async () => {
  const q = query(
    collection(db, "events"),
    where("featuredUntil", ">", Timestamp.now()),
    orderBy("featuredUntil", "desc")
  );
  const snapshot = await getDocs(q);
  const cutoffMs = Date.now() - 12 * 60 * 60 * 1000;
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => e.status !== "cancelled")
    .filter((e) => eventStartMs(e) >= cutoffMs); // drop events already finished
};

/**
 * Fetch currently-featured events (promotion not expired). Used by
 * MyEventsScreen's "Popular" carousel — no city filter, unchanged behavior.
 *
 * KIN-221: no longer catches. A failed read propagates so the caller (via
 * useAsyncLoad) can surface AND report it; returning [] made a broken query
 * indistinguishable from "nothing is featured".
 * @param {number} [max] limit
 * @returns {Promise<Array>}
 * @throws whatever Firestore throws — the caller owns the failure now
 */
export const getFeaturedEvents = async (max = 10) => {
  const docs = await fetchFeaturedEventDocs();
  return docs.slice(0, max);
};

/**
 * KIN-184 — Home "Featured Events" carousel: same eligibility as
 * getFeaturedEvents, plus an optional city filter. City is filtered
 * client-side, same rule as getMarketplaceListings: an event with no city
 * matches any city (never hidden just for missing data). No city passed →
 * no city filter at all (nothing to default to — a host's own city, not a
 * hardcoded one, drives this via the caller).
 * KIN-221: no longer catches — see getFeaturedEvents.
 * @param {{ city?: string, max?: number }} [opts]
 * @returns {Promise<Array>}
 * @throws whatever Firestore throws — the caller owns the failure now
 */
export const getFeaturedEventsNearby = async ({ city, max = 10 } = {}) => {
  const docs = await fetchFeaturedEventDocs();
  // KIN-219: cityMatches also encodes "no city passed → no filter", so the
  // ternary that used to guard that is gone rather than duplicated.
  return docs.filter((e) => cityMatches(e.city, city)).slice(0, max);
};

/**
 * KIN-185 — Home "Featured Services": public listings whose paid window is
 * still open, optionally filtered by city.
 *
 * Only `publicListing == true` goes to Firestore. That is not an optimization:
 * the collectionGroup rule authorizes exactly that predicate, so it has to be
 * in the query or the whole read is denied (CLAUDE.md §4). `featuredUntil` is
 * then filtered client-side — a second server-side range filter would need a
 * new composite index, and the city rule matches getMarketplaceListings
 * anyway: a listing with no city matches any city, never hidden for missing
 * data.
 * KIN-221: no longer catches — see getFeaturedEvents.
 * @param {{ city?: string, vertical?: string, max?: number }} [opts]
 * @returns {Promise<Array>}
 * @throws whatever Firestore throws — the caller owns the failure now
 */
export const getFeaturedListings = async ({ city, vertical, max = 10 } = {}) => {
  const clauses = [where("publicListing", "==", true)];
  if (vertical) clauses.push(where("vertical", "==", vertical));
  // Over-fetch before the client-side featured filter: capping at `max` here
  // would return `max` PUBLIC listings and then likely filter them all away.
  const q = query(collectionGroup(db, "sessionTypes"), ...clauses, qLimit(200));
  const snap = await getDocs(q);
  const nowMs = Date.now();
  return snap.docs
    .map((d) => ({
      ...shapeListing(d),
      featuredUntil: d.data().featuredUntil || null,
    }))
    .filter((l) => l.bizId)
    .filter((l) => {
      const u = l.featuredUntil;
      const ms = u?.toMillis ? u.toMillis() : u ? new Date(u).getTime() : 0;
      return Number.isFinite(ms) && ms > nowMs;
    })
    .filter((l) => cityMatches(l.city, city)) // KIN-219
    .sort((a, b) => {
      const ms = (u) => (u?.toMillis ? u.toMillis() : 0);
      return ms(b.featuredUntil) - ms(a.featuredUntil);
    })
    .slice(0, max);
};

/**
 * KIN-185 — create a PaymentIntent to feature a SERVICE. Mirrors
 * createPromotionPaymentIntent; the server validates ownership and owns the
 * price (the client never sends an amount).
 * @param {string} bizId
 * @param {string} sessionTypeId
 * @param {string} planId
 * @returns {Promise<{success:boolean, clientSecret?:string, error?:string}>}
 */
export const createServicePromotionPaymentIntent = async (
  bizId,
  sessionTypeId,
  planId,
) => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) return { success: false, error: "Not signed in." };
    const response = await fetch(
      `${FUNCTIONS_BASE_URL}/createServicePromotionPaymentIntent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Identity comes from this token; the server ignores any body userId.
          Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
        },
        body: JSON.stringify({ bizId, sessionTypeId, planId }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || "Could not start promotion." };
    }
    return { success: true, ...data };
  } catch (e) {
    console.error("❌ createServicePromotionPaymentIntent:", e);
    return { success: false, error: e.message };
  }
};
