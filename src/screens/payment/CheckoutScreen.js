import Icon from "../../components/Icon";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { CardField, useConfirmPayment } from "@stripe/stripe-react-native";
import { doc, updateDoc, arrayUnion, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../services/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import {
  createEventPaymentIntent,
  formatMXN,
} from "../../services/stripeService";
import { savePaymentRecord } from "../../services/paymentService";
import { createNotification } from "../../utils/notificationService";
import { isUserAttending } from "../../utils/eventHelpers";
import { estimateCheckout } from "../../utils/pricing";
import { getPricingConfig } from "../../services/configService";
import { startMercadoPagoCheckout } from "../../services/mercadoPagoService";

/**
 * Wait until the webhook adds the user to the event's attendees array.
 * Resolves as soon as attendance is confirmed, or after timeoutMs as a
 * fallback so the user is never stuck if the webhook is slow.
 * @param {string} eventId
 * @param {string} userId
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} true if confirmed, false if timed out
 */
function waitForAttendance(eventId, userId, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(confirmed);
    };

    const unsubscribe = onSnapshot(
      doc(db, "events", eventId),
      (snap) => {
        if (snap.exists() && isUserAttending(snap.data().attendees, userId)) {
          finish(true);
        }
      },
      () => finish(false)
    );

    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

export default function CheckoutScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { confirmPayment, loading: confirmLoading } = useConfirmPayment();

  const { eventId, eventTitle, amount } = route.params;

  const [processor, setProcessor] = useState("stripe");
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    getPricingConfig().then(setCfg);
  }, []);

  // Estimated fee breakdown (server is the source of truth for the real charge).
  const feeOverrides = cfg
    ? {
        platformFeePercent: cfg.eventPlatformFeePercent,
        ...(processor === "stripe"
          ? { processorPercent: cfg.stripeFeePercent, processorFixed: cfg.stripeFixedCentavos }
          : {}),
      }
    : {};
  const {
    platformFeeCentavos: platformFee,
    stripeFeeCentavos: stripeFee,
    totalCentavos: totalAmount,
  } = estimateCheckout(amount, processor, feeOverrides);

  // Detect the host's payout processor (Stripe vs Mercado Pago).
  useEffect(() => {
    (async () => {
      try {
        const evSnap = await getDoc(doc(db, "events", eventId));
        const hostId = evSnap.exists()
          ? evSnap.data().creatorId ||
            evSnap.data().createdBy ||
            evSnap.data().hostId
          : null;
        if (hostId) {
          const hostSnap = await getDoc(doc(db, "users", hostId));
          if (
            hostSnap.exists() &&
            hostSnap.data().hostConfig?.payoutProcessor === "mercadopago"
          ) {
            setProcessor("mercadopago");
          }
        }
      } catch (e) {
        // default to stripe
      }
    })();
  }, [eventId]);

  const handleMercadoPago = async () => {
    setProcessing(true);
    try {
      await startMercadoPagoCheckout(eventId, amount);
      const ok = await waitForAttendance(eventId, auth.currentUser.uid, 90000);
      Alert.alert(
        ok ? t("paymentCheckout.paymentSuccessfulTitle") : t("paymentCheckout.almostThereTitle"),
        ok
          ? t("paymentCheckout.joinedEvent", { eventTitle })
          : t("paymentCheckout.confirmingSpot"),
        [
          {
            text: t("paymentCheckout.ok"),
            onPress: () =>
              navigation.replace("EventDetail", { eventId, shouldReload: true }),
          },
        ]
      );
    } catch (e) {
      Alert.alert(
        t("paymentCheckout.mercadoPago"),
        e.message || t("paymentCheckout.couldNotStartCheckout")
      );
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!cardComplete) {
      Alert.alert(t("paymentCheckout.incompleteCardTitle"), t("paymentCheckout.incompleteCardMessage"));
      return;
    }

    // Dismiss keyboard before processing
    Keyboard.dismiss();

    setProcessing(true);
    console.log("💳 Starting payment process...");

    try {
      // 1. Create Payment Intent
      console.log("🔐 Creating payment intent...");
      const { clientSecret, paymentIntentId, split } =
        await createEventPaymentIntent(eventId, auth.currentUser.uid, amount);

      console.log(`Payment Intent created: ${paymentIntentId}`);

      // 2. Confirm Payment with Stripe
      console.log("💰 Confirming payment with Stripe...");
      const { paymentIntent, error } = await confirmPayment(clientSecret, {
        paymentMethodType: "Card",
      });

      if (error) {
        console.error("❌ Payment failed:", error);
        Alert.alert(
          t("paymentCheckout.paymentFailedTitle"),
          error.message || t("paymentCheckout.paymentErrorMessage"),
        );
        setProcessing(false);
        return;
      }

      console.log("✅ Payment succeeded!");

      // NOTE: Webhook will handle:
      // - Saving payment record
      // - Adding user to attendees
      // - Sending push notification to host

      // ⭐ Wait for the webhook to actually add the user to attendees,
      // instead of guessing with a fixed delay. Falls back after 10s.
      console.log("⏳ Waiting for webhook to confirm attendance...");
      await waitForAttendance(eventId, auth.currentUser.uid, 10000);

      // Show success and navigate with reload flag
      Alert.alert(
        t("paymentCheckout.paymentSuccessfulExclaim"),
        t("paymentCheckout.joinedEventHostNotified", { eventTitle }),
        [
          {
            text: t("paymentCheckout.ok"),
            onPress: () => {
              // ⭐ Navigate with shouldReload flag
              navigation.replace("EventDetail", {
                eventId,
                shouldReload: true,
              });
            },
          },
        ],
      );
    } catch (error) {
      console.error("❌ Payment error:", error);
      // BUG 32.6: the business owner hasn't finished Stripe setup — a clear,
      // owner-specific message (the buyer/staff can't fix it themselves).
      const ownerIncomplete = /owner_stripe_incomplete|business_owner_stripe_incomplete/.test(error?.message || "");
      Alert.alert(
        t("paymentCheckout.paymentErrorTitle"),
        ownerIncomplete ? t("business.ownerStripeIncomplete") : t("paymentCheckout.paymentErrorRetryMessage"),
      );
    } finally {
      setProcessing(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Icon name="back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t("paymentCheckout.title")}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Event Info */}
            <View
              style={[
                styles.eventCard,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.eventTitle, { color: colors.text }]}>
                {eventTitle}
              </Text>
              <Text style={[styles.eventPrice, { color: colors.primary }]}>
                {formatMXN(amount)}
              </Text>
            </View>

            {/* Pricing Breakdown */}
            <View
              style={[
                styles.breakdownCard,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.breakdownTitle, { color: colors.text }]}>
                {t("paymentCheckout.pricingBreakdown")}
              </Text>

              <View style={styles.breakdownRow}>
                <Text
                  style={[
                    styles.breakdownLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t("paymentCheckout.ticketPrice")}
                </Text>
                <Text style={[styles.breakdownValue, { color: colors.text }]}>
                  {formatMXN(amount)}
                </Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text
                  style={[
                    styles.breakdownLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t("paymentCheckout.platformFee")}
                </Text>
                <Text style={[styles.breakdownValue, { color: colors.text }]}>
                  {formatMXN(platformFee)}
                </Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text
                  style={[
                    styles.breakdownLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t("paymentCheckout.processingFee")}
                </Text>
                <Text style={[styles.breakdownValue, { color: colors.text }]}>
                  {formatMXN(stripeFee)}
                </Text>
              </View>

              <View
                style={[styles.divider, { backgroundColor: colors.border }]}
              />

              <View style={styles.breakdownRow}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>
                  {t("paymentCheckout.total")}
                </Text>
                <Text style={[styles.totalValue, { color: colors.primary }]}>
                  {formatMXN(totalAmount)}
                </Text>
              </View>
            </View>

            {processor === "mercadopago" ? (
              <>
                {/* Mercado Pago — hosted checkout */}
                <View
                  style={[
                    styles.cardFieldContainer,
                    {
                      backgroundColor: colors.surfaceGlass,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.cardLabel, { color: colors.text }]}>
                    {t("paymentCheckout.mercadoPago")}
                  </Text>
                  <Text
                    style={[
                      styles.securityText,
                      { color: colors.textSecondary, marginTop: 6 },
                    ]}
                  >
                    {t("paymentCheckout.mercadoPagoDescription")}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.payButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: processing ? 0.5 : 1,
                    },
                  ]}
                  onPress={handleMercadoPago}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.payButtonText}>
                      {t("paymentCheckout.continueWithMercadoPago")}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Card Input */}
                <View
                  style={[
                    styles.cardFieldContainer,
                    {
                      backgroundColor: colors.surfaceGlass,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.cardLabel, { color: colors.text }]}>
                    {t("paymentCheckout.cardDetails")}
                  </Text>
                  <CardField
                    postalCodeEnabled={false}
                    placeholders={{
                      number: "4242 4242 4242 4242",
                    }}
                    cardStyle={{
                      backgroundColor: colors.surface,
                      textColor: colors.text,
                      placeholderColor: colors.textTertiary,
                    }}
                    style={styles.cardField}
                    onCardChange={(cardDetails) => {
                      setCardComplete(cardDetails.complete);
                    }}
                  />
                </View>

                {/* Security Message */}
                <View style={styles.securityRow}>
                  <Icon name="lock" size={16} color={colors.textSecondary} />
                  <Text
                    style={[styles.securityText, { color: colors.textSecondary }]}
                  >
                    {t("paymentCheckout.securePayment")}
                  </Text>
                </View>

                {/* Pay Button */}
                <TouchableOpacity
                  style={[
                    styles.payButton,
                    {
                      backgroundColor: cardComplete
                        ? colors.primary
                        : colors.border,
                      opacity: processing || !cardComplete ? 0.5 : 1,
                    },
                  ]}
                  onPress={handlePayment}
                  disabled={!cardComplete || processing || confirmLoading}
                >
                  {processing || confirmLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.payButtonText}>
                      {t("paymentCheckout.pay", { amount: formatMXN(totalAmount) })}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Terms */}
            <Text style={[styles.termsText, { color: colors.textTertiary }]}>
              {t("paymentCheckout.termsAgreement")}
            </Text>

            {/* Extra padding for keyboard */}
            <View style={{ height: 100 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 16,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
    },
    backIcon: {
      fontSize: 28,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
    },
    eventCard: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
    },
    eventTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 8,
    },
    eventPrice: {
      fontSize: 28,
      fontWeight: "800",
    },
    breakdownCard: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
    },
    breakdownTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 16,
    },
    breakdownRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    breakdownLabel: {
      fontSize: 14,
    },
    breakdownValue: {
      fontSize: 14,
      fontWeight: "600",
    },
    divider: {
      height: 1,
      marginVertical: 12,
    },
    totalLabel: {
      fontSize: 16,
      fontWeight: "700",
    },
    totalValue: {
      fontSize: 20,
      fontWeight: "800",
    },
    cardFieldContainer: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
    },
    cardLabel: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 12,
    },
    cardField: {
      width: "100%",
      height: 50,
    },
    securityRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    lockIcon: {
      fontSize: 16,
      marginRight: 6,
    },
    securityText: {
      fontSize: 13,
    },
    payButton: {
      borderRadius: 16,
      paddingVertical: 18,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    payButtonText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
    },
    termsText: {
      fontSize: 12,
      textAlign: "center",
      lineHeight: 18,
    },
  });
}
