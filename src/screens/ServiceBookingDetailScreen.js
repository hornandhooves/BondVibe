import Icon from "../components/Icon";
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import RatingModal from "../components/RatingModal";
import StarRow from "../components/StarRow";
import { getServiceBooking } from "../services/marketplaceService";
import { getUserRatingForBooking } from "../services/ratingService";
import { formatCentavos } from "../utils/pricing";
import { formatDateTime } from "../utils/formatDate";

export default function ServiceBookingDetailScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [existingRating, setExistingRating] = useState(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const STATUS_META = {
    reserved: { label: t("marketplace.bookingStatus.reserved"), color: "#B45309" },
    confirmed: { label: t("marketplace.bookingStatus.confirmed"), color: "#34C759" },
    done: { label: t("marketplace.bookingStatus.done"), color: "#8a8f9c" },
    no_show: { label: t("marketplace.bookingStatus.no_show"), color: "#8a8f9c" },
    cancelled: { label: t("marketplace.bookingStatus.cancelled"), color: "#c25b5b" },
    declined: { label: t("marketplace.bookingStatus.declined"), color: "#c25b5b" },
  };
  const { bizId, bookingId } = route.params || {};
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const b = await getServiceBooking(bizId, bookingId);
    setBooking(b);
    // Only a done booking can be rated — check once we know the status, not
    // on every booking regardless of it (mirrors getPendingServiceRatings'
    // own status==="done" gate).
    if (b && b.status === "done") {
      setExistingRating(await getUserRatingForBooking(bookingId));
    }
    setLoading(false);
  }, [bizId, bookingId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const styles = createStyles(colors, isDark);

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }
  if (!booking) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <Text style={{ color: colors.textSecondary }}>{t("marketplace.bookingDetail.notFound")}</Text>
        </View>
      </GradientBackground>
    );
  }

  const meta = STATUS_META[booking.status] || STATUS_META.reserved;
  const when = booking.start
    ? formatDateTime(booking.start, {
        weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      })
    : "—";

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("marketplace.bookingDetail.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusPill, { backgroundColor: `${meta.color}22`, borderColor: `${meta.color}55` }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          {booking.sessionTypeName || t("marketplace.checkout.service")}
        </Text>
        {!!booking.businessName && (
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{booking.businessName}</Text>
        )}

        <View style={[styles.detailCard, { borderColor: colors.border }]}>
          <Detail label={t("marketplace.bookingDetail.date")} value={when} colors={colors} />
          {!!booking.durationMin && (
            <Detail
              label={t("marketplace.bookingDetail.duration")}
              value={t("marketplace.detail.duration", { min: booking.durationMin })}
              colors={colors}
            />
          )}
          <Detail
            label={t("marketplace.bookingDetail.price")}
            value={booking.priceCents ? formatCentavos(booking.priceCents) : t("marketplace.detail.free")}
            colors={colors}
          />
        </View>

        {/* KIN-285: only a done booking is rateable — mirrors the event flow's
            own gate (checked-in + past), just via the booking's own status
            instead of a separate checkin doc. */}
        {booking.status === "done" && (
          existingRating ? (
            <View style={[styles.detailCard, { borderColor: colors.border, marginTop: 16 }]}>
              <Text style={[styles.sub, { color: colors.textSecondary, marginTop: 0, marginBottom: 8 }]}>
                {t("marketplace.bookingDetail.yourRating")}
              </Text>
              <StarRow rating={existingRating.rating} size={20} />
              {!!existingRating.comment && (
                <Text style={[styles.sub, { color: colors.text, marginTop: 8 }]}>{existingRating.comment}</Text>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.rateBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={() => setRatingModalVisible(true)}
            >
              <Text style={styles.rateBtnTxt}>{t("marketplace.bookingDetail.rate")}</Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>

      <RatingModal
        visible={ratingModalVisible}
        onClose={() => setRatingModalVisible(false)}
        onSuccess={() => {
          setRatingModalVisible(false);
          load();
        }}
        target={{
          type: "service",
          id: bookingId,
          title: booking.sessionTypeName,
          bizId,
          sessionTypeId: booking.sessionTypeId,
        }}
      />
    </GradientBackground>
  );
}

function Detail({ label, value, colors }) {
  return (
    <View style={detailStyles.row}>
      <Text style={[detailStyles.label, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[detailStyles.value, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  label: { fontSize: 14 },
  value: { fontSize: 14, fontWeight: "700" },
});

function createStyles(colors, isDark) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12,
    },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    statusPill: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16 },
    statusText: { fontSize: 12, fontWeight: "800" },
    title: { fontSize: 24, fontWeight: "800" },
    sub: { fontSize: 15, marginTop: 4 },
    detailCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 20 },
    rateBtn: { borderRadius: 24, paddingVertical: 14, alignItems: "center", marginTop: 16 },
    rateBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
