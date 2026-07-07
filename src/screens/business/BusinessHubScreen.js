/**
 * BusinessHubScreen — home of the Kinlo for Business module (Pro-gated upstream
 * in ManageScreen). Loads the host's business; routes first-timers to setup,
 * otherwise lists the module areas. Areas light up block by block.
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import ListRow from "../../components/ListRow";
import SectionHeader from "../../components/SectionHeader";
import { useTheme } from "../../contexts/ThemeContext";
import { ELEVATION, RADII, SPACING } from "../../constants/theme-tokens";
import { getBusiness } from "../../services/businessService";
import { verticalLabelKey } from "../../constants/businessVerticals";

export default function BusinessHubScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [business, setBusiness] = useState(undefined); // undefined=loading, null=none

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getBusiness().then((b) => alive && setBusiness(b));
      return () => {
        alive = false;
      };
    }, [])
  );

  const styles = createStyles(colors);

  if (business === undefined) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  // First run — no business yet.
  if (business === null) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.hub.title")}</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.empty}>
          <View style={[styles.emptyArt, { backgroundColor: colors.brandSoft }]}>
            <Icon name="wallet" size={34} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("business.hub.setupTitle")}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("business.hub.setupText")}</Text>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("BusinessSetup")}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>{t("business.hub.setupCta")}</Text>
          </TouchableOpacity>
        </View>
      </GradientBackground>
    );
  }

  const card = [styles.card, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {business.name}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textTertiary }]}>
            {t(verticalLabelKey(business.vertical))} · {t("business.hub.proBadge")}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate("BusinessSetup")}>
          <Icon name="settings" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionHeader title={t("business.hub.insightsSection")} />
        <View style={card}>
          <ListRow
            icon="chart"
            title={t("business.hub.dashboardTitle")}
            subtitle={t("business.hub.dashboardSubtitle")}
            onPress={() => navigation.navigate("BusinessDashboard")}
          />
          <ListRow
            icon="analytics"
            title={t("business.hub.momentumTitle")}
            subtitle={t("business.hub.momentumSubtitle")}
            onPress={() => navigation.navigate("MomentumBoard")}
            divider={false}
          />
        </View>

        <SectionHeader title={t("business.hub.communitySection")} />
        <View style={card}>
          <ListRow
            icon="users"
            title={t("business.hub.membersTitle")}
            subtitle={t("business.hub.membersSubtitle", { count: business.memberCount || 0 })}
            onPress={() => navigation.navigate("BusinessMembers")}
            divider={false}
          />
        </View>

        <SectionHeader title={t("business.hub.operationsSection")} />
        <View style={card}>
          <ListRow
            icon="ticket"
            title={t("business.hub.packagesTitle")}
            subtitle={t("business.hub.packagesSubtitle")}
            onPress={() => navigation.navigate("BusinessPackages")}
          />
          <ListRow
            icon="qr"
            title={t("business.hub.checkInTitle")}
            subtitle={t("business.hub.checkInSubtitle")}
            onPress={() => navigation.navigate("BusinessCheckIn")}
          />
          <ListRow
            icon="dollar"
            title={t("business.hub.financeTitle")}
            subtitle={t("business.hub.financeSubtitle")}
            onPress={() => navigation.navigate("BusinessFinance")}
            divider={false}
          />
        </View>

        <Text style={[styles.soon, { color: colors.textTertiary }]}>{t("business.hub.moreSoon")}</Text>
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    headerSub: { fontSize: 12, marginTop: 1 },
    content: { paddingBottom: SPACING.xxxl },
    card: { borderRadius: RADII.card, borderWidth: 1, marginHorizontal: SPACING.screen, overflow: "hidden" },
    soon: { fontSize: 12.5, textAlign: "center", marginTop: 20, paddingHorizontal: 40, lineHeight: 18 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
    emptyArt: { width: 68, height: 68, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 18 },
    emptyTitle: { fontSize: 20, fontWeight: "800", marginBottom: 8, textAlign: "center" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 22 },
    cta: { borderRadius: 26, paddingVertical: 15, paddingHorizontal: 32 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
