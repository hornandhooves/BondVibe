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
import ProBadge from "../../components/ProBadge";
import { useTheme } from "../../contexts/ThemeContext";
import { ELEVATION, RADII, SPACING } from "../../constants/theme-tokens";
import { getBusiness } from "../../services/businessService";
import useBusinessPerms from "../../hooks/useBusinessPerms";
import { verticalLabelKey } from "../../constants/businessVerticals";

export default function BusinessHubScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { allows } = useBusinessPerms(); // owner → all; staff → their role's perms
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
          <View style={styles.titleRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {business.name}
            </Text>
            <ProBadge tier="pro" />
          </View>
          <Text style={[styles.headerSub, { color: colors.textTertiary }]}>
            {t(verticalLabelKey(business.vertical))}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate("BusinessSetup")}>
          <Icon name="settings" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Overview is just the Dashboard entry now — the Whole business /
            Choose event scope control moved INTO the Dashboard screen (BUG 17). */}
        {/* FINANCE CAPABILITY (#59): the dashboard leads with revenue/P&L, so the
            overview row is finance-gated. (The dashboard screen also degrades
            revenue KPIs to "—" for non-finance staff as defense-in-depth.) */}
        {allows("finance") && (
          <>
            <SectionHeader title={t("business.hub.overviewSection")} />
            <View style={card}>
              <ListRow
                icon="chart"
                iconColor={colors.primary}
                iconBg={`${colors.primary}1A`}
                title={t("business.hub.dashboardTitle")}
                subtitle={t("business.hub.dashboardSubtitle")}
                onPress={() => navigation.navigate("BusinessDashboard")}
                divider={false}
              />
            </View>
          </>
        )}

        <SectionHeader title={t("business.hub.peopleMoneySection")} />
        <View style={card}>
          <ListRow
            icon="users"
            iconColor={colors.primary}
            iconBg={`${colors.primary}1A`}
            title={t("business.hub.membersTitle")}
            titleBadge={t("business.hub.crmBadge")}
            subtitle={t("business.hub.membersSubtitle", { count: business.memberCount || 0 })}
            onPress={() => navigation.navigate("BusinessMembers")}
          />
          <ListRow
            icon="ticket"
            iconColor={colors.primary}
            iconBg={`${colors.primary}1A`}
            title={t("business.hub.membershipsTitle")}
            subtitle={t("business.hub.membershipsSubtitle")}
            onPress={() => navigation.navigate("BusinessMemberships")}
          />
          {allows("finance") && (
            <ListRow
              icon="dollar"
              iconColor={colors.success}
              iconBg={`${colors.success}1A`}
              title={t("business.hub.financeTitle")}
              subtitle={t("business.hub.financeSubtitle")}
              onPress={() => navigation.navigate("BusinessFinance")}
            />
          )}
          <ListRow
            icon="qr"
            iconColor={colors.success}
            iconBg={`${colors.success}1A`}
            title={t("business.hub.checkInTitle")}
            subtitle={t("business.hub.checkInSubtitle")}
            onPress={() => navigation.navigate("BusinessCheckIn")}
            divider={false}
          />
        </View>

        <SectionHeader title={t("business.hub.programmingSection")} />
        <View style={card}>
          {/* One agenda covers browsing, creation, classes and requests
              (kinlo_business/07 FIX 5) — the old Classes + Sessions rows were
              folded in. */}
          <ListRow
            icon="calendarCheck"
            iconColor={colors.error}
            iconBg={`${colors.error}1A`}
            title={t("business.hub.agendaTitle")}
            subtitle={t("business.hub.agendaSubtitle")}
            onPress={() => navigation.navigate("BusinessAgendaDay")}
          />
          {/* Private sessions (member-only 1:1 / couples / group). Publishing a
              PUBLIC service moved to the Services tab (Services P3) — the old
              Hub "Marketplace" section is gone. */}
          <ListRow
            icon="clock"
            iconColor={colors.primary}
            iconBg={`${colors.primary}1A`}
            title={t("business.hub.privateSessionsTitle")}
            subtitle={t("business.hub.privateSessionsSubtitle")}
            onPress={() => navigation.navigate("BusinessSessionTypes")}
            divider={false}
          />
        </View>

        <SectionHeader title={t("business.hub.retentionOrgSection")} />
        <View style={card}>
          {allows("momentum") && (
            <ListRow
              icon="analytics"
              iconColor={colors.warning}
              iconBg={`${colors.warning}1A`}
              title={t("business.hub.momentumTitle")}
              subtitle={t("business.hub.momentumSubtitle")}
              onPress={() => navigation.navigate("MomentumBoard")}
            />
          )}
          {allows("momentum") && (
            <ListRow
              icon="gift"
              iconColor={colors.warning}
              iconBg={`${colors.warning}1A`}
              title={t("business.hub.birthdaysTitle")}
              subtitle={t("business.hub.birthdaysSubtitle")}
              onPress={() => navigation.navigate("BusinessBirthdays")}
            />
          )}
          {allows("automations") && (
            <ListRow
              icon="broadcast"
              iconColor={colors.warning}
              iconBg={`${colors.warning}1A`}
              title={t("business.hub.automationsTitle")}
              subtitle={t("business.hub.automationsSubtitle")}
              onPress={() => navigation.navigate("BusinessAutomations")}
            />
          )}
          {allows("branches") && (
            <ListRow
              icon="location"
              iconColor={colors.textSecondary}
              iconBg={`${colors.textTertiary}22`}
              title={t("business.hub.branchesTitle")}
              subtitle={t("business.hub.branchesSubtitle")}
              onPress={() => navigation.navigate("BusinessBranches")}
            />
          )}
          {allows("staff") && (
            <ListRow
              icon="users"
              iconColor={colors.textSecondary}
              iconBg={`${colors.textTertiary}22`}
              title={t("business.hub.staffTitle")}
              subtitle={t("business.hub.staffSubtitle")}
              onPress={() => navigation.navigate("BusinessStaff")}
              divider={false}
            />
          )}
        </View>
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
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    headerTitle: { fontSize: 20, fontWeight: "800", flexShrink: 1 },
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
