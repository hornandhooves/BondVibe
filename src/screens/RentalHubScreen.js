import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Switch,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { useMode } from "../contexts/ModeContext";
import useUserRole from "../hooks/useUserRole";
import GradientBackground from "../components/GradientBackground";
import DateField from "../components/DateField";
import ListRow from "../components/ListRow";
import SectionHeader from "../components/SectionHeader";
import { getAvailableVehicles, getRentalCities, VEHICLE_TYPES } from "../services/rentalService";
import { formatCentavos } from "../utils/pricing";
import { ELEVATION, RADII, SPACING } from "../constants/theme-tokens";

const TYPE_LABEL = { scooter: "Scooters", bike: "Bikes", car: "Cars" };
const toISO = (d) => (d ? new Date(d).toISOString() : undefined);

export default function RentalHubScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { isHosting } = useMode();
  const { isHost } = useUserRole();
  const { eventId, eventTitle } = route.params || {};
  const [type, setType] = useState(null); // null = all
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [city, setCity] = useState(null);
  const [fromDate, setFromDate] = useState(null);
  const [untilDate, setUntilDate] = useState(null);
  const [maxPrice, setMaxPrice] = useState("");
  const [noLicense, setNoLicense] = useState(false);
  const [cities, setCities] = useState([]);

  useEffect(() => {
    getRentalCities().then(setCities);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getAvailableVehicles({
      type: type || undefined,
      city: city || undefined,
      maxPriceCentavos: maxPrice ? Math.round(parseFloat(maxPrice) * 100) : undefined,
      noLicense,
      startAt: fromDate && untilDate ? toISO(fromDate) : undefined,
      endAt: fromDate && untilDate ? toISO(untilDate) : undefined,
    });
    setVehicles(list);
    setLoading(false);
  }, [type, city, maxPrice, noLicense, fromDate, untilDate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const clearFilters = () => {
    setCity(null);
    setFromDate(null);
    setUntilDate(null);
    setMaxPrice("");
    setNoLicense(false);
  };
  const activeFilters =
    (city ? 1 : 0) + (fromDate && untilDate ? 1 : 0) + (maxPrice ? 1 : 0) + (noLicense ? 1 : 0);

  const bookingDates = fromDate && untilDate
    ? { startAt: toISO(fromDate), endAt: toISO(untilDate) }
    : {};

  const styles = createStyles(colors, isDark);
  const chips = [{ key: null, label: "All" }, ...VEHICLE_TYPES.map((t) => ({ key: t, label: TYPE_LABEL[t] }))];

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      {/* Tab root — AppHeader is provided by the tab navigator. */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Get around 🛴</Text>
        <TouchableOpacity onPress={() => navigation.navigate("MyRentals")}>
          <Text style={[styles.link, { color: colors.primary }]}>My rentals</Text>
        </TouchableOpacity>
      </View>

      {/* Host Mode: fleet management entry (§1.3 — "Rentals gains Your fleet") */}
      {isHosting && isHost && (
        <>
          <SectionHeader title="Your fleet" style={{ marginTop: 0 }} />
          <View
            style={[
              styles.fleetCard,
              ELEVATION.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <ListRow
              icon="fleet"
              title="My fleet"
              subtitle="Publish & manage your vehicles"
              onPress={() => navigation.navigate("MyFleet")}
            />
            <ListRow
              icon="calendarCheck"
              title="Bookings"
              subtitle="Who booked which dates"
              onPress={() => navigation.navigate("VehicleBookings")}
              divider={false}
            />
          </View>
        </>
      )}

      {eventId && (
        <View style={[styles.eventBanner, { borderColor: colors.border }]}>
          <Text style={[styles.eventBannerText, { color: colors.textSecondary }]} numberOfLines={1}>
            Getting to <Text style={{ color: colors.text, fontWeight: "700" }}>{eventTitle || "your event"}</Text>
          </Text>
        </View>
      )}

      <View style={styles.chipsRow}>
        {chips.map((c) => {
          const active = c.key === type;
          return (
            <TouchableOpacity
              key={c.label}
              onPress={() => setType(c.key)}
              style={[
                styles.chip,
                { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}22` : "transparent" },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.primary : colors.textSecondary }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterBtn, { borderColor: activeFilters ? colors.primary : colors.border }]}
          onPress={() => setFiltersOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterBtnTxt, { color: activeFilters ? colors.primary : colors.textSecondary }]}>
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </Text>
        </TouchableOpacity>
        {activeFilters > 0 && (
          <TouchableOpacity onPress={clearFilters} style={styles.clearFilters}>
            <Text style={[styles.clearFiltersTxt, { color: colors.textTertiary }]}>Clear all</Text>
          </TouchableOpacity>
        )}
        {fromDate && untilDate && (
          <Text style={[styles.datePill, { color: colors.textSecondary }]} numberOfLines={1}>
            {new Date(fromDate).toLocaleDateString("es-MX", { day: "numeric", month: "short" })} –{" "}
            {new Date(untilDate).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {vehicles.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🛵</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No vehicles yet</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No rides available here right now. Check back soon.
              </Text>
            </View>
          ) : (
            vehicles.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.card, { borderColor: colors.border }]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate("VehicleDetail", { vehicleId: v.id, eventId, eventTitle, ...bookingDates })}
              >
                <View style={styles.thumb}>
                  {v.photos[0] ? (
                    <Image source={{ uri: v.photos[0] }} style={styles.thumbImg} />
                  ) : (
                    <Text style={[styles.thumbPlaceholder, { color: colors.textTertiary }]}>No photo</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{v.title}</Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {v.city ? `${v.city} · ` : ""}{v.pickupLabel || "Pickup on site"}
                  </Text>
                  <View style={styles.tagRow}>
                    {v.requiresLicense && (
                      <View style={[styles.tag, { borderColor: colors.border }]}>
                        <Text style={[styles.tagText, { color: colors.textTertiary }]}>License</Text>
                      </View>
                    )}
                    {v.rangeKm ? (
                      <View style={[styles.tag, { borderColor: colors.border }]}>
                        <Text style={[styles.tagText, { color: colors.textTertiary }]}>{v.rangeKm} km</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.priceCol}>
                  <Text style={[styles.price, { color: colors.text }]}>
                    {v.pricePerDayCentavos ? formatCentavos(v.pricePerDayCentavos) : "Free"}
                  </Text>
                  <Text style={[styles.priceUnit, { color: colors.textTertiary }]}>
                    {v.pricePerDayCentavos ? "/ day" : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal
        visible={filtersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: isDark ? "#14141f" : "#fff" }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Filters</Text>
              <TouchableOpacity onPress={() => setFiltersOpen(false)}>
                <Text style={[styles.sheetDone, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>City</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {[{ k: null, l: "All cities" }, ...cities.map((c) => ({ k: c, l: c }))].map((c) => {
                  const active = c.k === city;
                  return (
                    <TouchableOpacity
                      key={c.l}
                      onPress={() => setCity(c.k)}
                      style={[
                        styles.chip,
                        { marginRight: 8, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}22` : "transparent" },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: active ? colors.primary : colors.textSecondary }]}>{c.l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Dates</Text>
              <View style={styles.datesRow}>
                <DateField
                  label="From"
                  value={fromDate}
                  onChange={setFromDate}
                  onClear={() => setFromDate(null)}
                  minimumDate={new Date()}
                />
                <DateField
                  label="Until"
                  value={untilDate}
                  onChange={setUntilDate}
                  onClear={() => setUntilDate(null)}
                  minimumDate={fromDate || new Date()}
                />
              </View>

              <Text style={[styles.filterLabel, { color: colors.textSecondary, marginTop: 16 }]}>
                Max price per day (MXN)
              </Text>
              <TextInput
                style={[styles.priceInput, { color: colors.text, borderColor: colors.border }]}
                keyboardType="numeric"
                value={maxPrice}
                onChangeText={setMaxPrice}
                placeholder="Any"
                placeholderTextColor={colors.textTertiary}
              />

              <View style={styles.switchRow}>
                <Text style={[styles.filterLabel, { color: colors.text, marginBottom: 0 }]}>
                  No license required
                </Text>
                <Switch value={noLicense} onValueChange={setNoLicense} trackColor={{ true: colors.primary }} />
              </View>

              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: colors.primary }]}
                onPress={() => setFiltersOpen(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.applyTxt}>Show results</Text>
              </TouchableOpacity>
              {activeFilters > 0 && (
                <TouchableOpacity onPress={clearFilters} style={styles.clearAll}>
                  <Text style={[styles.clearFiltersTxt, { color: colors.textTertiary }]}>Clear all filters</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 12,
    },
    fleetCard: {
      borderRadius: RADII.card,
      borderWidth: 1,
      marginHorizontal: SPACING.screen,
      marginBottom: SPACING.md,
      overflow: "hidden",
    },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    link: { fontSize: 14, fontWeight: "700" },
    eventBanner: {
      marginHorizontal: 20,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 8,
    },
    eventBannerText: { fontSize: 13 },
    chipsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingVertical: 8, flexWrap: "wrap" },
    chip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
    chipText: { fontSize: 13, fontWeight: "700" },
    filterBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
    filterBtn: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
    filterBtnTxt: { fontSize: 13, fontWeight: "700" },
    clearFilters: {},
    clearFiltersTxt: { fontSize: 13, fontWeight: "600" },
    datePill: { fontSize: 12, flexShrink: 1 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    // Filters modal
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, maxHeight: "85%" },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
    sheetTitle: { fontSize: 18, fontWeight: "800" },
    sheetDone: { fontSize: 16, fontWeight: "700" },
    filterLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
    datesRow: { flexDirection: "row", gap: 12 },
    priceInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 8 },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
    applyBtn: { borderRadius: 26, paddingVertical: 16, alignItems: "center", marginTop: 12 },
    applyTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
    clearAll: { alignItems: "center", paddingVertical: 14 },
    content: { paddingHorizontal: 20, paddingTop: 8 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    thumb: {
      width: 56, height: 56, borderRadius: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      alignItems: "center", justifyContent: "center", overflow: "hidden",
    },
    thumbImg: { width: 56, height: 56 },
    thumbPlaceholder: { fontSize: 10, fontWeight: "600" },
    title: { fontSize: 16, fontWeight: "800" },
    meta: { fontSize: 13, marginTop: 2 },
    tagRow: { flexDirection: "row", gap: 6, marginTop: 6 },
    tag: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    tagText: { fontSize: 11, fontWeight: "600" },
    priceCol: { alignItems: "flex-end" },
    price: { fontSize: 15, fontWeight: "800" },
    priceUnit: { fontSize: 11, marginTop: 2 },
    empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 30 },
    emptyEmoji: { fontSize: 52, marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  });
}
