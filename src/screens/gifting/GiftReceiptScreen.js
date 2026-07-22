/**
 * Social gifting — gifter receipt (Board 4d). Shows the live gift status and lets
 * the gifter cancel while it's still unredeemed (→ refund to their card). The
 * recipient's redemption flips the status here in real time.
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  StyleSheet, SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import GradientButton from "../../components/GradientButton";
import { subscribeGift, cancelGift } from "../../services/giftService";

const STATUS_KEY = {
  sent: "gifting.receipt.statusSent",
  redeemed: "gifting.receipt.statusRedeemed",
  cancelled: "gifting.receipt.statusCancelled",
  expired: "gifting.receipt.statusExpired",
  declined: "gifting.receipt.statusDeclined",
  event_cancelled: "gifting.receipt.statusExpired",
};

export default function GiftReceiptScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { giftId, recipientName, eventTitle, totalStr } = route.params || {};
  const [gift, setGift] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeGift(giftId, setGift), [giftId]);

  const status = gift?.status || "sent";
  const canCancel = status === "sent";

  const onCancel = () => {
    Alert.alert(
      t("gifting.receipt.cancelConfirmTitle"),
      t("gifting.receipt.cancelConfirmBlurb", { name: recipientName }),
      [
        { text: t("gifting.receipt.keep"), style: "cancel" },
        {
          text: t("gifting.receipt.cancelConfirmYes"),
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await cancelGift(giftId);
              Alert.alert(t("gifting.receipt.cancelled"));
            } catch (_e) {
              Alert.alert(t("gifting.err.generic"));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[st.fill, { backgroundColor: colors.background }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.popToTop()} hitSlop={12} accessibilityLabel="Close">
          <Icon name="back" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={st.body}>
        <View style={[st.badge, { backgroundColor: colors.successBg }]}>
          <Icon name="party" size={28} color={colors.success} />
        </View>
        <Text style={[TYPE.display, { color: colors.text, marginTop: SPACING.lg }]}>
          {t("gifting.receipt.sentTitle")}
        </Text>
        <Text style={[TYPE.body, { color: colors.textSecondary, marginTop: SPACING.xs }]}>
          {t("gifting.receipt.sentBlurb", { name: recipientName })}
        </Text>

        <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[TYPE.bodySemibold, { color: colors.text }]}>{eventTitle}</Text>
          <View style={[st.divider, { backgroundColor: colors.border }]} />
          <Row label={t("gifting.receipt.to")} value={recipientName} colors={colors} />
          {!!totalStr && <Row label={t("gifting.receipt.totalPaid")} value={totalStr} colors={colors} />}
          <Row label={t("gifting.receipt.status")} value={t(STATUS_KEY[status] || STATUS_KEY.sent)} colors={colors} />
        </View>

        <Text style={[TYPE.caption, { color: colors.textTertiary, marginTop: SPACING.md }]}>
          {t("gifting.receipt.refundNote", { name: recipientName })}
        </Text>

        {canCancel && (
          <View style={{ marginTop: SPACING.xl }}>
            <GradientButton label={t("gifting.receipt.cancel")} variant="danger"
              onPress={onCancel} loading={busy} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const Row = ({ label, value, colors }) => (
  <View style={st.row}>
    <Text style={[TYPE.body, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[TYPE.bodySemibold, { color: colors.text }]}>{value}</Text>
  </View>
);

const st = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: SPACING.screen, paddingVertical: SPACING.md },
  body: { paddingHorizontal: SPACING.screen, paddingBottom: 60, alignItems: "flex-start" },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  card: { alignSelf: "stretch", borderWidth: 1, borderRadius: RADII.card, padding: SPACING.lg, marginTop: SPACING.xl },
  divider: { height: 1, marginVertical: SPACING.md },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: SPACING.xs },
});
