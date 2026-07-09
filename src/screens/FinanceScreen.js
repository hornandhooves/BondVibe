import Icon from "../components/Icon";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { getHostFinance } from "../services/hostInsightsService";

// BUG 1: prefix MX$ so amounts read as MXN, never a bare $ (which reads as USD).
const money = (c) => `MX$${((c || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (k) => {
  if (!k || k === "—") return "—";
  const [y, m] = k.split("-");
  return new Date(y, Number(m) - 1, 1).toLocaleDateString("en", { month: "short", year: "2-digit" });
};

export default function FinanceScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHostFinance()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const styles = createStyles(colors, isDark);
  const maxMonth = Math.max(1, ...(data?.byMonth || []).map((m) => m.cents));

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("finance.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.hero, { borderColor: `${colors.primary}40`, backgroundColor: `${colors.primary}12` }]}>
            <Text style={[styles.heroValue, { color: colors.text }]}>
              {money(data?.totalCentavos)} MXN
            </Text>
            <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
              {t("finance.totalReceived", { amount: money(data?.monthCentavos) })}
            </Text>
          </View>

          <Text style={[styles.section, { color: colors.textSecondary }]}>
            {t("finance.monthlyTrend")}
          </Text>
          {(data?.byMonth || []).length === 0 ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>{t("finance.noIncomeYet")}</Text>
          ) : (
            data.byMonth.map((m) => (
              <View key={m.month} style={styles.trendRow}>
                <Text style={[styles.trendMonth, { color: colors.textSecondary }]}>
                  {monthLabel(m.month)}
                </Text>
                <View style={[styles.trendTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.trendFill,
                      { width: `${Math.max(4, (m.cents / maxMonth) * 100)}%`, backgroundColor: colors.primary },
                    ]}
                  />
                </View>
                <Text style={[styles.trendVal, { color: colors.text }]}>{money(m.cents)}</Text>
              </View>
            ))
          )}

          <Text style={[styles.section, { color: colors.textSecondary, marginTop: 20 }]}>
            {t("finance.revenuePerEvent")}
          </Text>
          {(data?.byEvent || []).length === 0 ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>{t("finance.noPaidEventsYet")}</Text>
          ) : (
            data.byEvent.map((e) => (
              <View key={e.eventId} style={[styles.eventRow, { borderColor: colors.border }]}>
                <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={[styles.eventVal, { color: colors.primary }]}>{money(e.cents)}</Text>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 18, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    hero: { borderWidth: 1, borderRadius: 18, padding: 20, marginBottom: 22 },
    heroValue: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
    heroLabel: { fontSize: 14, marginTop: 6 },
    section: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 10 },
    muted: { fontSize: 13 },
    trendRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    trendMonth: { width: 54, fontSize: 12 },
    trendTrack: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
    trendFill: { height: 10, borderRadius: 5 },
    trendVal: { width: 90, fontSize: 12, fontWeight: "700", textAlign: "right" },
    eventRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      gap: 10,
    },
    eventTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
    eventVal: { fontSize: 15, fontWeight: "800" },
  });
}
