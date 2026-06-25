import React, { useState } from "react";
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
import { CardField, useConfirmPayment } from "@stripe/stripe-react-native";
import { doc, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import { auth, db } from "../../services/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import {
  createEventPaymentIntent,
  formatMXN,
} from "../../services/stripeService";
import { savePaymentRecord } from "../../services/paymentService";
import { createNotification } from "../../utils/notificationService";

export default function CheckoutScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { confirmPayment, loading: confirmLoading } = useConfirmPayment();

  const { eventId, eventTitle, amount } = route.params;

  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handlePayment = async () => {
    if (!cardComplete) {
      Alert.alert("Incomplete Card", "Please enter complete card details");
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
          "Payment Failed",
          error.message || "There was an error processing your payment",
        );
        setProcessing(false);
        return;
      }

      console.log("✅ Payment succeeded!");

      // NOTE: Webhook will handle:
      // - Saving payment record
      // - Adding user to attendees
      // - Sending push notification to host

      // ⭐ Wait 2 seconds for webhook to process
      console.log("⏳ Waiting for webhook to process...");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Show success and navigate with reload flag
      Alert.alert(
        "Payment Successful! 🎉",
        `You've successfully joined "${eventTitle}". The host will be notified.`,
        [
          {
            text: "OK",
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
      Alert.alert(
        "Payment Error",
        "There was an error processing your payment. Please try again.",
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
            <Text style={[styles.backIcon, { color: colors.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Checkout
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
                Pricing Breakdown
              </Text>

              <View style={styles.breakdownRow}>
                <Text
                  style={[
                    styles.breakdownLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  Ticket Price
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
                  Platform Fee (5%)
                </Text>
                <Text style={[styles.breakdownValue, { color: colors.text }]}>
                  Included
                </Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text
                  style={[
                    styles.breakdownLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  Processing Fee
                </Text>
                <Text style={[styles.breakdownValue, { color: colors.text }]}>
                  Included
                </Text>
              </View>

              <View
                style={[styles.divider, { backgroundColor: colors.border }]}
              />

              <View style={styles.breakdownRow}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>
                  Total
                </Text>
                <Text style={[styles.totalValue, { color: colors.primary }]}>
                  {formatMXN(amount)}
                </Text>
              </View>
            </View>

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
                Card Details
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
              <Text style={styles.lockIcon}>🔒</Text>
              <Text
                style={[styles.securityText, { color: colors.textSecondary }]}
              >
                Your payment is secure and encrypted
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
                  Pay {formatMXN(amount)}
                </Text>
              )}
            </TouchableOpacity>

            {/* Terms */}
            <Text style={[styles.termsText, { color: colors.textTertiary }]}>
              By completing this purchase you agree to our Terms of Service and
              Privacy Policy
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
