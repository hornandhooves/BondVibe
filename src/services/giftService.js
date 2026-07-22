/**
 * Social gifting — client service (feat/social-gifting Fases 2–5).
 *
 * Money runs on the existing Stripe rails (functions/stripe/gifting.js):
 *  - createGiftPaymentIntent: onRequest (HTTP), like createEventPaymentIntent —
 *    identity from the Firebase ID token, price server-authoritative.
 *  - redeemGift / cancelGift / declineGift: onCall.
 * The amount NEVER travels to the recipient side — the recipient's gift doc has
 * no amount (it lives in the deny-all giftLedger).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as qLimit,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, auth } from "./firebase";
import { getFollowing } from "./followService";

// Same base URL + region the rest of the Stripe client uses (stripeService.js).
const FUNCTIONS_BASE_URL = "https://us-central1-kinlo-app-dev.cloudfunctions.net";

/**
 * Create a gift PaymentIntent (the gifter pays). Returns { clientSecret, giftId,
 * breakdown } — the gifts doc is created by the webhook on confirmation.
 */
export const createGiftPaymentIntent = async ({
  recipientId,
  itemId,
  itemType = "event",
  fromMode = "named",
  message = "",
}) => {
  const res = await fetch(`${FUNCTIONS_BASE_URL}/createGiftPaymentIntent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
    },
    body: JSON.stringify({ recipientId, itemId, itemType, fromMode, message }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "gift_payment_failed");
  return data;
};

/** Recipient redeems (no charge). Event → enroll; throws code on failure. */
export const redeemGift = async (giftId, opts = {}) => {
  const fn = httpsCallable(getFunctions(), "redeemGift");
  const res = await fn({ giftId, ...opts });
  return res.data;
};

/** Gifter cancels a still-unredeemed gift → refund to their card. */
export const cancelGift = async (giftId) => {
  const fn = httpsCallable(getFunctions(), "cancelGift");
  return (await fn({ giftId })).data;
};

/** Recipient declines discreetly → refund to the gifter (no reason surfaced). */
export const declineGift = async (giftId) => {
  const fn = httpsCallable(getFunctions(), "declineGift");
  return (await fn({ giftId })).data;
};

/** A single gift doc (gifter or recipient may read; no amount inside). */
export const getGift = async (giftId) => {
  const s = await getDoc(doc(db, "gifts", giftId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};

/** Live GIFTER view (the receipt) — gifts/{id}, readable by the gifter only. */
export const subscribeGift = (giftId, cb) =>
  onSnapshot(doc(db, "gifts", giftId), (s) =>
    cb(s.exists() ? { id: s.id, ...s.data() } : null)
  );

/**
 * Live RECIPIENT view (the reveal) — giftReveals/{id}, readable by the recipient
 * only. ANONYMITY (review C): this projection never carries gifterId, so an
 * anonymous gift's sender can't be recovered client-side.
 */
export const subscribeGiftReveal = (giftId, cb) =>
  onSnapshot(doc(db, "giftReveals", giftId), (s) =>
    cb(s.exists() ? { id: s.id, ...s.data() } : null)
  );

/**
 * A recipient's public profile for the gifting flow — ONLY public, consented
 * fields (Decision D: never personality / matchmaking signals). The birthday
 * (day+month) lives in the consent-gated users/{uid}/social/birthday subdoc
 * (review D); reading it succeeds only when that user shared it.
 */
export const getGiftRecipient = async (uid) => {
  const s = await getDoc(doc(db, "users", uid));
  if (!s.exists()) return null;
  const u = s.data();
  let birthday = null;
  if (u.birthdayShareConsent === true) {
    try {
      const b = await getDoc(doc(db, "users", uid, "social", "birthday"));
      if (b.exists() && typeof b.data().birthDay === "number" &&
          typeof b.data().birthMonth === "number") {
        birthday = { day: b.data().birthDay, month: b.data().birthMonth };
      }
    } catch (e) {
      birthday = null; // gated / not shared
    }
  }
  return {
    id: uid,
    name: u.fullName || u.name || "",
    avatar: u.avatar ?? null,
    location: u.location ?? null,
    publicInterests: Array.isArray(u.publicInterests) ? u.publicInterests : [],
    birthday,
  };
};

// Days until the next occurrence of a day/month (year-agnostic).
const daysUntilBirthday = (day, month) => {
  const now = new Date();
  const y = now.getFullYear();
  let next = new Date(y, month - 1, day);
  const today = new Date(y, now.getMonth(), now.getDate());
  if (next < today) next = new Date(y + 1, month - 1, day);
  return Math.round((next - today) / 86400000);
};

/**
 * People you follow whose shared birthday is within `withinDays` — the Home
 * reminder + entry point (Board 2). Only consented day/month, never the year.
 */
export const getUpcomingBirthdays = async (withinDays = 14) => {
  const me = auth.currentUser?.uid;
  if (!me) return [];
  const following = await getFollowing(me);
  const out = [];
  await Promise.all(
    following.map(async (uid) => {
      const r = await getGiftRecipient(uid);
      if (!r?.birthday) return;
      const days = daysUntilBirthday(r.birthday.day, r.birthday.month);
      if (days <= withinDays) out.push({ ...r, daysUntil: days });
    })
  );
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
};

/**
 * Suggested PAID events for a recipient (Board 2b/2c). Decision D: rank by the
 * recipient's PUBLIC interests/categories only. No prefs → popular upcoming
 * events in their city (or anywhere). Never reads private/matchmaking signals.
 */
export const getGiftSuggestions = async (recipient, max = 12) => {
  const nowIso = new Date().toISOString();
  const evCol = collection(db, "events");
  const interests = (recipient?.publicInterests || []).slice(0, 10);

  let events = [];
  if (interests.length) {
    const snap = await getDocs(
      query(
        evCol,
        where("category", "in", interests),
        where("date", ">=", nowIso),
        orderBy("date", "asc"),
        qLimit(max)
      )
    ).catch(() => null);
    events = snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  }
  let noPrefs = false;
  if (!events.length) {
    // Fallback: upcoming events (popular first if a counter exists), city-scoped
    // when we know it. "Elige tú" empty state is driven by this being the source.
    noPrefs = true;
    const snap = await getDocs(
      query(evCol, where("date", ">=", nowIso), orderBy("date", "asc"), qLimit(max))
    ).catch(() => null);
    events = snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  }
  // Gifting only works on PAID events (nothing to gift on a free one).
  const paid = events.filter((e) => (e.price || 0) > 0);
  return {
    noPrefs,
    events: paid.map((e) => ({
      id: e.id,
      title: e.title || "",
      price: e.price || 0,
      date: e.date || null,
      city: e.city || null,
      category: e.category || null,
      // Simple public-signal affinity: interest match (never private signals).
      affinity: interests.includes(e.category) ? 1 : 0,
    })),
  };
};
