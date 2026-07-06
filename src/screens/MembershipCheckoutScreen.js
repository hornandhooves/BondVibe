import Icon from "../components/Icon";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { CardField, useConfirmPayment } from "@stripe/stripe-react-native";
import { useTheme } from "../contexts/ThemeContext";
import {
  createMembershipPaymentIntent,
  formatPlanPrice,
  describePlan,
} from "../services/membershipService";
import { estimateCheckout } from "../utils/pricing";
import { getPricingConfig, overridesFor } from "../services/configService";

export default function MembershipCheckoutScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { confirmPayment } = useConfirmPayment();
  const { plan } = route.params;

  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    getPricingConfig().then(setCfg);
  }, []);

  // Estimated fee breakdown (server is the source of truth for the real charge).
  const amount = plan.priceCentavos;
  const {
    platformFeeCentavos: platformFee,
    stripeFeeCentavos: stripeFee,
    totalCentavos: totalAmount,
  } = estimateCheckout(amount, "stripe", overridesFor(cfg, "event"));

  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handlePay = async () => {
    if (!cardComplete) {
      Alert.alert("Incomplete card", "Please enter complete card details.");
      return;
    }
    Keyboard.dismiss();
    setProcessing(true);

    try {
      const intent = await createMembershipPaymentIntent(plan.id);
      if (!intent.success) {
        Alert.alert("Couldn't start purchase", intent.error || "Try again.");
        setProcessing(false);
        return;
      }

      const { paymentIntent, error } = await confirmPayment(intent.clientSecret, {
        paymentMethodType: "Card",
      });

      if (error) {
        Alert.alert("Payment failed", error.message || "Please try again.");
        setProcessing(false);
        return;
      }

      // The webhook creates the membership; give it a moment, then continue.
      await new Promise((r) => setTimeout(r, 2000));

      Alert.alert(
        "Membership active!",
        `You purchased "${plan.name}".`,
        [
          {
            text: "View my memberships",
            onPress: () =>
              navigation.replace("MyMemberships", { shouldReload: true }),
          },
        ]
      );
    } catch (e) {
      console.error("❌ Membership purchase error:", e);
      Alert.alert("Error", "There was a problem processing your payment.");
      setProcessing(false);
    }
  };

  const styles = createStyles(colors, isDark);

  const Row = ({ label, value, strong }) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: strong ? colors.text : colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          { color: strong ? colors.text : colors.textSecondary, fontWeight: strong ? "700" : "500" },
        ]}
      >
        {value}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Icon name="back" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Checkout</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.planCard}>
              <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
              <Text style={[styles.planMeta, { color: colors.textSecondary }]}>
                {describePlan(plan)}
              </Text>
            </View>

            <View style={styles.breakdown}>
              <Row label="Plan" value={formatPlanPrice(amount)} />
              <Row label="Service fee" value={formatPlanPrice(platformFee)} />
              <Row label="Processing fee" value={formatPlanPrice(stripeFee)} />
              <View style={styles.divider} />
              <Row label="Total" value={formatPlanPrice(totalAmount)} strong />
            </View>

            <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>
              Card details
            </Text>
            <CardField
              postalCodeEnabled={false}
              placeholders={{ number: "4242 4242 4242 4242" }}
              cardStyle={{
                backgroundColor: isDark ? "#1C1C2E" : "#FFFFFF",
                textColor: colors.text,
                placeholderColor: colors.textTertiary,
              }}
              style={styles.cardField}
              onCardChange={(d) => setCardComplete(d.complete)}
            />

            <TouchableOpacity
              style={styles.payButton}
              onPress={handlePay}
              disabled={processing}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.payGlass,
                  {
                    backgroundColor: `${colors.primary}33`,
                    borderColor: `${colors.primary}66`,
                    opacity: processing ? 0.6 : 1,
                  },
                ]}
              >
                {processing ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.payText, { color: colors.primary }]}>
                    Pay {formatPlanPrice(totalAmount)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    planCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
      padding: 18,
      marginBottom: 20,
    },
    planName: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
    planMeta: { fontSize: 14 },
    breakdown: { marginBottom: 24 },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
    rowLabel: { fontSize: 14 },
    rowValue: { fontSize: 14 },
    divider: {
      height: 1,
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
      marginVertical: 8,
    },
    cardLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
    cardField: { width: "100%", height: 50, marginBottom: 24 },
    payButton: { borderRadius: 14, overflow: "hidden" },
    payGlass: {
      borderWidth: 1,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 54,
    },
    payText: { fontSize: 16, fontWeight: "700" },
  });
}
