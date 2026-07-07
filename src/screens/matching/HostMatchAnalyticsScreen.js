/**
 * D3 — Host matching analytics. Aggregates only (never who matched whom or who
 * liked whom). Includes "attendees on Kinlo Plus".
 */
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { MatchHeader } from "./matchUi";
import { getHostMatchAnalytics } from "../../services/matchingService";

export default function HostMatchAnalyticsScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { eventId } = route.params || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setData(await getHostMatchAnalytics(eventId));
      } catch (e) {
        setError(true);
      }
    })();
  }, [eventId]);

  const styles = createStyles(colors);
  const stats = [
    { label: t("matching.analytics.participants"), value: data?.participants },
    { label: t("matching.analytics.matches"), value: data?.matches },
    { label: t("matching.analytics.conversations"), value: data?.conversations },
    { label: t("matching.analytics.onKinloPlus"), value: data?.plusUpgrades },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={t("matching.analytics.title")} onBack={() => navigation.goBack()} />
      {error ? (
        <Text style={[styles.msg, { color: colors.textSecondary }]}>
          {t("matching.analytics.couldntLoad")}
        </Text>
      ) : !data ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <View style={styles.grid}>
          {stats.map((s) => (
            <View key={s.label} style={styles.card}>
              <Text style={[styles.value, { color: colors.primary }]}>{s.value ?? 0}</Text>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={[styles.note, { color: colors.textTertiary }]}>
        {t("matching.analytics.note")}
      </Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 16,
      justifyContent: "space-between",
    },
    card: {
      width: "48%",
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderRadius: 18,
      paddingVertical: 26,
      alignItems: "center",
      marginBottom: 12,
    },
    value: { fontSize: 36, fontWeight: "800", letterSpacing: -0.5 },
    label: { fontSize: 13, fontWeight: "600", marginTop: 4 },
    msg: { textAlign: "center", marginTop: 40, fontSize: 15 },
    note: { fontSize: 12.5, lineHeight: 18, paddingHorizontal: 24, marginTop: 8 },
  });
}
