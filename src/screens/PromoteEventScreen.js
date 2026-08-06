import React, { useState, useEffect } from "react";
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
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import {
  PROMOTION_PLANS,
  getFeaturedPlans,
  formatPromoPrice,
  createPromotionPaymentIntent,
  createServicePromotionPaymentIntent,
} from "../services/promotionService";

export default function PromoteEventScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { confirmPayment } = useConfirmPayment();
  // KIN-185: this screen now sells featured placement for EITHER an event or
  // a service — same ladder, same charge, same webhook. A service is
  // identified by bizId + sessionTypeId; with neither present this behaves
  // exactly as it did for events.
  const { eventId, eventTitle, bizId, sessionTypeId, serviceName } =
    route.params || {};
  const isService = !!(bizId && sessionTypeId);
  const targetTitle = isService ? serviceName : eventTitle;

  // Seeded with the bundled fallback so the ladder renders immediately, then
  // replaced by config/featuredPricing — never an empty list or a "$0" flash.
  const [plans, setPlans] = useState(PROMOTION_PLANS);
  const [selectedPlan, setSelectedPlan] = useState(PROMOTION_PLANS[0].id);
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let alive = true;
    // Display-only: the server re-reads the same catalog when it builds the
    // PaymentIntent, so a stale price here can misdisplay but never mischarge.
    getFeaturedPlans()
      .then((live) => {
        if (alive && live.length) setPlans(live);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const plan = plans.find((p) => p.id === selectedPlan) || plans[0];

  const handlePay = async () => {
    if (!cardComplete) {
      Alert.alert(t("promoteEvent.incompleteCardTitle"), t("promoteEvent.incompleteCardMsg"));
      return;
    }
    Keyboard.dismiss();
    setProcessing(true);
    try {
      const intent = isService
        ? await createServicePromotionPaymentIntent(bizId, sessionTypeId, selectedPlan)
        : await createPromotionPaymentIntent(eventId, selectedPlan);
      if (!intent.success) {
        Alert.alert(t("promoteEvent.couldntStartTitle"), intent.error || t("promoteEvent.tryAgain"));
        setProcessing(false);
        return;
      }
      const { error } = await confirmPayment(intent.clientSecret, {
        paymentMethodType: "Card",
      });
      if (error) {
        Alert.alert(t("promoteEvent.paymentFailedTitle"), error.message || t("promoteEvent.pleaseTryAgain"));
        setProcessing(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
      Alert.alert(
        t("promoteEvent.featuredTitle"),
        t("promoteEvent.featuredMsg", { title: targetTitle, days: plan.days }),
        [{ text: t("promoteEvent.done"), onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      console.error("❌ Promotion payment error:", e);
      Alert.alert(t("promoteEvent.errorTitle"), t("promoteEvent.errorMsg"));
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
                {t("promoteEvent.headerTitle")}
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
                  {t("promoteEvent.heroTitle")}
                </Text>
                <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                  {t("promoteEvent.heroSub")}
                </Text>
                {!!targetTitle && (
                  <Text style={[styles.eventName, { color: colors.primary }]} numberOfLines={1}>
                    {targetTitle}
                  </Text>
                )}
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>
                {t("promoteEvent.chooseDuration")}
              </Text>
              {plans.map((p) => {
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
                      {t("promoteEvent.planFeatured", { label: p.label })}
                    </Text>
                    <Text style={[styles.planPrice, { color: colors.primary }]}>
                      {formatPromoPrice(p.priceCentavos)}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
                {t("promoteEvent.cardDetails")}
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
                      {t("promoteEvent.pay", { amount: formatPromoPrice(plan.priceCentavos) })}
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
