import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import {
  DollarSign,
  Users,
  Ticket,
  CalendarCheck,
  Clock,
  Star,
} from "lucide-react-native";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import {
  getHostAnalytics,
  formatPlanPrice,
  getMembershipExpiryDate,
} from "../services/membershipService";

export default function HostAnalyticsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    const result = await getHostAnalytics();
    setData(result);
    setLoading(false);
  };

  const styles = createStyles(colors, isDark);

  const StatCard = ({ icon: Icon, label, value, accent }) => (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}1F` }]}>
        <Icon size={20} color={accent} strokeWidth={2} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Analytics</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !data ? (
        <View style={styles.loading}>
          <Text style={{ color: colors.textSecondary }}>
            Couldn't load analytics.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            REVENUE
          </Text>
          <View style={styles.revenueCard}>
            <Text style={[styles.revenueValue, { color: colors.text }]}>
              {formatPlanPrice(data.revenueTotalCentavos)}
            </Text>
            <Text style={[styles.revenueLabel, { color: colors.textSecondary }]}>
              Total received · {formatPlanPrice(data.revenueMonthCentavos)} this month
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            MEMBERS
          </Text>
          <View style={styles.statsGrid}>
            <StatCard
              icon={Users}
              label="Active members"
              value={data.activeMembers}
              accent="#34C759"
            />
            <StatCard
              icon={Ticket}
              label="Memberships sold"
              value={data.membershipsSold}
              accent={colors.primary}
            />
            <StatCard
              icon={CalendarCheck}
              label="Classes attended"
              value={data.classesAttended}
              accent="#0A84FF"
            />
            <StatCard
              icon={Clock}
              label="Expiring (7 days)"
              value={data.expiringSoonCount}
              accent="#FF9F0A"
            />
            <StatCard
              icon={Star}
              label={
                data.hostTotalRatings > 0
                  ? `Rating (${data.hostTotalRatings})`
                  : "Rating"
              }
              value={
                data.hostTotalRatings > 0
                  ? data.hostAverageRating.toFixed(1)
                  : "—"
              }
              accent="#FFD700"
            />
          </View>

          {data.expiringSoon.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                EXPIRING SOON
              </Text>
              {data.expiringSoon.map((m) => {
                const exp = getMembershipExpiryDate(m);
                return (
                  <View key={m.id} style={styles.expRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.expName, { color: colors.text }]} numberOfLines={1}>
                        {m.planName}
                      </Text>
                      <Text style={[styles.expMeta, { color: colors.textSecondary }]}>
                        {m.type === "credits"
                          ? `${m.creditsRemaining || 0} left · `
                          : ""}
                        expires {exp ? exp.toLocaleDateString() : "—"}
                      </Text>
                    </View>
                    <Clock size={16} color="#FF9F0A" strokeWidth={2} />
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)";
  const cardBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
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
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
      marginBottom: 10,
      marginTop: 8,
    },
    revenueCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 20,
      marginBottom: 16,
    },
    revenueValue: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
    revenueLabel: { fontSize: 13, marginTop: 6 },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    statCard: {
      width: "48%",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 16,
      marginBottom: 12,
    },
    statIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    statValue: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
    statLabel: { fontSize: 12, marginTop: 2 },
    expRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 14,
      marginBottom: 10,
    },
    expName: { fontSize: 15, fontWeight: "700" },
    expMeta: { fontSize: 12, marginTop: 2 },
  });
}
