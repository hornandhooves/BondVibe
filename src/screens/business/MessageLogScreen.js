/**
 * MessageLogScreen — the delivery log (kinlo_business/04). Every automation /
 * broadcast send is recorded with its resolved channel and status.
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { listMessages } from "../../services/businessAutomationsService";
import { formatDate } from "../../utils/formatDate";

export default function MessageLogScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => { setMessages(await listMessages()); setLoading(false); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusColor = (s) => (s === "sent" ? colors.success : s === "failed" ? colors.error : colors.textTertiary);
  const tsStr = (ts) => {
    const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
    return ms ? formatDate(ms) : "";
  };

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.automations.log")}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : messages.length === 0 ? (
        <View style={styles.loading}><Text style={{ color: colors.textTertiary }}>{t("business.automations.noMessages")}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {messages.map((m) => (
            <View key={m.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{m.memberName || t("business.payment.walkIn")}</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>{m.body}</Text>
                <Text style={[styles.meta, { color: colors.textTertiary }]}>
                  {t(`business.automations.channel.${m.channel}`, { defaultValue: m.channel })} · {tsStr(m.ts)}
                </Text>
              </View>
              <Text style={[styles.status, { color: statusColor(m.status) }]}>{t(`business.automations.status.${m.status}`, { defaultValue: m.status })}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
    name: { fontSize: 14, fontWeight: "700" },
    body: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
    meta: { fontSize: 11, marginTop: 5 },
    status: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  });
}
