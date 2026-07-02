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
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { getMyRentals } from "../services/rentalService";
import { formatCentavos } from "../utils/pricing";

const STATUS_META = {
  reserved: { label: "Awaiting payment", color: "#FF9F0A" },
  active: { label: "Active", color: "#34C759" },
  completed: { label: "Returned", color: "#8A8398" },
  cancelled: { label: "Cancelled", color: "#EF4444" },
};

export default function MyRentalsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const list = await getMyRentals();
    setRentals(list);
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
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My rentals</Text>
        <TouchableOpacity onPress={() => navigation.navigate("RentalHub")}>
          <Text style={[styles.link, { color: colors.primary }]}>Rent</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {rentals.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🛴</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No rentals yet</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Rent a scooter, bike or car to get around.
              </Text>
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate("RentalHub")}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaTxt}>Browse vehicles</Text>
              </TouchableOpacity>
            </View>
          ) : (
            rentals.map((r) => {
              const meta = STATUS_META[r.status] || STATUS_META.active;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.card, { borderColor: colors.border }]}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate("ActiveRental", { rentalId: r.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                      {r.days ? `${r.days} day${r.days > 1 ? "s" : ""} rental` : "Rental"}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {r.priceCentavos ? formatCentavos(r.priceCentavos) : "Free"}
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

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12,
    },
    back: { fontSize: 28 },
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
    emptyEmoji: { fontSize: 52, marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
    cta: { borderRadius: 24, paddingVertical: 14, paddingHorizontal: 28 },
    ctaTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
