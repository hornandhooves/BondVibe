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
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { reserveVehicle } from "../services/rentalService";
import { formatCentavos, estimateCheckout } from "../utils/pricing";
import { getPricingConfig, overridesFor } from "../services/configService";

export default function RentalCheckoutScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { confirmPayment } = useConfirmPayment();
  const { vehicle, days = 1, startAt, endAt, eventId, eventTitle } = route.params || {};

  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    getPricingConfig().then(setCfg);
  }, []);

  const fee = (vehicle?.pricePerDayCentavos || 0) * days;
  const deposit = vehicle?.depositCentavos || 0;
  const isFree = fee === 0;
  // Renter pays the rental fee + platform fee + Stripe fee (host gets 100%).
  const breakdown = isFree ? null : estimateCheckout(fee, "stripe", overridesFor(cfg, "rental"));
  const total = breakdown ? breakdown.totalCentavos : 0;

  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);

  const goActive = (rentalId) =>
    navigation.replace("ActiveRental", { rentalId });

  const handlePay = async () => {
    if (!isFree && !cardComplete) {
      Alert.alert(t("rentals.checkout.incompleteCardTitle"), t("rentals.checkout.incompleteCardMsg"));
      return;
    }
    Keyboard.dismiss();
    setProcessing(true);
    try {
      const res = await reserveVehicle({ vehicleId: vehicle.id, startAt, endAt, eventId });
      if (!res.success) {
        const messages = {
          vehicle_unavailable: t("rentals.checkout.vehicleUnavailable"),
          host_payouts_not_ready: t("rentals.checkout.hostPayoutsNotReady"),
          business_owner_stripe_incomplete: t("business.ownerStripeIncomplete"),
        };
        Alert.alert(t("rentals.checkout.couldntReserveTitle"), messages[res.error] || res.error || t("rentals.common.pleaseTryAgain"));
        setProcessing(false);
        return;
      }

      // Free vehicle — confirmed server-side, no payment needed.
      if (res.free) {
        goActive(res.rentalId);
        return;
      }

      // Charge the rental fee (paid directly to the host; Kinlo keeps a commission).
      if (res.clientSecret) {
        const { error } = await confirmPayment(res.clientSecret, { paymentMethodType: "Card" });
        if (error) {
          Alert.alert(t("rentals.checkout.paymentFailedTitle"), error.message || t("rentals.common.pleaseTryAgain"));
          setProcessing(false);
          return;
        }
      }

      // Webhook flips the rental to active — give it a moment.
      await new Promise((r) => setTimeout(r, 1500));
      goActive(res.rentalId);
    } catch {
      Alert.alert(t("rentals.checkout.errorTitle"), t("rentals.checkout.errorMsg"));
      setProcessing(false);
    }
  };

  const styles = createStyles(colors, isDark);
  const Row = ({ label, value, strong, hint }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: strong ? colors.text : colors.textSecondary }]}>{label}</Text>
        {!!hint && <Text style={[styles.rowHint, { color: colors.textTertiary }]}>{hint}</Text>}
      </View>
      <Text style={[styles.rowValue, { color: strong ? colors.text : colors.textSecondary, fontWeight: strong ? "800" : "500" }]}>
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t("rentals.checkout.title")}</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { borderColor: colors.border }]}>
              <Text style={[styles.vehName, { color: colors.text }]}>{vehicle?.title}</Text>
              <Text style={[styles.vehMeta, { color: colors.textSecondary }]}>
                {t("rentals.dayCount", { count: days })}{vehicle?.city ? ` · ${vehicle.city}` : ""}
              </Text>
              {eventId && (
                <Text style={[styles.vehMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                  {t("rentals.checkout.forEvent", { title: eventTitle || t("rentals.common.yourEvent") })}
                </Text>
              )}
            </View>

            <View style={styles.breakdown}>
              <Row label={t("rentals.checkout.rentalFee")} value={fee ? formatCentavos(fee) : t("rentals.common.free")} />
              {breakdown && (
                <>
                  <Row label={t("rentals.checkout.serviceFee")} value={formatCentavos(breakdown.platformFeeCentavos)} />
                  <Row label={t("rentals.checkout.processingFee")} value={formatCentavos(breakdown.stripeFeeCentavos)} />
                </>
              )}
              {deposit > 0 && (
                <Row
                  label={t("rentals.checkout.deposit")}
                  hint={t("rentals.checkout.depositHint")}
                  value={formatCentavos(deposit)}
                />
              )}
              <View style={styles.divider} />
              <Row label={t("rentals.checkout.chargedNow")} value={total ? formatCentavos(total) : t("rentals.common.free")} strong />
            </View>

            {!isFree && (
              <>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{t("rentals.checkout.cardDetails")}</Text>
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
              </>
            )}

            <TouchableOpacity
              style={[styles.payButton, { backgroundColor: colors.primary, opacity: processing ? 0.6 : 1 }]}
              onPress={handlePay}
              disabled={processing}
              activeOpacity={0.85}
            >
              {processing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.payText}>
                  {isFree ? t("rentals.checkout.reserveForFree") : t("rentals.checkout.pay", { amount: formatCentavos(total) })}
                </Text>
              )}
            </TouchableOpacity>
            <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>
              {t("rentals.checkout.disclaimer")}
            </Text>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    card: {
      borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 20,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
    },
    vehName: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
    vehMeta: { fontSize: 14, marginTop: 2 },
    breakdown: { marginBottom: 24 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
    rowLabel: { fontSize: 14 },
    rowHint: { fontSize: 11, marginTop: 2, maxWidth: 220 },
    rowValue: { fontSize: 14 },
    divider: { height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)", marginVertical: 8 },
    cardLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
    cardField: { width: "100%", height: 50, marginBottom: 24 },
    payButton: { borderRadius: 26, paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 54 },
    payText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    disclaimer: { fontSize: 12, marginTop: 16, textAlign: "center", lineHeight: 17 },
  });
}
