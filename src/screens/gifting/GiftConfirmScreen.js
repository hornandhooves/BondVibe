/**
 * Social gifting — confirm + pay (Boards 4b/4c). The gifter picks named/anonymous,
 * adds an optional message, sees the breakdown, and pays on the existing Stripe
 * rails (createGiftPaymentIntent → confirmPayment). The amount is shown to the
 * GIFTER only; the recipient never sees it.
 *
 * The pre-pay breakdown is a client ESTIMATE (estimateCheckout, USER_PAYS_FEES);
 * the charge itself is server-authoritative (createGiftPaymentIntent).
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
} from "react-native";
import { CardField, useConfirmPayment } from "@stripe/stripe-react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import GradientButton from "../../components/GradientButton";
import { estimateCheckout, formatCentavos } from "../../utils/pricing";
import { createGiftPaymentIntent } from "../../services/giftService";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../../services/firebase";

// Minimal-beta flag: hide the anonymous option (default = named) until the
// end-to-end anonymity projection is signed off. The code path is preserved.
const SHOW_ANON = false;

export default function GiftConfirmScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { confirmPayment } = useConfirmPayment();
  const p = route.params || {};
  const recipientName = p.recipientName || "";

  const [pricePesos, setPricePesos] = useState(p.eventPrice ?? null);
  const [eventTitle, setEventTitle] = useState(p.eventTitle || "");
  const [anonymous, setAnonymous] = useState(false);
  const [message, setMessage] = useState("");
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(p.eventPrice == null);

  useEffect(() => {
    if (p.eventPrice != null) return;
    (async () => {
      const s = await getDoc(doc(db, "events", p.eventId));
      if (s.exists()) { setPricePesos(s.data().price || 0); setEventTitle(s.data().title || ""); }
      setLoading(false);
    })();
  }, [p.eventId]);

  const est = estimateCheckout(Math.round((pricePesos || 0) * 100));
  const serviceFee = est.platformFeeCentavos + est.processorFeeCentavos;
  const totalStr = formatCentavos(est.totalCentavos);

  const handlePay = async () => {
    if (!cardComplete || processing) return;
    setProcessing(true);
    try {
      const { clientSecret, giftId } = await createGiftPaymentIntent({
        recipientId: p.recipientId,
        itemId: p.eventId,
        itemType: "event",
        fromMode: anonymous ? "anonymous" : "named",
        message: message.trim(),
      });
      const { error } = await confirmPayment(clientSecret, { paymentMethodType: "Card" });
      if (error) {
        Alert.alert(t("gifting.confirm.title"), error.message || t("gifting.confirm.payError"));
        setProcessing(false);
        return;
      }
      navigation.replace("GiftReceipt", {
        giftId, recipientName, eventTitle, totalStr,
      });
    } catch (e) {
      Alert.alert(t("gifting.confirm.title"), mapErr(e.message, t));
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[st.fill, { backgroundColor: colors.background }]}>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (processing) {
    return (
      <SafeAreaView style={[st.fill, st.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[TYPE.title, { color: colors.text, marginTop: SPACING.lg }]}>
          {t("gifting.confirm.processingTitle")}
        </Text>
        <Text style={[TYPE.body, { color: colors.textSecondary, marginTop: SPACING.xs, textAlign: "center", paddingHorizontal: 40 }]}>
          {t("gifting.confirm.processingBlurb", { name: recipientName })}
        </Text>
      </SafeAreaView>
    );
  }

  const myName = auth.currentUser?.displayName || "";
  return (
    <SafeAreaView style={[st.fill, { backgroundColor: colors.background }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} accessibilityLabel="Back">
          <Icon name="back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[TYPE.title, { color: colors.text, marginLeft: SPACING.md }]}>
          {t("gifting.confirm.title")}
        </Text>
      </View>
      <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
          <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[TYPE.bodySemibold, { color: colors.text }]}>{eventTitle}</Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
              {t("gifting.confirm.forName", { name: recipientName })}
            </Text>
          </View>

          {/* Named / anonymous. SHOW_ANON gates the toggle off for the minimal
              beta (default = named) until the anonymity projection is fully
              verified end-to-end; the code path stays intact. */}
          {SHOW_ANON && (
            <>
              <Text style={[TYPE.eyebrow, st.eyebrow, { color: colors.textSecondary }]}>
                {t("gifting.confirm.howYouAppear")}
              </Text>
              <View style={st.segment}>
                {[
                  { k: false, label: t("gifting.confirm.fromYou", { name: myName || "—" }) },
                  { k: true, label: t("gifting.confirm.anonymous") },
                ].map((o) => (
                  <TouchableOpacity key={String(o.k)}
                    onPress={() => setAnonymous(o.k)}
                    style={[st.segBtn, {
                      backgroundColor: anonymous === o.k ? colors.primary : colors.surface,
                      borderColor: anonymous === o.k ? colors.primary : colors.border,
                    }]}
                    accessibilityRole="button" accessibilityState={{ selected: anonymous === o.k }}>
                    <Text style={[TYPE.label, { color: anonymous === o.k ? colors.onPrimary : colors.text }]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Message */}
          <Text style={[TYPE.eyebrow, st.eyebrow, { color: colors.textSecondary }]}>
            {t("gifting.confirm.messageLabel")}
          </Text>
          <TextInput
            value={message}
            onChangeText={(x) => setMessage(x.slice(0, 200))}
            placeholder={t("gifting.confirm.messagePlaceholder")}
            placeholderTextColor={colors.textTertiary}
            multiline
            style={[TYPE.body, st.msgInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />

          {/* Breakdown */}
          <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: SPACING.lg }]}>
            <Row label={t("gifting.confirm.event")} value={formatCentavos(est.baseCentavos)} colors={colors} />
            <Row label={t("gifting.confirm.serviceFee")} value={formatCentavos(serviceFee)} colors={colors} />
            <View style={[st.divider, { backgroundColor: colors.border }]} />
            <Row label={t("gifting.confirm.total")} value={totalStr} colors={colors} strong />
          </View>
          <Text style={[TYPE.caption, { color: colors.textTertiary, marginTop: SPACING.sm }]}>
            {t("gifting.confirm.neverSees", { name: recipientName })}
          </Text>

          {/* Card */}
          <Text style={[TYPE.eyebrow, st.eyebrow, { color: colors.textSecondary }]}>
            {t("gifting.confirm.cardLabel")}
          </Text>
          <CardField
            postalCodeEnabled={false}
            onCardChange={(d) => setCardComplete(d.complete)}
            style={st.cardField}
            cardStyle={{ backgroundColor: colors.surface, textColor: colors.text, placeholderColor: colors.textTertiary }}
          />

          <View style={{ height: SPACING.xl }} />
          <GradientButton
            label={t("gifting.confirm.pay", { amount: totalStr })}
            onPress={handlePay}
            disabled={!cardComplete}
            loading={processing}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Row = ({ label, value, colors, strong }) => (
  <View style={st.row}>
    <Text style={[strong ? TYPE.bodySemibold : TYPE.body, { color: strong ? colors.text : colors.textSecondary }]}>
      {label}
    </Text>
    <Text style={[strong ? TYPE.title : TYPE.bodySemibold, { color: colors.text }]}>{value}</Text>
  </View>
);

const mapErr = (code, t) => {
  if (/cannot_gift_self/.test(code)) return t("gifting.err.selfGift");
  if (/event_not_paid/.test(code)) return t("gifting.err.notPaid");
  if (/service_gifting_deferred/.test(code)) return t("gifting.err.serviceDeferred");
  if (/email_not_verified/.test(code)) return t("gifting.err.emailNotVerified");
  if (/host_payouts_not_ready|Host cannot/.test(code)) return t("gifting.err.hostNotReady");
  return t("gifting.err.generic");
};

const st = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.screen, paddingVertical: SPACING.md },
  body: { paddingHorizontal: SPACING.screen, paddingBottom: 60 },
  eyebrow: { marginTop: SPACING.lg, marginBottom: SPACING.sm },
  card: { borderWidth: 1, borderRadius: RADII.card, padding: SPACING.lg },
  segment: { flexDirection: "row", gap: SPACING.sm },
  segBtn: { flex: 1, borderWidth: 1, borderRadius: RADII.pill, paddingVertical: SPACING.md, alignItems: "center" },
  msgInput: { borderWidth: 1, borderRadius: RADII.card, padding: SPACING.md, minHeight: 72, textAlignVertical: "top" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: SPACING.xs },
  divider: { height: 1, marginVertical: SPACING.sm },
  cardField: { height: 50, marginTop: SPACING.xs },
});
