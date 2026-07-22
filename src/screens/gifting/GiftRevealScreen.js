/**
 * Social gifting — recipient reveal + redemption (Board 5). The recipient never
 * sees the amount. Event gifts: "Confirm my spot" enrolls with NO charge. States
 * cover already-redeemed / event-cancelled / expired / declined. "I can't make
 * it" declines discreetly → the gifter is refunded (v1 has no credit wallet).
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, Alert, ActivityIndicator,
  StyleSheet, SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import GradientButton from "../../components/GradientButton";
import { subscribeGiftReveal, redeemGift, declineGift } from "../../services/giftService";

export default function GiftRevealScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { giftId } = route.params || {};
  const [gift, setGift] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeGiftReveal(giftId, (g) => { setGift(g); setLoaded(true); }), [giftId]);

  const gifter = gift?.fromMode === "anonymous"
    ? t("gifting.reveal.fromAnon")
    : t("gifting.reveal.fromNamed", { name: gift?.gifterName || "" });

  const onRedeem = async () => {
    setBusy(true);
    try {
      const res = await redeemGift(giftId);
      Alert.alert(res.placement === "waitlist"
        ? t("gifting.reveal.waitlistedOk")
        : t("gifting.reveal.redeemedOk"));
    } catch (e) {
      Alert.alert(mapErr(e.message, t));
    } finally {
      setBusy(false);
    }
  };

  const onDecline = () => {
    Alert.alert(
      t("gifting.reveal.declineConfirm"), t("gifting.reveal.declineBlurb"),
      [
        { text: t("gifting.reveal.cantMakeIt"), style: "cancel" },
        {
          text: t("gifting.reveal.decline"), style: "destructive",
          onPress: async () => {
            setBusy(true);
            try { await declineGift(giftId); } catch (_e) { Alert.alert(t("gifting.err.generic")); }
            finally { setBusy(false); }
          },
        },
      ]
    );
  };

  if (!loaded) {
    return (
      <SafeAreaView style={[st.fill, st.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const status = gift?.status;
  const expired = status === "sent" && gift?.expiresAt?.toMillis &&
    gift.expiresAt.toMillis() <= Date.now();

  // Terminal / non-actionable states.
  const stateView = (title, blurb) => (
    <StateCard title={title} blurb={blurb} colors={colors} t={t}
      onClose={() => navigation.goBack()} />
  );
  if (status === "redeemed") return stateView(t("gifting.reveal.redeemedTitle"), t("gifting.reveal.redeemedBlurb"));
  if (status === "event_cancelled") return stateView(t("gifting.reveal.cancelledTitle"), t("gifting.reveal.cancelledBlurb"));
  if (status === "declined" || status === "cancelled") return stateView(t("gifting.reveal.declinedTitle"), t("gifting.reveal.declinedBlurb"));
  if (status === "expired" || expired) return stateView(t("gifting.reveal.expiredTitle"), t("gifting.reveal.expiredBlurb"));

  // Actionable: an unredeemed event gift.
  return (
    <SafeAreaView style={[st.fill, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={st.body}>
        <View style={[st.badge, { backgroundColor: colors.brandSoft }]}>
          <Icon name="gift" size={30} color={colors.primary} />
        </View>
        <Text style={[TYPE.eyebrow, { color: colors.primary, marginTop: SPACING.lg }]}>{gifter}</Text>
        <Text style={[TYPE.display, { color: colors.text, marginTop: SPACING.xs }]}>
          {gift?.itemTitle || ""}
        </Text>
        {!!gift?.message && (
          <View style={[st.msg, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[TYPE.body, { color: colors.text, fontStyle: "italic" }]}>
              “{gift.message}”
            </Text>
          </View>
        )}
        <Text style={[TYPE.body, { color: colors.textSecondary, marginTop: SPACING.xl }]}>
          {t("gifting.reveal.alreadyPaid")}
        </Text>

        <View style={{ height: SPACING.xl }} />
        <GradientButton label={t("gifting.reveal.confirmSpot")} onPress={onRedeem} loading={busy} />
        <View style={{ height: SPACING.md }} />
        <GradientButton label={t("gifting.reveal.cantMakeIt")} variant="secondary" onPress={onDecline} disabled={busy} />

        <Text style={[TYPE.caption, { color: colors.textTertiary, marginTop: SPACING.xl, textAlign: "center" }]}>
          {t("gifting.reveal.declineBlurb")}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const StateCard = ({ title, blurb, colors, t, onClose }) => (
  <SafeAreaView style={[st.fill, st.center, { backgroundColor: colors.background }]}>
    <View style={{ paddingHorizontal: 32, alignItems: "center" }}>
      <Text style={[TYPE.title, { color: colors.text, textAlign: "center" }]}>{title}</Text>
      <Text style={[TYPE.body, { color: colors.textSecondary, textAlign: "center", marginTop: SPACING.sm }]}>{blurb}</Text>
      <View style={{ height: SPACING.xl }} />
      <GradientButton label={t("common.close") || "OK"} variant="secondary" onPress={onClose} />
    </View>
  </SafeAreaView>
);

const mapErr = (code, t) => {
  if (/gift_expired/.test(code)) return t("gifting.err.expired");
  if (/already_enrolled/.test(code)) return t("gifting.err.alreadyEnrolled");
  if (/email_not_verified/.test(code)) return t("gifting.err.emailNotVerified");
  if (/service_gifting_deferred/.test(code)) return t("gifting.err.serviceDeferred");
  return t("gifting.err.generic");
};

const st = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: SPACING.screen, paddingTop: 40, paddingBottom: 60, alignItems: "flex-start" },
  badge: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  msg: { alignSelf: "stretch", borderWidth: 1, borderRadius: RADII.card, padding: SPACING.lg, marginTop: SPACING.lg },
});
