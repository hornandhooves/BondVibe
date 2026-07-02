import React, { useEffect, useState } from "react";
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
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { HostBadge } from "../components/primitives";
import { getVehicle, getProvider } from "../services/rentalService";
import { formatCentavos } from "../utils/pricing";

const TYPE_EMOJI = { scooter: "🛴", bike: "🚲", car: "🚗" };

export default function VehicleDetailScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { vehicleId, eventId, eventTitle } = route.params || {};
  const [vehicle, setVehicle] = useState(null);
  const [provider, setProvider] = useState(null);
  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const v = await getVehicle(vehicleId);
      setVehicle(v);
      if (v?.providerId) setProvider(await getProvider(v.providerId));
      setLoading(false);
    })();
  }, [vehicleId]);

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
  if (!vehicle) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <Text style={{ color: colors.textSecondary }}>Vehicle not found.</Text>
        </View>
      </GradientBackground>
    );
  }

  const available = vehicle.status === "available";
  const feeTotal = vehicle.pricePerDayCentavos * days;

  const onRent = () => {
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + days * 864e5).toISOString();
    navigation.navigate("RentalCheckout", {
      vehicle,
      days,
      startAt,
      endAt,
      eventId,
      eventTitle,
    });
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {vehicle.photos[0] ? (
            <Image source={{ uri: vehicle.photos[0] }} style={styles.heroImg} />
          ) : (
            <Text style={styles.heroEmoji}>{TYPE_EMOJI[vehicle.type] || "🛴"}</Text>
          )}
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{vehicle.title}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          {vehicle.city ? `${vehicle.city} · ` : ""}{vehicle.pickupLabel || "Pickup on site"}
        </Text>

        {provider && (
          <View style={styles.providerRow}>
            <Text style={[styles.provider, { color: colors.textSecondary }]}>
              by {provider.name || "Partner"}
            </Text>
            {provider.verified && <HostBadge small />}
          </View>
        )}

        <View style={[styles.specs, { borderColor: colors.border }]}>
          <Spec label="Type" value={vehicle.type} colors={colors} />
          {vehicle.rangeKm ? <Spec label="Range" value={`${vehicle.rangeKm} km`} colors={colors} /> : null}
          {vehicle.requiresLicense ? <Spec label="License" value="Required" colors={colors} /> : null}
          {vehicle.depositCentavos ? (
            <Spec label="Deposit (hold)" value={formatCentavos(vehicle.depositCentavos)} colors={colors} />
          ) : null}
        </View>

        {eventId && (
          <View style={[styles.eventBanner, { borderColor: colors.border }]}>
            <Text style={[styles.eventBannerText, { color: colors.textSecondary }]} numberOfLines={2}>
              This rental will be linked to{" "}
              <Text style={{ color: colors.text, fontWeight: "700" }}>{eventTitle || "your event"}</Text>.
            </Text>
          </View>
        )}

        {vehicle.pricePerDayCentavos > 0 && (
          <View style={styles.daysRow}>
            <Text style={[styles.daysLabel, { color: colors.text }]}>Days</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: colors.border }]}
                onPress={() => setDays((d) => Math.max(1, d - 1))}
              >
                <Text style={[styles.stepTxt, { color: colors.text }]}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.daysVal, { color: colors.text }]}>{days}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: colors.border }]}
                onPress={() => setDays((d) => Math.min(30, d + 1))}
              >
                <Text style={[styles.stepTxt, { color: colors.text }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.footerPrice, { color: colors.text }]}>
            {vehicle.pricePerDayCentavos ? formatCentavos(feeTotal) : "Free"}
          </Text>
          <Text style={[styles.footerUnit, { color: colors.textTertiary }]}>
            {vehicle.pricePerDayCentavos ? `${days} day${days > 1 ? "s" : ""}` : "no charge"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.rentBtn, { backgroundColor: available ? colors.primary : colors.border, opacity: available ? 1 : 0.6 }]}
          onPress={onRent}
          disabled={!available}
          activeOpacity={0.85}
        >
          <Text style={styles.rentTxt}>{available ? "Rent now" : "Not available"}</Text>
        </TouchableOpacity>
      </View>
    </GradientBackground>
  );
}

function Spec({ label, value, colors }) {
  return (
    <View style={specStyles.spec}>
      <Text style={[specStyles.specLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[specStyles.specValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const specStyles = StyleSheet.create({
  spec: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  specLabel: { fontSize: 14 },
  specValue: { fontSize: 14, fontWeight: "700", textTransform: "capitalize" },
});

function createStyles(colors, isDark) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 4 },
    back: { fontSize: 28 },
    content: { paddingHorizontal: 24, paddingBottom: 140 },
    hero: {
      height: 180, borderRadius: 20, marginBottom: 18, overflow: "hidden",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      alignItems: "center", justifyContent: "center",
    },
    heroImg: { width: "100%", height: 180 },
    heroEmoji: { fontSize: 80 },
    title: { fontSize: 24, fontWeight: "800" },
    sub: { fontSize: 15, marginTop: 4 },
    providerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
    provider: { fontSize: 14 },
    specs: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 20 },
    eventBanner: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 16 },
    eventBannerText: { fontSize: 13, lineHeight: 18 },
    daysRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24 },
    daysLabel: { fontSize: 16, fontWeight: "700" },
    stepper: { flexDirection: "row", alignItems: "center", gap: 18 },
    stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    stepTxt: { fontSize: 22, fontWeight: "700" },
    daysVal: { fontSize: 18, fontWeight: "800", minWidth: 24, textAlign: "center" },
    footer: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 24, paddingTop: 16, paddingBottom: 34,
      borderTopWidth: 1,
    },
    footerPrice: { fontSize: 20, fontWeight: "800" },
    footerUnit: { fontSize: 12, marginTop: 2 },
    rentBtn: { borderRadius: 26, paddingVertical: 15, paddingHorizontal: 32 },
    rentTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
