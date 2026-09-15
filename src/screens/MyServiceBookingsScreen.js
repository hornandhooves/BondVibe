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
import { getMyServiceBookings } from "../services/marketplaceService";
import { formatCentavos } from "../utils/pricing";
import { formatDate } from "../utils/formatDate";

export default function MyServiceBookingsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const STATUS_META = {
    reserved: { label: t("marketplace.bookingStatus.reserved"), color: "#B45309" },
    confirmed: { label: t("marketplace.bookingStatus.confirmed"), color: "#34C759" },
    done: { label: t("marketplace.bookingStatus.done"), color: "#8a8f9c" },
    no_show: { label: t("marketplace.bookingStatus.no_show"), color: "#8a8f9c" },
    cancelled: { label: t("marketplace.bookingStatus.cancelled"), color: "#c25b5b" },
    declined: { label: t("marketplace.bookingStatus.declined"), color: "#c25b5b" },
  };
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const list = await getMyServiceBookings();
    setBookings(list);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const styles = createStyles(colors, isDark);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("marketplace.myBookings.title")}</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Marketplace")}>
          <Text style={[styles.link, { color: colors.primary }]}>{t("marketplace.myBookings.browse")}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {bookings.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyArt}>
                <Icon name="calendar" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("marketplace.myBookings.emptyTitle")}</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t("marketplace.myBookings.emptyText")}
              </Text>
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate("Marketplace")}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaTxt}>{t("marketplace.myBookings.browse")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            bookings.map((b) => {
              const meta = STATUS_META[b.status] || STATUS_META.reserved;
              return (
                <TouchableOpacity
                  key={`${b.bizId}_${b.id}`}
                  style={[styles.card, { borderColor: colors.border }]}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate("ServiceBookingDetail", { bizId: b.bizId, bookingId: b.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                      {b.sessionTypeName || t("marketplace.checkout.service")}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {fmtDate(b.start)} · {b.priceCents ? formatCentavos(b.priceCents) : t("marketplace.detail.free")}
                    </Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: `${meta.color}22`, borderColor: `${meta.color}55` }]}>
                    <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return formatDate(new Date(iso), { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12,
    },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    link: { fontSize: 14, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingTop: 8 },
    card: {
      flexDirection: "row", alignItems: "center", gap: 12,
      borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12,
    },
    title: { fontSize: 16, fontWeight: "800" },
    meta: { fontSize: 13, marginTop: 2 },
    pill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
    pillText: { fontSize: 11, fontWeight: "800" },
    empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 30 },
    emptyArt: {
      width: 64,
      height: 64,
      borderRadius: 18,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
    cta: { borderRadius: 24, paddingVertical: 14, paddingHorizontal: 28 },
    ctaTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
