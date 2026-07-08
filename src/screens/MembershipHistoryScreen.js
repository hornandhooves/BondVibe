/**
 * MembershipHistoryScreen — a membership's utilization history
 * (kinlo_business/07 FIX 3). Lists every redemption (a check-in that spent a
 * credit): date + event/class name + credits spent, newest first, with the
 * running balance after each. Undone check-ins are shown greyed (credit
 * restored). Read-only; the user reads their own redemption records.
 */
import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import GradientBackground from "../components/GradientBackground";
import { useTheme } from "../contexts/ThemeContext";
import { getMembershipRedemptions } from "../services/membershipService";
import { toMillis } from "../utils/membershipUtils";

export default function MembershipHistoryScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const membership = route.params?.membership || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const reds = await getMembershipRedemptions(membership.id);
        // Running balance: oldest→newest, then display newest first.
        const asc = [...reds].sort((a, b) => toMillis(a.redeemedAt) - toMillis(b.redeemedAt));
        let running = membership.creditsTotal || 0;
        const withBalance = asc.map((r) => {
          const spent = r.status === "undone" ? 0 : r.creditsDeducted || 0;
          running -= spent;
          return { ...r, spent, balanceAfter: Math.max(0, running) };
        });
        withBalance.reverse();
        if (alive) { setRows(withBalance); setLoading(false); }
      })();
      return () => { alive = false; };
    }, [membership.id])
  );

  const styles = createStyles(colors, isDark);
  const remaining = membership.creditsRemaining ?? 0;
  const total = membership.creditsTotal ?? 0;

  const fmtDate = (ts) => {
    const ms = toMillis(ts);
    return ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{t("membershipHistory.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.planName, { color: colors.text }]} numberOfLines={1}>{membership.planName}</Text>
          <Text style={[styles.balance, { color: colors.primary }]}>
            {t("myMemberships.classesLeft", { count: remaining, remaining, total })}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : rows.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{t("membershipHistory.empty")}</Text>
        ) : (
          <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {rows.map((r, i) => {
              const undone = r.status === "undone";
              return (
                <View key={r.id} style={[styles.row, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: undone ? colors.textTertiary : colors.text, textDecorationLine: undone ? "line-through" : "none" }]} numberOfLines={1}>
                      {r.eventTitle || t("membershipHistory.session")}
                    </Text>
                    <Text style={[styles.rowDate, { color: colors.textTertiary }]}>
                      {fmtDate(r.redeemedAt)}{undone ? ` · ${t("membershipHistory.undone")}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.spent, { color: undone ? colors.textTertiary : colors.error }]}>
                      {undone ? t("membershipHistory.restored") : `−${r.spent}`}
                    </Text>
                    <Text style={[styles.after, { color: colors.textTertiary }]}>
                      {t("membershipHistory.balanceAfter", { n: r.balanceAfter })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 60, paddingBottom: 16 },
    headerTitle: { fontSize: 20, fontWeight: "700", flex: 1, textAlign: "center", marginHorizontal: 8 },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    summary: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 18 },
    planName: { fontSize: 16, fontWeight: "800" },
    balance: { fontSize: 14, fontWeight: "700", marginTop: 4 },
    loading: { paddingVertical: 50, alignItems: "center" },
    empty: { fontSize: 14, textAlign: "center", marginTop: 30, lineHeight: 20 },
    list: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
    rowTitle: { fontSize: 14.5, fontWeight: "700" },
    rowDate: { fontSize: 12, marginTop: 2 },
    spent: { fontSize: 15, fontWeight: "800" },
    after: { fontSize: 11, marginTop: 2 },
  });
}
