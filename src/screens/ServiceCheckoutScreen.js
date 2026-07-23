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
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { CardField, useConfirmPayment } from "@stripe/stripe-react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import Icon from "../components/Icon";
import DateField from "../components/DateField";
import { formatCentavos, estimateCheckout } from "../utils/pricing";
import { getPricingConfig, overridesFor } from "../services/configService";
import { getListing, reserveServiceBooking } from "../services/marketplaceService";

// Presented slot times (no per-host availability store yet — the buyer picks a
// date + a time; the atomic server guard rejects a taken/over-capacity slot).
const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

export default function ServiceCheckoutScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { confirmPayment } = useConfirmPayment();
  const { bizId, listingId } = route.params || {};

  const [listing, setListing] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    getListing(bizId, listingId).then(setListing);
    getPricingConfig().then(setCfg);
  }, [bizId, listingId]);

  const price = listing?.priceCents || 0;
  const isFree = price === 0;
  const breakdown = isFree ? null : estimateCheckout(price, "stripe", overridesFor(cfg, "event"));
  const total = breakdown ? breakdown.totalCentavos : 0;

  const startAt = () => {
    if (!date || !time) return null;
    const [h, m] = time.split(":").map((n) => parseInt(n, 10));
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  // A booking that reserved OK but whose payment failed — a retry re-confirms the
  // SAME PaymentIntent instead of re-reserving.
  const [pendingPay, setPendingPay] = useState(null); // { clientSecret }

  const bookedAlert = () =>
    Alert.alert(t("marketplace.checkout.booked"), t("marketplace.checkout.bookedMsg"), [
      { text: "OK", onPress: () => navigation.navigate("Marketplace") },
    ]);

  const confirmAndFinish = async (clientSecret) => {
    const { error } = await confirmPayment(clientSecret, { paymentMethodType: "Card" });
    if (error) {
      setPendingPay({ clientSecret });
      Alert.alert(t("marketplace.checkout.paymentFailed"), error.message || t("marketplace.checkout.failed"));
      setProcessing(false);
      return;
    }
    setPendingPay(null);
    await new Promise((r) => setTimeout(r, 1500)); // webhook flips booking → confirmed
    bookedAlert();
  };

  const handlePay = async () => {
    const start = startAt();
    if (!start) {
      Alert.alert(t("marketplace.checkout.needTime"));
      return;
    }
    if (!isFree && !cardComplete) {
      Alert.alert(t("marketplace.checkout.incompleteCard"));
      return;
    }
    setProcessing(true);
    try {
      // Retry path: re-confirm the existing booking's PaymentIntent.
      if (pendingPay) {
        await confirmAndFinish(pendingPay.clientSecret);
        return;
      }

      const res = await reserveServiceBooking({ bizId, sessionTypeId: listingId, startAt: start });
      if (!res.success) {
        const messages = {
          slot_full: t("marketplace.checkout.slotFull"),
          host_payouts_not_ready: t("marketplace.checkout.payoutsNotReady"),
          business_owner_stripe_incomplete: t("marketplace.checkout.payoutsNotReady"),
          quote_only: t("marketplace.checkout.quoteOnly"),
          not_public: t("marketplace.checkout.failed"),
          email_not_verified: t("marketplace.checkout.emailNotVerified"),
        };
        Alert.alert(t("marketplace.checkout.failedTitle"), messages[res.error] || t("marketplace.checkout.failed"));
        setProcessing(false);
        return;
      }
      if (res.free) {
        bookedAlert();
        return;
      }
      if (res.alreadyPaid) {
        await new Promise((r) => setTimeout(r, 1500));
        bookedAlert();
        return;
      }
      if (res.clientSecret) {
        await confirmAndFinish(res.clientSecret);
      }
    } catch (e) {
      Alert.alert(t("marketplace.checkout.failedTitle"), t("marketplace.checkout.failed"));
      setProcessing(false);
    }
  };

  const s = createStyles(colors, isDark);

  if (!listing) {
    return (
      <View style={[s.fill, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 120 }} />
      </View>
    );
  }

  const Row = ({ label, value, strong }) => (
    <View style={s.row}>
      <Text style={[s.rowLabel, { color: strong ? colors.text : colors.textSecondary, fontWeight: strong ? "800" : "500" }]}>{label}</Text>
      <Text style={[s.rowValue, { color: strong ? colors.text : colors.textSecondary, fontWeight: strong ? "800" : "500" }]}>{value}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[s.fill, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>{t("marketplace.checkout.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[s.svcName, { color: colors.text }]}>{listing.name}</Text>
          <Text style={[s.svcMeta, { color: colors.textSecondary }]}>
            {t("marketplace.detail.duration", { min: listing.durationMin })}
          </Text>
        </View>

        <Text style={[s.label, { color: colors.textSecondary }]}>{t("marketplace.checkout.pickDate")}</Text>
        <DateField value={date} onChange={setDate} minimumDate={new Date()} placeholder={t("marketplace.checkout.pickDate")} />

        <Text style={[s.label, { color: colors.textSecondary }]}>{t("marketplace.checkout.pickTime")}</Text>
        <View style={s.slots}>
          {TIME_SLOTS.map((tm) => {
            const active = time === tm;
            return (
              <TouchableOpacity
                key={tm}
                onPress={() => setTime(tm)}
                style={[s.slot, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.brandSoft : "transparent" }]}
              >
                <Text style={[s.slotTxt, { color: active ? colors.primary : colors.text }]}>{tm}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.breakdown}>
          <Row label={t("marketplace.checkout.service")} value={price ? formatCentavos(price) : t("marketplace.detail.free")} />
          {breakdown && (
            <>
              <Row label={t("marketplace.checkout.kinloFee")} value={formatCentavos(breakdown.platformFeeCentavos)} />
              <Row label={t("marketplace.checkout.processingFee")} value={formatCentavos(breakdown.stripeFeeCentavos)} />
            </>
          )}
          <View style={s.divider} />
          <Row label={t("marketplace.checkout.total")} value={total ? formatCentavos(total) : t("marketplace.detail.free")} strong />
        </View>

        {!isFree && (
          <>
            <Text style={[s.label, { color: colors.textSecondary }]}>{t("marketplace.checkout.cardDetails")}</Text>
            <CardField
              testID="service-card-field"
              postalCodeEnabled={false}
              placeholders={{ number: "4242 4242 4242 4242" }}
              cardStyle={{ backgroundColor: isDark ? "#1C1C2E" : "#FFFFFF", textColor: colors.text, placeholderColor: colors.textTertiary }}
              style={s.cardField}
              onCardChange={(d) => setCardComplete(d.complete)}
            />
          </>
        )}

        <TouchableOpacity
          style={[s.payBtn, { backgroundColor: colors.primary, opacity: processing ? 0.6 : 1 }]}
          testID="service-pay-button"
          onPress={handlePay}
          disabled={processing}
          activeOpacity={0.85}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.payTxt}>{t("marketplace.checkout.pay", { amount: formatCentavos(total) })}</Text>
          )}
        </TouchableOpacity>
        <Text style={[s.secure, { color: colors.textTertiary }]}>{t("marketplace.checkout.secure")}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    fill: { flex: 1 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 18 },
    svcName: { fontSize: 17, fontWeight: "800", marginBottom: 3 },
    svcMeta: { fontSize: 13.5 },
    label: { fontSize: 13, fontWeight: "600", marginBottom: 8, marginTop: 6 },
    slots: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
    slot: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9, minWidth: 64, alignItems: "center" },
    slotTxt: { fontSize: 14, fontWeight: "700" },
    breakdown: { marginTop: 8, marginBottom: 20 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
    rowLabel: { fontSize: 14 },
    rowValue: { fontSize: 14 },
    divider: { height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)", marginVertical: 8 },
    cardField: { width: "100%", height: 50, marginBottom: 20 },
    payBtn: { borderRadius: 26, paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 54 },
    payTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
    secure: { fontSize: 12, marginTop: 14, textAlign: "center" },
  });
}
