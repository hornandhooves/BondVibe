// ============================================
// REFUND POLICY & IMPLEMENTATION
// functions/stripe/refunds.js
// ============================================

const functions = require("firebase-functions/v2");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const {tPush, baseLang} = require("../i18n"); // BUG 34: localized notification strings
const {sendBatchPushNotifications} = require("../notifications/pushService");
const roster = require("../utils/roster");
const {isAdminUid} = require("../lib/auth");
const db = admin.firestore();

// Define Stripe secret
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

/**
 * KIN-228 — avisar a los co-anfitriones de que un asistente se dio de baja.
 *
 * Hasta ahora sólo se enteraba el creador, pero un co-anfitrión también
 * gestiona el evento y también necesita saber que se liberó un lugar.
 *
 * Vive fuera del callable porque ahí dentro no es alcanzable en pruebas: para
 * un evento gratis `cancelEventAttendance` retorna antes de llegar aquí, y para
 * uno pagado hace falta un reembolso real de Stripe. Extraerlo es lo que
 * permite probar la parte que tiene reglas propias —no duplicar al creador, un
 * id por destinatario, aislar fallos— sin cobrar nada.
 *
 * Sin resumen agregado, a diferencia de KIN-227: aquí es UN asistente, no un
 * lote, así que los params que ya arma el bloque del creador alcanzan.
 *
 * @param {object} p datos de la baja
 * @param {string} p.eventId el evento
 * @param {object} p.eventData el documento del evento
 * @param {object} p.params params i18n ya construidos para el creador
 * @param {string} p.bodyKey variante de cuerpo (con o sin reembolso)
 * @param {number} p.pct porcentaje reembolsado, para metadata
 * @return {Promise<string[]>} los uids avisados
 */
async function notifyCoHostsOfAttendeeCancellation({
  eventId, eventData, params, bodyKey, pct,
}) {
  const coHosts = Array.isArray(eventData.coHosts) ? eventData.coHosts : [];
  const avisados = [];
  for (const coHostUid of coHosts) {
    // El creador ya recibió el suyo; no duplicar si además figura como
    // co-anfitrión por datos viejos.
    if (!coHostUid || coHostUid === eventData.creatorId) continue;
    if (avisados.includes(coHostUid)) continue; // uid repetido en el array
    try {
      // Su PROPIO doc y su PROPIO id: compartir el del creador dejaría que un
      // tap marcara leída la burbuja de otro (KIN-224).
      const coNotifRef = await db.collection("notifications").add({
        userId: coHostUid,
        type: "attendee_cancelled",
        title: tPush(
          "notifications.refund.attendeeCancelled.title", "en", params),
        message: tPush(bodyKey, "en", params),
        titleKey: "notifications.refund.attendeeCancelled.title",
        bodyKey,
        params,
        icon: "🚫",
        read: false,
        createdAt: new Date().toISOString(),
        metadata: {
          eventId: eventId,
          eventTitle: eventData.title,
          refundPercentage: pct,
        },
      });
      await pushToUser(coHostUid, {
        titleKey: "notifications.refund.attendeeCancelled.title",
        bodyKey,
        params,
        data: {
          type: "attendee_cancelled",
          eventId,
          notificationId: coNotifRef.id,
        },
      });
      avisados.push(coHostUid);
    } catch (e) {
      // Por co-anfitrión: que uno falle no puede dejar sin avisar a los demás,
      // ni tocar un reembolso que ya se completó.
      console.error(
        `⚠️ KIN-228 co-host notify failed (${coHostUid}):`, e.message || e);
    }
  }
  return avisados;
}

/**
 * KIN-226 — push for a cancellation notification.
 *
 * Cancelling an event wrote in-app bubbles and NOTHING else: there was no push
 * anywhere in this file, so an attendee whose paid event was cancelled found out
 * only by opening the app. That is the one notification in this codebase people
 * most need to receive while the phone is in their pocket.
 *
 * NEVER throws. It runs AFTER money has already moved — a refund that succeeded
 * must not be reported as a failed cancellation because Expo was unreachable.
 * The in-app bubble is already written by then, so a lost push degrades to
 * exactly the behaviour we had before this function existed.
 *
 * @param {string} uid recipient
 * @param {object} payload {titleKey, bodyKey, params, data}
 * @return {Promise<void>} always resolves
 */
async function pushToUser(uid, payload) {
  if (!uid) return;
  try {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return;
    const u = snap.data();
    if (!u.pushToken) return; // no token → the bubble is all they get
    await sendBatchPushNotifications([{
      pushToken: u.pushToken,
      uid,
      lang: baseLang(u.language), // recipient's own language, not the actor's
      ...payload,
    }]);
  } catch (e) {
    console.error("⚠️ KIN-226 push failed (refund unaffected):", e.message || e);
  }
}

// ============================================
// STRIPE FEE CONFIGURATION
// ============================================

const STRIPE_FEES = {
  PERCENT: 0.029, // 2.9%
  FIXED_MXN: 300, // $3.00 MXN in centavos
};

/**
 * Calculate Stripe processing fee
 * @param {number} amountCentavos - Amount in centavos
 * @return {number} Stripe fee in centavos
 */
function calculateStripeFee(amountCentavos) {
  const percentFee = Math.floor(amountCentavos * STRIPE_FEES.PERCENT);
  const totalFee = percentFee + STRIPE_FEES.FIXED_MXN;
  return totalFee;
}

// ============================================
// REFUND POLICY CONFIGURATION
// ============================================

const REFUND_POLICY = {
  USER_CANCELLATION: {
    DAYS_7_PLUS: 1.0,
    DAYS_3_TO_7: 0.5,
    DAYS_LESS_3: 0.0,
  },
  HOST_CANCELLATION: 1.0,
  MIN_REFUND_HOURS: 2,
  // ✅ NEW: Stripe fees are NON-REFUNDABLE
  STRIPE_FEES_REFUNDABLE: false,
};

// ============================================
// CALCULATE REFUND PERCENTAGE
// ============================================

/**
 * Calculate refund percentage based on cancellation timing
 * @param {string} eventDate - ISO date string of the event
 * @param {string} cancelledBy - Who cancelled: 'user' or 'host'
 * @return {number} Refund percentage (0.0 to 1.0)
 */
function calculateRefundPercentage(eventDate, cancelledBy) {
  const now = new Date();
  const eventDateTime = new Date(eventDate);
  const hoursUntilEvent = (eventDateTime - now) / (1000 * 60 * 60);
  const daysUntilEvent = hoursUntilEvent / 24;

  if (cancelledBy === "host") {
    return REFUND_POLICY.HOST_CANCELLATION;
  }

  if (daysUntilEvent >= 7) {
    return REFUND_POLICY.USER_CANCELLATION.DAYS_7_PLUS;
  } else if (daysUntilEvent >= 3) {
    return REFUND_POLICY.USER_CANCELLATION.DAYS_3_TO_7;
  } else {
    return REFUND_POLICY.USER_CANCELLATION.DAYS_LESS_3;
  }
}

// ============================================
// PROCESS REFUND (UPDATED)
// ============================================

/**
 * Process a Stripe refund (deducting non-refundable Stripe fees)
 * @param {object} stripe - Stripe instance
 * @param {string} paymentIntentId - Stripe Payment Intent ID
 * @param {number} refundPercentage - Refund percentage (0.0 to 1.0)
 * @param {string} reason - Refund reason
 * @param {boolean} [includeFees=false] - Refund gross (fees included); used for
 *   host cancellations where the host absorbs the app + Stripe fees.
 * @return {Promise<object>} Refund result
 */
async function processRefund(
  stripe,
  paymentIntentId,
  refundPercentage,
  reason,
  includeFees = false,
) {
  try {
    console.log("💰 Processing refund:", {
      paymentIntentId: paymentIntentId,
      refundPercentage: refundPercentage,
      reason: reason,
    });

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent) {
      throw new Error("Payment Intent not found");
    }

    console.log("📋 Payment Intent status:", paymentIntent.status);
    console.log("📋 Amount already refunded:", paymentIntent.amount_refunded);

    if (paymentIntent.status === "canceled") {
      return {
        success: false,
        error: "Payment was canceled",
      };
    }

    if (paymentIntent.amount_refunded >= paymentIntent.amount) {
      return {
        success: false,
        error: "Payment already fully refunded",
      };
    }

    const metadata = paymentIntent.metadata || {};
    const totalPaid = paymentIntent.amount;
    const alreadyRefunded = paymentIntent.amount_refunded || 0;

    // NEW MODEL: Only event price is refundable (fees are NOT refundable)
    // Get eventPrice from metadata (what host set)
    let eventPrice = parseInt(metadata.eventPrice) || 0;

    // Fallback for old payments without new metadata
    if (!eventPrice) {
      // Old model: calculate based on total - fees
      const stripeFee = calculateStripeFee(totalPaid);
      eventPrice = totalPaid - stripeFee;
    }

    const platformFee = parseInt(metadata.platformFee) || 0;
    const stripeFee = parseInt(metadata.stripeFee) || calculateStripeFee(totalPaid);
    // BUG 8: a host cancellation refunds GROSS — the attendee gets 100% back
    // INCLUDING the app + Stripe fees; the host absorbs them. Attendee-initiated
    // cancellations keep the fees non-refundable (tiered policy).
    const nonRefundableFees = includeFees ? 0 : platformFee + stripeFee;

    console.log("💵 NEW Fee breakdown:", {
      totalPaid: totalPaid,
      eventPrice: eventPrice,
      platformFee: platformFee,
      stripeFee: stripeFee,
      nonRefundableFees: nonRefundableFees,
      refundableAmount: eventPrice,
      feeModel: metadata.feeModel || "LEGACY",
    });

    // Host-cancel refunds the full charge (fees included); attendee-cancel only
    // the event price.
    const refundableAmount = includeFees ? totalPaid : eventPrice;
    const maxRefundable = Math.max(0, refundableAmount - alreadyRefunded);
    const desiredRefund = Math.floor(refundableAmount * refundPercentage);
    const refundAmount = Math.min(desiredRefund, maxRefundable);

    if (refundAmount <= 0) {
      return {
        success: false,
        error: "No refund available",
        refundPercentage: 0,
        feesRetained: nonRefundableFees,
      };
    }

    console.log("💵 Refund calculation:", {
      totalPaid: totalPaid,
      eventPrice: eventPrice,
      refundableAmount: refundableAmount,
      alreadyRefunded: alreadyRefunded,
      maxRefundable: maxRefundable,
      desiredRefund: desiredRefund,
      refundAmount: refundAmount,
      feesRetained: nonRefundableFees,
    });

    // ESCROW (docs/DISENO_escrow_pagos.md §5): the money sits in Kinlo's balance
    // until release. The refund path depends on the ledger state.
    //  - held (common): refund straight from Kinlo's balance — no reverse_transfer,
    //    no transfer happened, the host got $0. Trivial, no clawback.
    //  - released (rare): claw the host's transfer back first (createReversal),
    //    then refund. If the host has no balance it goes negative → future payouts.
    // Legacy payments without a ledger keep the pre-escrow behavior.
    const ledgerRef = db.collection("paymentLedger").doc(paymentIntentId);
    const ledgerSnap = await ledgerRef.get();
    const ledger = ledgerSnap.exists ? ledgerSnap.data() : null;

    if (ledger && ledger.state === "released" && ledger.transferId) {
      const transferred = Math.max(
        0, (ledger.hostAmount || 0) - (ledger.hostPenaltyOwed || 0));
      const reversalAmount = Math.min(refundAmount, transferred);
      if (reversalAmount > 0) {
        await stripe.transfers.createReversal(ledger.transferId, {
          amount: reversalAmount,
          metadata: {paymentIntentId, reason: reason || "refund"},
        });
        console.log("↩️ Transfer reversed:", ledger.transferId, reversalAmount);
      }
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: refundAmount,
      reason: reason || "requested_by_customer",
      metadata: {
        refund_percentage: refundPercentage * 100,
        total_paid: totalPaid,
        event_price: eventPrice,
        refunded_amount: refundAmount,
        fees_retained: nonRefundableFees,
        fee_model: "USER_PAYS_FEES",
      },
    });

    console.log("✅ Refund created:", refund.id);

    // Reflect the terminal money state on the ledger (§3 states).
    if (ledger) {
      const newState = ledger.state === "released" ? "reversed" : "refunded";
      await ledgerRef.set({
        state: newState,
        refundId: refund.id,
        refundedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }

    return {
      success: true,
      refund: {
        id: refund.id,
        amount: refundAmount,
        percentage: refundPercentage * 100,
        totalPaid: totalPaid,
        eventPrice: eventPrice,
        feesRetained: nonRefundableFees,
        stripeFeeRetained: nonRefundableFees,
        refundableAmount: refundableAmount,
        status: refund.status,
      },
    };
  } catch (error) {
    console.error("❌ Error processing refund:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ============================================
// CLOUD FUNCTION: USER CANCELLATION
// ============================================

exports.cancelEventAttendance = functions.https.onCall(
  {secrets: [stripeSecretKey]},
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated",
      );
    }

    const {eventId} = request.data;
    const userId = request.auth.uid;

    console.log("🚫 User cancelling attendance:", {
      eventId: eventId,
      userId: userId,
    });

    try {
      const stripe = require("stripe")(stripeSecretKey.value());

      const eventRef = db.collection("events").doc(eventId);
      const eventDoc = await eventRef.get();

      if (!eventDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Event not found");
      }

      const eventData = eventDoc.data();
      // ROSTER (fix/privacy-event-roster): membership is the existence of the
      // caller's roster doc, not the (removed) attendees array.
      const onRoster = await roster.isOnRoster(db, eventId, userId);
      if (!onRoster) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "User is not attending this event",
        );
      }

      const paymentsSnapshot = await db
        .collection("payments")
        .where("eventId", "==", eventId)
        .where("userId", "==", userId)
        .where("status", "==", "succeeded")
        .limit(1)
        .get();

      if (paymentsSnapshot.empty) {
        // Free RSVP → just leave the roster (frees a spot; trigger promotes).
        await roster.removeFromRoster(db, eventId, userId);

        console.log("✅ Removed from free event");
        return {
          success: true,
          refund: null,
          message: "Removed from free event",
        };
      }

      const paymentDoc = paymentsSnapshot.docs[0];
      const paymentData = paymentDoc.data();
      const paymentIntentId = paymentData.paymentIntentId;

      const refundPercentage = calculateRefundPercentage(
        eventData.date,
        "user",
      );
      console.log("📊 Refund percentage:", refundPercentage * 100 + "%");

      const refundResult = await processRefund(
        stripe,
        paymentIntentId,
        refundPercentage,
        "requested_by_customer",
      );

      // Paid cancel → leave the roster (decrements participantCount, frees a spot).
      await roster.removeFromRoster(db, eventId, userId);

      // ✅ UPDATED: Save stripeFeeRetained in payment record
      await paymentDoc.ref.update({
        status: refundResult.success ? "refunded" : "succeeded",
        refundAmount: refundResult.refund ? refundResult.refund.amount : 0,
        refundPercentage: refundPercentage * 100,
        refundedAt: refundResult.success ? new Date().toISOString() : null,
        stripeFeeRetained: refundResult.refund ?
          refundResult.refund.stripeFeeRetained :
          0,
        refundableAmount: refundResult.refund ?
          refundResult.refund.refundableAmount :
          0,
      });

      if (eventData.creatorId) {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data() || {};
        const userName = userData.name || userData.fullName || "Someone";

        // Recipient = the host. BUG 34: key+params; refund/no-refund is a
        // separate body key so both variants localize fully.
        const pct = refundPercentage * 100;
        const params = {name: userName, event: eventData.title, pct};
        const bodyKey = refundPercentage > 0 ?
          "notifications.refund.attendeeCancelled.bodyRefund" :
          "notifications.refund.attendeeCancelled.bodyNoRefund";
        // KIN-224: el id viaja en el push para que el tap marque ESTA burbuja.
        const notifRef = await db.collection("notifications").add({
          userId: eventData.creatorId,
          type: "attendee_cancelled",
          title: tPush("notifications.refund.attendeeCancelled.title", "en", params),
          message: tPush(bodyKey, "en", params),
          titleKey: "notifications.refund.attendeeCancelled.title",
          bodyKey,
          params,
          icon: "🚫",
          read: false,
          createdAt: new Date().toISOString(),
          metadata: {
            eventId: eventId,
            eventTitle: eventData.title,
            refundPercentage: pct,
          },
        });

        // KIN-226: alguien se dio de baja de SU evento — es acción de otra
        // persona, así que el push es correcto y era lo que faltaba.
        await pushToUser(eventData.creatorId, {
          titleKey: "notifications.refund.attendeeCancelled.title",
          bodyKey,
          params,
          data: {
            type: "attendee_cancelled",
            eventId,
            notificationId: notifRef.id,
          },
        });

        // KIN-228 — ver notifyCoHostsOfAttendeeCancellation.
        await notifyCoHostsOfAttendeeCancellation(
          {eventId, eventData, params, bodyKey, pct});
      }

      console.log("✅ Cancellation complete");

      // ✅ UPDATED: Include Stripe fee in message
      let resultMessage;
      if (refundPercentage > 0 && refundResult.refund) {
        const refundPesos = (refundResult.refund.amount / 100).toFixed(2);
        const stripFeePesos = (
          refundResult.refund.stripeFeeRetained / 100
        ).toFixed(2);
        resultMessage =
          `Refund of $${refundPesos} MXN processed ` +
          `(Stripe processing fee of $${stripFeePesos} MXN is non-refundable)`;
      } else {
        resultMessage = "No refund available (less than 3 days until event)";
      }

      return {
        success: true,
        refund: refundResult.refund,
        refundPercentage: refundPercentage * 100,
        message: resultMessage,
      };
    } catch (error) {
      console.error("❌ Error cancelling attendance:", error);
      throw new functions.https.HttpsError("internal", error.message);
    }
  },
);

// ============================================
// CLOUD FUNCTION: HOST CANCELS EVENT
// ============================================

exports.hostCancelEvent = functions.https.onCall(
  {secrets: [stripeSecretKey]},
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be authenticated",
      );
    }

    const {eventId, cancellationReason} = request.data;
    const userId = request.auth.uid;

    console.log("🏠 Host cancelling event:", {
      eventId: eventId,
      userId: userId,
      reason: cancellationReason,
    });

    try {
      const stripe = require("stripe")(stripeSecretKey.value());

      const eventRef = db.collection("events").doc(eventId);
      const eventDoc = await eventRef.get();

      if (!eventDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Event not found");
      }

      const eventData = eventDoc.data();

      console.log("📋 Event data:", {
        title: eventData.title,
        creatorId: eventData.creatorId,
        attendeesCount: eventData.participantCount || 0,
      });

      // Verify permission — admins are authorized via the claim-first helper
      // isAdminUid (defense-in-depth; matches the rest of functions/).
      if (eventData.creatorId !== userId) {
        if (!(await isAdminUid(userId))) {
          throw new functions.https.HttpsError(
            "permission-denied",
            "Only host or admin can cancel",
          );
        }
      }

      // Get payments with status 'succeeded'
      const paymentsSnapshot = await db
        .collection("payments")
        .where("eventId", "==", eventId)
        .where("status", "==", "succeeded")
        .get();

      console.log("💳 Payments with succeeded status:", paymentsSnapshot.size);

      const refundResults = [];
      const failedRefunds = [];

      // Process refunds (100% - but minus Stripe fees)
      for (const paymentDoc of paymentsSnapshot.docs) {
        const paymentData = paymentDoc.data();

        console.log("💵 Processing refund for:", {
          paymentId: paymentDoc.id,
          userId: paymentData.userId,
          paymentIntentId: paymentData.paymentIntentId,
          amount: paymentData.amount,
        });

        // Host cancelled → refund 100% INCLUDING fees (host absorbs them).
        const refundResult = await processRefund(
          stripe,
          paymentData.paymentIntentId,
          1.0,
          "requested_by_customer",
          true,
        );

        if (refundResult.success) {
          await paymentDoc.ref.update({
            status: "refunded",
            refundAmount: refundResult.refund.amount,
            refundPercentage: 100,
            refundedAt: new Date().toISOString(),
            refundReason: "event_cancelled_by_host",
            stripeFeeRetained: refundResult.refund.stripeFeeRetained,
            refundableAmount: refundResult.refund.refundableAmount,
          });

          refundResults.push({
            paymentId: paymentDoc.id,
            userId: paymentData.userId,
            amount: refundResult.refund.amount,
            stripeFeeRetained: refundResult.refund.stripeFeeRetained,
          });

          // ESCROW §6: HOST cancelled → attendee refunded in full (fees
          // included). The unrecoverable Stripe processing fee is charged to the
          // host as a penalty on their per-host debt, netted from their next
          // release (§4). Never absorbed by Kinlo. The ledger is authoritative
          // for the fee amount + the payout host.
          const ledSnap = await db
            .collection("paymentLedger")
            .doc(paymentData.paymentIntentId)
            .get();
          const led = ledSnap.exists ? ledSnap.data() : null;
          // KIN-163: prefer the REAL fee when measured, so the host penalty
          // matches what Stripe actually kept — not the pre-charge estimate.
          // Falls back to the estimate on the ledger (older payments, or a
          // failed measurement), then to payment-doc metadata (pre-ledger
          // payments) as a last resort.
          const penaltyFee = (led && Number.isFinite(led.actualStripeFee) && led.actualStripeFee > 0) ?
            led.actualStripeFee :
            led ?
              (led.stripeFee || 0) :
              (parseInt((paymentData.metadata || {}).stripeFee, 10) || 0);
          const payoutHostUid = led ?
            led.hostUid :
            (eventData.businessOwnerUid || eventData.creatorId);
          if (penaltyFee > 0 && payoutHostUid) {
            await db.collection("hostPayoutAccounts").doc(payoutHostUid).set({
              penaltyOwed: FieldValue.increment(penaltyFee),
              updatedAt: FieldValue.serverTimestamp(),
            }, {merge: true});
          }

          // Notify user (recipient = the refunded attendee). BUG 34: key+params.
          const refundPesos = (refundResult.refund.amount / 100).toFixed(2);
          const params = {event: eventData.title, amount: refundPesos};

          // KIN-224: el id viaja en el push (ver abajo).
          const notifRef = await db.collection("notifications").add({
            userId: paymentData.userId,
            type: "event_cancelled_refund",
            title: tPush("notifications.refund.eventCancelled.title", "en", params),
            message: tPush("notifications.refund.eventCancelled.body", "en", params),
            titleKey: "notifications.refund.eventCancelled.title",
            bodyKey: "notifications.refund.eventCancelled.body",
            params,
            icon: "💰",
            read: false,
            createdAt: new Date().toISOString(),
            metadata: {
              eventId: eventId,
              eventTitle: eventData.title,
              refundAmount: refundResult.refund.amount,
              stripeFeeRetained: refundResult.refund.stripeFeeRetained,
              reason: cancellationReason || "No reason provided",
            },
          });

          // KIN-226: el hueco principal. A alguien le cancelaron un evento que
          // pagó y sólo se enteraba abriendo la app.
          await pushToUser(paymentData.userId, {
            titleKey: "notifications.refund.eventCancelled.title",
            bodyKey: "notifications.refund.eventCancelled.body",
            params,
            data: {
              type: "event_cancelled_refund",
              eventId,
              notificationId: notifRef.id,
            },
          });

          console.log("✅ Refund successful for user:", paymentData.userId);
        } else {
          console.log(
            "❌ Refund failed:",
            paymentData.userId,
            refundResult.error,
          );
          failedRefunds.push({
            userId: paymentData.userId,
            error: refundResult.error,
          });
        }
      }

      // Update event status
      await eventRef.update({
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancellationReason: cancellationReason || "No reason provided",
        cancelledBy: userId,
      });

      // SOCIAL GIFTING (gate E): gift money lives in the separate giftLedger, so
      // the payments-refund loop above never touched it. Refund every live gift
      // on this event to its gifter and mark both views 'event_cancelled'.
      let giftsRefunded = 0;
      try {
        giftsRefunded = await require("./gifting").refundEventGiftsOnCancel(eventId);
      } catch (e) {
        console.error("gift refund on cancel failed:", e.message);
      }
      if (giftsRefunded) console.log(`↩️ refunded ${giftsRefunded} gifts`);

      // Lo compartido entre el resumen del actor y el de los co-anfitriones se
      // calcula una vez: los dos describen la MISMA cancelación y sólo cambian
      // de voz. Duplicarlo es como acaban diciendo cifras distintas.
      const refundedCentavos = refundResults
        .reduce((sum, r) => sum + (r.amount || 0), 0);
      const summaryParams = {
        event: eventData.title,
        count: refundResults.length,
        amount: (refundedCentavos / 100).toFixed(2),
      };
      const summaryMetadata = {
        eventId: eventId,
        eventTitle: eventData.title,
        refundsProcessed: refundResults.length,
        refundedCentavos,
        failedRefunds: failedRefunds.length,
      };
      /**
       * Variante de cuerpo según cuántos reembolsos hubo. Decir "1 reembolso"
       * en un evento gratis sería mentir sobre dinero.
       * @param {string} prefix raíz de la llave i18n
       * @return {string} la llave concreta
       */
      const summaryBodyKey = (prefix) => refundResults.length === 0 ?
        `${prefix}.bodyNone` :
        (refundResults.length === 1 ? `${prefix}.bodyOne` : `${prefix}.bodyOther`);

      // KIN-226: el host no recibía NADA por cancelar su propio evento. Sólo
      // veía algo por accidente, cuando además había pagado algo en ese evento
      // (p.ej. una promoción Featured) y le tocaba reembolso como pagador.
      //
      // Se escribe la burbuja pero NO se manda push: el host acaba de pulsar el
      // botón y tiene el teléfono en la mano. Empujarle una notificación por su
      // propia acción es ruido; lo que sí le sirve es el registro con la cuenta
      // de reembolsos.
      try {
        const hostBodyKey = summaryBodyKey("notifications.refund.hostCancelled");
        await db.collection("notifications").add({
          userId: userId, // el host que canceló
          type: "host_cancelled_event",
          title: tPush("notifications.refund.hostCancelled.title", "en", summaryParams),
          message: tPush(hostBodyKey, "en", summaryParams),
          titleKey: "notifications.refund.hostCancelled.title",
          bodyKey: hostBodyKey,
          params: summaryParams,
          icon: "block",
          read: false,
          createdAt: new Date().toISOString(),
          metadata: summaryMetadata,
        });
      } catch (e) {
        // Igual que el push: el resumen no puede tumbar una cancelación hecha.
        console.error("⚠️ KIN-226 host summary failed:", e.message || e);
      }

      // KIN-227: los co-anfitriones no se enteraban de nada. hostCancelEvent
      // sólo deja cancelar al creatorId, así que para un co-host la cancelación
      // SIEMPRE es acción de otra persona — igual que para un asistente. Por eso
      // aquí sí va push, a diferencia del resumen del actor.
      const coHosts = Array.isArray(eventData.coHosts) ? eventData.coHosts : [];
      for (const coHostUid of coHosts) {
        // El creador ya recibió el suyo arriba; no duplicar si además figura
        // como co-host por datos viejos.
        if (!coHostUid || coHostUid === userId) continue;
        try {
          const coBodyKey =
            summaryBodyKey("notifications.refund.hostCancelledCoHost");
          const notifRef = await db.collection("notifications").add({
            userId: coHostUid,
            type: "host_cancelled_event",
            title: tPush(
              "notifications.refund.hostCancelledCoHost.title", "en", summaryParams),
            message: tPush(coBodyKey, "en", summaryParams),
            titleKey: "notifications.refund.hostCancelledCoHost.title",
            bodyKey: coBodyKey,
            params: summaryParams,
            icon: "block",
            read: false,
            createdAt: new Date().toISOString(),
            metadata: summaryMetadata,
          });
          await pushToUser(coHostUid, {
            titleKey: "notifications.refund.hostCancelledCoHost.title",
            bodyKey: coBodyKey,
            params: summaryParams,
            data: {
              type: "host_cancelled_event",
              eventId,
              notificationId: notifRef.id, // KIN-224
            },
          });
        } catch (e) {
          // Por co-host: que uno falle no puede dejar sin avisar a los demás.
          console.error(
            `⚠️ KIN-227 co-host notify failed (${coHostUid}):`, e.message || e);
        }
      }

      const logMsg =
        "✅ Event cancelled, " +
        refundResults.length +
        " refunds processed, " +
        failedRefunds.length +
        " failed";
      console.log(logMsg);

      return {
        success: true,
        refundsProcessed: refundResults.length,
        refunds: refundResults,
        failedRefunds: failedRefunds,
        // Host-cancel refunds gross — the host absorbs the fees (BUG 8), so the
        // old "(Stripe fees retained)" wording was wrong.
        message:
          "Event cancelled. " +
          refundResults.length +
          " attendees refunded in full (all fees included).",
      };
    } catch (error) {
      console.error("❌ Error cancelling event:", error);
      throw new functions.https.HttpsError("internal", error.message);
    }
  },
);

exports.notifyCoHostsOfAttendeeCancellation = notifyCoHostsOfAttendeeCancellation;
exports.REFUND_POLICY = REFUND_POLICY;
exports.calculateRefundPercentage = calculateRefundPercentage;
exports.calculateStripeFee = calculateStripeFee;
// ESCROW B3 §7 — exported so the escrow tests can drive the ledger-aware refund
// path directly (held → refund, released → reversal + refund) for rentals/services.
// It keys the ledger by paymentIntentId, so it is source-type agnostic.
exports.processRefund = processRefund;
