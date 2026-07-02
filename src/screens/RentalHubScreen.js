import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { getAvailableVehicles, VEHICLE_TYPES } from "../services/rentalService";
import { formatCentavos } from "../utils/pricing";

const TYPE_EMOJI = { scooter: "🛴", bike: "🚲", car: "🚗" };
const TYPE_LABEL = { scooter: "Scooters", bike: "Bikes", car: "Cars" };

export default function RentalHubScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { eventId, eventTitle } = route.params || {};
  const [type, setType] = useState(null); // null = all
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getAvailableVehicles({ type: type || undefined });
    setVehicles(list);
    setLoading(false);
  }, [type]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const styles = createStyles(colors, isDark);
  const chips = [{ key: null, label: "All" }, ...VEHICLE_TYPES.map((t) => ({ key: t, label: TYPE_LABEL[t] }))];

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Get around 🛴</Text>
        <TouchableOpacity onPress={() => navigation.navigate("MyRentals")}>
          <Text style={[styles.link, { color: colors.primary }]}>My rentals</Text>
        </TouchableOpacity>
      </View>

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
                onPress={() => navigation.navigate("VehicleDetail", { vehicleId: v.id, eventId, eventTitle })}
              >
                <View style={styles.thumb}>
                  {v.photos[0] ? (
                    <Image source={{ uri: v.photos[0] }} style={styles.thumbImg} />
                  ) : (
                    <Text style={styles.thumbEmoji}>{TYPE_EMOJI[v.type] || "🛴"}</Text>
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
      paddingTop: 60,
      paddingBottom: 12,
    },
    back: { fontSize: 28 },
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
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
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
    thumbEmoji: { fontSize: 30 },
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
