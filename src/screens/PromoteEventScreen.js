import React, { useState } from "react";
import Icon from "../components/Icon";
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
import GradientBackground from "../components/GradientBackground";
import {
  PROMOTION_PLANS,
  formatPromoPrice,
  createPromotionPaymentIntent,
} from "../services/promotionService";

export default function PromoteEventScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { confirmPayment } = useConfirmPayment();
  const { eventId, eventTitle } = route.params || {};

  const [selectedPlan, setSelectedPlan] = useState(PROMOTION_PLANS[0].id);
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);

  const plan = PROMOTION_PLANS.find((p) => p.id === selectedPlan);

  const handlePay = async () => {
    if (!cardComplete) {
      Alert.alert("Incomplete card", "Please enter complete card details.");
      return;
    }
    Keyboard.dismiss();
    setProcessing(true);
    try {
      const intent = await createPromotionPaymentIntent(eventId, selectedPlan);
      if (!intent.success) {
        Alert.alert("Couldn't start promotion", intent.error || "Try again.");
        setProcessing(false);
        return;
      }
      const { error } = await confirmPayment(intent.clientSecret, {
        paymentMethodType: "Card",
      });
      if (error) {
        Alert.alert("Payment failed", error.message || "Please try again.");
        setProcessing(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
      Alert.alert(
        "Your event is featured!",
        `"${eventTitle}" will appear in Featured for ${plan.days} days.`,
        [{ text: "Done", onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      console.error("❌ Promotion payment error:", e);
      Alert.alert("Error", "There was a problem processing your payment.");
      setProcessing(false);
    }
  };

  const styles = createStyles(colors, isDark);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Icon name="back" size={26} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                Promote Event
              </Text>
              <View style={{ width: 28 }} />
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.hero}>
                <View style={styles.heroIcon}>
                  <Icon name="ai" size={26} color={colors.primary} />
                </View>
                <Text style={[styles.heroTitle, { color: colors.text }]}>
                  Feature your event
                </Text>
                <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                  Appear in the Featured carousel on the home screen and reach
                  more people.
                </Text>
                {!!eventTitle && (
                  <Text style={[styles.eventName, { color: colors.primary }]} numberOfLines={1}>
                    {eventTitle}
                  </Text>
                )}
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                CHOOSE DURATION
              </Text>
              {PROMOTION_PLANS.map((p) => {
                const selected = p.id === selectedPlan;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setSelectedPlan(p.id)}
                    activeOpacity={0.85}
                    style={[
                      styles.planRow,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected
                          ? `${colors.primary}14`
                          : isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(255,255,255,0.85)",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.radio,
                        { borderColor: selected ? colors.primary : colors.border },
                      ]}
                    >
                      {selected && (
                        <View
                          style={[styles.radioDot, { backgroundColor: colors.primary }]}
                        />
                      )}
                    </View>
                    <Text style={[styles.planLabel, { color: colors.text }]}>
                      {p.label} featured
                    </Text>
                    <Text style={[styles.planPrice, { color: colors.primary }]}>
                      {formatPromoPrice(p.priceCentavos)}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
                CARD DETAILS
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
                      Pay {formatPromoPrice(plan.priceCentavos)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </GradientBackground>
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
    hero: { alignItems: "center", marginBottom: 24 },
    heroIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.primary}1F`,
      marginBottom: 12,
    },
    heroTitle: { fontSize: 22, fontWeight: "800" },
    heroSub: { fontSize: 14, textAlign: "center", lineHeight: 20, marginTop: 6 },
    eventName: { fontSize: 14, fontWeight: "700", marginTop: 10 },
    label: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 10 },
    planRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    radioDot: { width: 12, height: 12, borderRadius: 6 },
    planLabel: { flex: 1, fontSize: 16, fontWeight: "600" },
    planPrice: { fontSize: 16, fontWeight: "700" },
    cardField: { width: "100%", height: 50, marginBottom: 24, marginTop: 4 },
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
