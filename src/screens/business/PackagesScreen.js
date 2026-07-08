/**
 * PackagesScreen — the host's products (class/session packs, unlimited,
 * drop-in). kinlo_business/01 §3. Manual-first; assigned to members from the
 * member record.
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { listPackages, PACKAGE_KIND } from "../../services/businessPackagesService";
import { formatCentavos } from "../../utils/pricing";

export default function PackagesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setPackages(await listPackages());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.packages.title")}</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate("BusinessPackageForm", {})}
        >
          <Icon name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : packages.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyArt, { backgroundColor: colors.brandSoft }]}>
            <Icon name="ticket" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("business.packages.emptyTitle")}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("business.packages.emptyText")}</Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("BusinessPackageForm", {})}
          >
            <Text style={styles.ctaText}>{t("business.packages.addFirst")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {packages.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate("BusinessPackageForm", { packageId: p.id })}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{p.name}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {t("business.packages.creditsCount", { count: p.credits || 0 })}
                  {p.validityDays ? ` · ${t("business.packages.validDays", { days: p.validityDays })}` : ""}
                  {` · ${p.kind === PACKAGE_KIND.SESSION ? t("business.packages.kindSession") : t("business.packages.kindClass")}`}
                </Text>
              </View>
              <Text style={[styles.price, { color: colors.text }]}>
                {p.priceCents ? formatCentavos(p.priceCents) : t("business.packages.free")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
    name: { fontSize: 15, fontWeight: "800" },
    meta: { fontSize: 12.5, marginTop: 3 },
    price: { fontSize: 15, fontWeight: "800" },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
    emptyArt: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
    cta: { borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
