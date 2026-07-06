/**
 * Mercado Pago — Checkout Pro, single-account model (Option B).
 *
 * Payments collect into the platform's MP account (using MERCADOPAGO_ACCESS_TOKEN).
 * The host is paid out separately (manual SPEI to their CLABE) — we record what
 * is owed (hostPayoutOwed). This lets hosts WITHOUT an RFC receive money without
 * needing their own MP/Stripe connection. (Marketplace OAuth is a future phase.)
 */
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {calculateCheckoutAmount} = require("./stripe/pricing");

const mpToken = defineSecret("MERCADOPAGO_ACCESS_TOKEN");
const MP_API = "https://api.mercadopago.com";
const PROJECT = process.env.GCLOUD_PROJECT || "bondvibe-dev";
const WEBHOOK_URL = `https://us-central1-${PROJECT}.cloudfunctions.net/mercadoPagoWebhook`;
const RETURN_URL = `https://${PROJECT}.web.app/payment-success.html`;

const hostIdOf = (e) => e.creatorId || e.createdBy || e.hostId;

/**
 * Create a Checkout Pro preference for an event ticket. The buyer pays
 * price + platform fee + MP fee; returns the hosted checkout URL.
 */
exports.createMercadoPagoPreference = onRequest(
  {cors: true, secrets: [mpToken]},
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }
    try {
      const {verifyBearer} = require("./lib/auth");
      const caller = await verifyBearer(req);
      if (!caller) return res.status(401).json({error: "unauthenticated"});
      const userId = caller.uid; // payer = verified caller
      const {eventId} = req.body;
      if (!eventId) {
        return res.status(400).json({error: "Missing required fields"});
      }

      const db = admin.firestore();
      const eventSnap = await db.collection("events").doc(eventId).get();
      if (!eventSnap.exists) return res.status(404).json({error: "Event not found"});
      const eventData = eventSnap.data();
      // PRICE authoritative from the event doc — never a client amount.
      const eventPrice = Math.round((eventData.price || 0) * 100);

      const {getPricingConfig} = require("./stripe/pricing");
      const mpCfg = await getPricingConfig(db);
      const pricing = calculateCheckoutAmount(eventPrice, "mercadopago", {
        platformFeePercent: mpCfg.eventPlatformFeePercent,
      });
      const unitPrice = Math.round(pricing.totalAmount) / 100; // MP uses decimal pesos

      const preference = {
        items: [
          {
            title: (eventData.title || "Event").slice(0, 250),
            quantity: 1,
            unit_price: unitPrice,
            currency_id: "MXN",
          },
        ],
        external_reference: `${eventId}:${userId}`,
        notification_url: WEBHOOK_URL,
        back_urls: {success: RETURN_URL, failure: RETURN_URL, pending: RETURN_URL},
        metadata: {
          event_id: eventId,
          user_id: userId,
          host_id: hostIdOf(eventData),
          event_price: pricing.eventPrice,
          platform_fee: pricing.platformFee,
          processor_fee: pricing.processorFee,
        },
      };

      const r = await fetch(`${MP_API}/checkout/preferences`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mpToken.value()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preference),
      });
      const data = await r.json();
      if (!r.ok) {
        console.error("MP preference error:", r.status, data);
        return res.status(502).json({error: "Mercado Pago error", details: data});
      }
      return res.json({
        preferenceId: data.id,
        initPoint: data.init_point,
        sandboxInitPoint: data.sandbox_init_point,
      });
    } catch (e) {
      console.error("createMercadoPagoPreference:", e);
      return res.status(500).json({error: e.message});
    }
  },
);

/**
 * Webhook for MP payment notifications. On an approved payment, records it and
 * adds the buyer to the event attendees (idempotent). Always returns 200 so MP
 * doesn't retry-storm on our handled cases.
 */
exports.mercadoPagoWebhook = onRequest(
  {cors: true, secrets: [mpToken]},
  async (req, res) => {
    try {
      const type = req.query.type || req.query.topic || req.body?.type;
      const paymentId =
        req.query["data.id"] || req.query.id || req.body?.data?.id;
      if (type !== "payment" || !paymentId) return res.status(200).send("ignored");

      const pr = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
        headers: {Authorization: `Bearer ${mpToken.value()}`},
      });
      const payment = await pr.json();
      if (!pr.ok) {
        console.error("MP payment fetch error:", pr.status, payment);
        return res.status(200).send("fetch-error");
      }
      if (payment.status !== "approved") return res.status(200).send("not-approved");

      const [eventId, userId] = (payment.external_reference || "").split(":");
      if (!eventId || !userId) return res.status(200).send("no-ref");

      const db = admin.firestore();
      const payDocId = `mp_${paymentId}`;
      const existing = await db.collection("payments").doc(payDocId).get();
      if (existing.exists) return res.status(200).send("duplicate");

      const eventSnap = await db.collection("events").doc(eventId).get();
      const eventData = eventSnap.exists ? eventSnap.data() : {};

      await db.collection("payments").doc(payDocId).set({
        paymentIntentId: payDocId,
        processor: "mercadopago",
        mpPaymentId: String(paymentId),
        userId,
        hostId: hostIdOf(eventData) || null,
        eventId,
        eventTitle: eventData.title || "",
        amount: Math.round((payment.transaction_amount || 0) * 100),
        currency: "mxn",
        status: "succeeded",
        hostPayoutOwed: payment.metadata?.event_price ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("events").doc(eventId).update({
        attendees: admin.firestore.FieldValue.arrayUnion(userId),
      });

      return res.status(200).send("ok");
    } catch (e) {
      console.error("mercadoPagoWebhook:", e);
      return res.status(200).send("error");
    }
  },
);
