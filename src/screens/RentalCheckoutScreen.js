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
  // A hold that reserved OK but whose payment failed — retrying re-confirms the
  // SAME PaymentIntent instead of re-reserving (which would double-book / orphan
  // the first hold until the sweep). Cleared on success.
  const [pendingPay, setPendingPay] = useState(null); // { rentalId, clientSecret }

  const goActive = (rentalId) =>
    navigation.replace("ActiveRental", { rentalId });

  // Friendly copy per server error code (incl. the reservation-window / capacity
  // codes the server can return).
  const reserveErrorMsg = (code) => ({
    vehicle_unavailable: t("rentals.checkout.vehicleUnavailable"),
    dates_unavailable: t("rentals.checkout.datesUnavailable"),
    outside_availability: t("rentals.checkout.outsideAvailability"),
    host_payouts_not_ready: t("rentals.checkout.hostPayoutsNotReady"),
    business_owner_stripe_incomplete: t("business.ownerStripeIncomplete"),
    email_not_verified: t("rentals.checkout.emailNotVerified"),
  }[code] || code || t("rentals.common.pleaseTryAgain"));

  // Confirm (or re-confirm) a clientSecret; returns true on success.
  const confirmAndFinish = async (rentalId, clientSecret) => {
    const { error } = await confirmPayment(clientSecret, { paymentMethodType: "Card" });
    if (error) {
      setPendingPay({ rentalId, clientSecret }); // keep the hold for a retry
      Alert.alert(t("rentals.checkout.paymentFailedTitle"), error.message || t("rentals.common.pleaseTryAgain"));
      setProcessing(false);
      return false;
    }
    setPendingPay(null);
    await new Promise((r) => setTimeout(r, 1500)); // webhook flips rental → active
    goActive(rentalId);
    return true;
  };

  const handlePay = async () => {
    if (!isFree && !cardComplete) {
      Alert.alert(t("rentals.checkout.incompleteCardTitle"), t("rentals.checkout.incompleteCardMsg"));
      return;
    }
    Keyboard.dismiss();
    setProcessing(true);
    try {
      // Retry path: the hold already exists — just re-confirm its PaymentIntent.
      if (pendingPay) {
        await confirmAndFinish(pendingPay.rentalId, pendingPay.clientSecret);
        return;
      }

      const res = await reserveVehicle({ vehicleId: vehicle.id, startAt, endAt, eventId });
      if (!res.success) {
        Alert.alert(t("rentals.checkout.couldntReserveTitle"), reserveErrorMsg(res.error));
        setProcessing(false);
        return;
      }

      // Free vehicle — confirmed server-side, no payment needed.
      if (res.free) {
        goActive(res.rentalId);
        return;
      }
      // Idempotent server response: the hold was already paid (webhook pending).
      if (res.alreadyPaid) {
        await new Promise((r) => setTimeout(r, 1500));
        goActive(res.rentalId);
        return;
      }
      if (res.clientSecret) {
        await confirmAndFinish(res.rentalId, res.clientSecret);
      }
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
                  testID="rental-card-field"
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
              testID="rental-pay-button"
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
