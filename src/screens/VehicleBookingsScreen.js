/**
 * VehicleBookingsScreen — the owner's reservation tracker. Lists rentals against
 * the owner's fleet (upcoming first) so they can see which vehicle is booked for
 * which dates. Reads the previously-unused getOwnerRentals().
 */
import React, { useState, useCallback } from "react";
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
import Icon from "../components/Icon";
import GradientBackground from "../components/GradientBackground";
import { useTheme } from "../contexts/ThemeContext";
import { getOwnerRentals, getMyFleet } from "../services/rentalService";
import { formatCentavos } from "../utils/pricing";
import { formatDate } from "../utils/formatDate";

const fmt = (iso) =>
  iso ? formatDate(new Date(iso), { day: "numeric", month: "short" }) : "—";

export default function VehicleBookingsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const STATUS_META = {
    reserved: { label: t("vehicleBookings.status.reserved"), color: "#B45309" },
    active: { label: t("vehicleBookings.status.active"), color: "#34C759" },
    completed: { label: t("vehicleBookings.status.completed"), color: "#8a8f9c" },
    expired: { label: t("vehicleBookings.status.expired"), color: "#8a8f9c" },
    cancelled: { label: t("rentals.status.cancelled"), color: "#c25b5b" },
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [rentals, fleet] = await Promise.all([getOwnerRentals(), getMyFleet()]);
        const titleById = Object.fromEntries(fleet.map((v) => [v.id, v.title]));
        const now = Date.now();
        const decorated = rentals
          .map((r) => ({
            ...r,
            title: titleById[r.vehicleId] || t("rentals.activeRental.vehicleFallback"),
            startMs: r.startAt ? new Date(r.startAt).getTime() : 0,
            upcoming: r.endAt ? new Date(r.endAt).getTime() >= now : true,
          }))
          .sort((a, b) => a.startMs - b.startMs);
        setRows(decorated);
        setLoading(false);
      })();
    }, [])
  );

  const styles = createStyles(colors, isDark);
  const upcoming = rows.filter((r) => r.upcoming);
  const past = rows.filter((r) => !r.upcoming);

  const Card = ({ r }) => {
    const meta = STATUS_META[r.status] || STATUS_META.reserved;
    return (
      <View style={[styles.card, { borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {r.title}
          </Text>
          <Text style={[styles.dates, { color: colors.textSecondary }]}>
            {fmt(r.startAt)} → {fmt(r.endAt)}
            {typeof r.priceCentavos === "number"
              ? ` · ${formatCentavos(r.priceCentavos)}`
              : ""}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: `${meta.color}22`, borderColor: `${meta.color}55` }]}>
          <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
    );
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("rentals.hub.bookingsTitle")}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyArt}>
            <Icon name="calendar" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("vehicleBookings.emptyTitle")}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t("vehicleBookings.emptyText")}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {upcoming.length > 0 && (
            <>
              <Text style={[styles.section, { color: colors.textTertiary }]}>{t("vehicleBookings.upcoming")}</Text>
              {upcoming.map((r) => <Card key={r.id} r={r} />)}
            </>
          )}
          {past.length > 0 && (
            <>
              <Text style={[styles.section, { color: colors.textTertiary }]}>{t("vehicleBookings.past")}</Text>
              {past.map((r) => <Card key={r.id} r={r} />)}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: "700" },
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    section: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.9)",
    },
    title: { fontSize: 16, fontWeight: "700" },
    dates: { fontSize: 13.5, marginTop: 3 },
    pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    pillText: { fontSize: 12, fontWeight: "700" },
    empty: { alignItems: "center", marginTop: 80, paddingHorizontal: 40 },
    emptyArt: {
      width: 64,
      height: 64,
      borderRadius: 18,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    emptyTitle: { fontSize: 18, fontWeight: "800" },
    emptyText: { fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 20 },
  });
}
