import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { getRental, getVehicle, completeRental } from "../services/rentalService";
import { formatCentavos } from "../utils/pricing";

const STATUS_META = {
  reserved: { label: "Awaiting payment", color: "#B45309" },
  active: { label: "Active", color: "#34C759" },
  completed: { label: "Returned", color: "#8a8f9c" },
  cancelled: { label: "Cancelled", color: "#c25b5b" },
};

export default function ActiveRentalScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { rentalId } = route.params || {};
  const [rental, setRental] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState(false);

  const load = useCallback(async () => {
    const r = await getRental(rentalId);
    setRental(r);
    if (r?.vehicleId) setVehicle(await getVehicle(r.vehicleId));
    setLoading(false);
  }, [rentalId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onReturn = () => {
    Alert.alert("Return vehicle?", "Confirm the vehicle has been returned. Settle any deposit directly with the host.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "I've returned it",
        onPress: async () => {
          setReturning(true);
          const res = await completeRental(rentalId);
          setReturning(false);
          if (!res.success) {
            Alert.alert("Couldn't complete", res.error || "Try again.");
            return;
          }
          load();
        },
      },
    ]);
  };

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
  if (!rental) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <Text style={{ color: colors.textSecondary }}>Rental not found.</Text>
        </View>
      </GradientBackground>
    );
  }

  const meta = STATUS_META[rental.status] || STATUS_META.active;
  const canReturn = rental.status === "active" || rental.status === "reserved";

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Your rental</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusPill, { backgroundColor: `${meta.color}22`, borderColor: `${meta.color}55` }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{vehicle?.title || "Vehicle"}</Text>
        {vehicle?.pickupLabel ? (
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{vehicle.pickupLabel}</Text>
        ) : null}

        <View style={[styles.detailCard, { borderColor: colors.border }]}>
          <Detail label="From" value={fmtDate(rental.startAt)} colors={colors} />
          <Detail label="Until" value={fmtDate(rental.endAt)} colors={colors} />
          {rental.days ? <Detail label="Duration" value={`${rental.days} day${rental.days > 1 ? "s" : ""}`} colors={colors} /> : null}
          <Detail label="Rental fee" value={rental.priceCentavos ? formatCentavos(rental.priceCentavos) : "Free"} colors={colors} />
          {rental.depositCentavos ? (
            <Detail label="Deposit (with host)" value={formatCentavos(rental.depositCentavos)} colors={colors} />
          ) : null}
        </View>

        {rental.status === "active" && (
          <Text style={[styles.tip, { color: colors.textSecondary }]}>
            Enjoy the ride! When you finish, mark it returned and settle any deposit with the host.
          </Text>
        )}
        {rental.status === "completed" && (
          <Text style={[styles.tip, { color: colors.textSecondary }]}>
            Returned. Thanks for riding with us! 🎉
          </Text>
        )}
      </ScrollView>

      {canReturn && (
        <View style={[styles.footer, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={[styles.returnBtn, { backgroundColor: colors.primary, opacity: returning ? 0.6 : 1 }]}
            onPress={onReturn}
            disabled={returning}
            activeOpacity={0.85}
          >
            {returning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.returnTxt}>Mark as returned</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </GradientBackground>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
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
    back: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 120 },
    statusPill: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 16 },
    statusText: { fontSize: 12, fontWeight: "800" },
    title: { fontSize: 24, fontWeight: "800" },
    sub: { fontSize: 15, marginTop: 4 },
    detailCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 20 },
    tip: { fontSize: 14, marginTop: 20, lineHeight: 20 },
    footer: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      paddingHorizontal: 24, paddingTop: 16, paddingBottom: 34, borderTopWidth: 1,
    },
    returnBtn: { borderRadius: 26, paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 54 },
    returnTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
