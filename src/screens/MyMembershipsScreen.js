import React, { useState, useCallback } from "react";
import Icon from "../components/Icon";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import {
  getUserMemberships,
  getMembershipState,
  getMembershipExpiryDate,
  getMembershipPlan,
  MEMBERSHIP_PLAN_TYPES,
} from "../services/membershipService";

const STATE_META = {
  active: { label: "Active", color: "#34C759" },
  depleted: { label: "No credits left", color: "#B45309" },
  expired: { label: "Expired", color: "#c25b5b" },
};

export default function MyMembershipsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    const data = await getUserMemberships();
    setMemberships(data);
    setLoading(false);
  };

  const handleRenew = async (m) => {
    const plan = await getMembershipPlan(m.planId);
    if (plan && plan.active) {
      navigation.navigate("MembershipCheckout", { plan });
    } else {
      Alert.alert(
        "Plan unavailable",
        "This plan isn't offered anymore. Check the host's current plans on one of their events."
      );
    }
  };

  const styles = createStyles(colors, isDark);

  const renderCard = (m) => {
    const state = getMembershipState(m);
    const meta = STATE_META[state] || STATE_META.expired;
    const expiry = getMembershipExpiryDate(m);
    const isCredits = m.type === MEMBERSHIP_PLAN_TYPES.CREDITS;
    const remaining = m.creditsRemaining || 0;
    const total = m.creditsTotal || 0;
    const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

    return (
      <View key={m.id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.iconCircle}>
            <Icon name="ticket" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.planName, { color: colors.text }]} numberOfLines={1}>
              {m.planName}
            </Text>
            <Text style={[styles.expiry, { color: colors.textSecondary }]}>
              {state === "expired"
                ? `Expired ${expiry ? expiry.toLocaleDateString() : ""}`
                : `Valid until ${expiry ? expiry.toLocaleDateString() : "—"}`}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {isCredits ? (
          <View style={styles.creditsSection}>
            <View style={styles.creditsHeader}>
              <Text style={[styles.creditsText, { color: colors.text }]}>
                {remaining} of {total} classes left
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${pct * 100}%`, backgroundColor: meta.color },
                ]}
              />
            </View>
          </View>
        ) : (
          <Text style={[styles.unlimitedText, { color: colors.textSecondary }]}>
            Unlimited classes
          </Text>
        )}

        {state !== "active" && (
          <TouchableOpacity
            style={[
              styles.renewButton,
              { backgroundColor: `${colors.primary}22`, borderColor: colors.primary },
            ]}
            onPress={() => handleRenew(m)}
            activeOpacity={0.8}
          >
            <Text style={[styles.renewText, { color: colors.primary }]}>Renew</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Memberships</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : memberships.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="ticket" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No memberships yet
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            When you buy a class pack or pass from a host, it'll show up here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {memberships.map(renderCard)}
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
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    back: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
    emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
      padding: 16,
      marginBottom: 12,
    },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.primary}1F`,
    },
    planName: { fontSize: 16, fontWeight: "700" },
    expiry: { fontSize: 13, marginTop: 2 },
    badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    badgeText: { fontSize: 12, fontWeight: "700" },
    creditsSection: { marginTop: 14 },
    creditsHeader: { marginBottom: 8 },
    creditsText: { fontSize: 14, fontWeight: "600" },
    progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
    progressFill: { height: 8, borderRadius: 4 },
    unlimitedText: { fontSize: 14, marginTop: 14, fontWeight: "500" },
    renewButton: {
      marginTop: 16,
      borderWidth: 1.5,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
    },
    renewText: { fontSize: 14, fontWeight: "700" },
  });
}
