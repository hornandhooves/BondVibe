/**
 * ManageScreen — the host dashboard hub (§1.3/§1.4). Root of the Events tab
 * when Host Mode = Hosting. Pure hub: every row links to an existing screen —
 * no business logic moved. (The old ProfileScreen "Host Tools" grid lives here.)
 */
import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View, ScrollView, StyleSheet, TouchableOpacity, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { auth } from "../services/firebase";
import { LinearGradient } from "expo-linear-gradient";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import ListRow from "../components/ListRow";
import SectionHeader from "../components/SectionHeader";
import ProBadge from "../components/ProBadge";
import useEntitlement from "../hooks/useEntitlement";
import { paywallRouteForTier } from "../components/ProGate";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII, BRAND, ELEVATION } from "../constants/theme-tokens";
import { getBusiness } from "../services/businessService";
import { listMembers, MEMBER_STATUS } from "../services/businessMembersService";
import { claimStaffInvites } from "../services/businessStaffService";

export default function ManageScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [business, setBusiness] = useState(null);
  const [memberStats, setMemberStats] = useState({ total: 0, active: 0, atRisk: 0 });
  const { allowed: bizAllowed, tier: bizTier } = useEntitlement("business_erp");

  useFocusEffect(
    useCallback(() => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      // Auto-link any pending staff invites for this account (FIX 4).
      claimStaffInvites().catch(() => {});
      // Real stats for the "Your business" card (only when a business exists).
      getBusiness()
        .then(async (b) => {
          setBusiness(b);
          if (!b) return;
          const members = await listMembers();
          setMemberStats({
            total: members.length,
            active: members.filter((m) => (m.status || "active") === MEMBER_STATUS.ACTIVE).length,
            atRisk: members.filter((m) => m.status === MEMBER_STATUS.AT_RISK).length,
          });
        })
        .catch(() => {});
    }, [])
  );

  const card = [styles.card, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Create — the primary host action */}
        <TouchableOpacity
          onPress={() => navigation.navigate("CreateEvent")}
          activeOpacity={0.85}
          testID="manage-create-event"
        >
          <LinearGradient
            colors={BRAND.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.createBtn, ELEVATION.floatingBrand]}
          >
            <View style={styles.createIcon}>
              <Icon name="add" size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.label, styles.createText]}>{t("manage.createEvent")}</Text>
              <Text style={styles.createSub}>{t("manage.createEventSub")}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Your business — the dark ERP/CRM card (mockup #1). When the host has a
            business, show real stats; otherwise a discovery row → paywall/setup. */}
        {business ? (
          <>
            <SectionHeader title={t("manage.yourBusiness")} />
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() =>
                navigation.navigate(bizAllowed ? "BusinessHub" : paywallRouteForTier(bizTier), { from: "business_erp" })
              }
              style={[styles.bizCard, ELEVATION.card]}
            >
              <View style={styles.bizTop}>
                <View style={styles.bizIcon}>
                  <Icon name="wallet" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowRight}>
                    <Text style={styles.bizName} numberOfLines={1}>{business.name}</Text>
                    <ProBadge tier="pro" />
                  </View>
                  <Text style={styles.bizSub} numberOfLines={1}>{t("manage.businessCardSub")}</Text>
                </View>
                <Icon name="forward" size={18} color="rgba(255,255,255,0.6)" />
              </View>
              <View style={styles.statRow}>
                {[
                  { n: memberStats.total, k: t("manage.statMembers") },
                  { n: memberStats.active, k: t("manage.statActive") },
                  { n: memberStats.atRisk, k: t("manage.statAtRisk") },
                ].map((s, i) => (
                  <View key={i} style={styles.statTile}>
                    <Text style={styles.statNum}>{s.n}</Text>
                    <Text style={styles.statLabel}>{s.k}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <View style={[card, { marginTop: SPACING.md }]}>
            <ListRow
              icon="wallet"
              title={t("business.manageRow.title")}
              subtitle={t("business.manageRow.subtitle")}
              onPress={() =>
                navigation.navigate(bizAllowed ? "BusinessHub" : paywallRouteForTier(bizTier), {
                  from: "business_erp",
                })
              }
              right={
                <View style={styles.rowRight}>
                  <ProBadge tier="pro" />
                  <Icon name="forward" size={18} color={colors.textTertiary} />
                </View>
              }
              divider={false}
            />
          </View>
        )}

        {/* This event — event-scoped ops only. Everything business-wide (members,
            money, analytics, memberships) now lives in the single hub above, so
            no metric appears twice (kinlo_business/06 FIX 1). */}
        <SectionHeader title={t("manage.thisEvent")} />
        <View style={card}>
          <ListRow
            icon="calendar"
            title={t("manage.hostedEvents")}
            subtitle={t("manage.hostedEventsSubtitle")}
            onPress={() => navigation.navigate("MyEvents", { initialTab: "hosting" })}
          />
          <ListRow
            icon="qr"
            title={t("manage.checkInScanner")}
            subtitle={t("manage.checkInScannerSubtitle")}
            onPress={() => navigation.navigate("CheckInScanner")}
          />
          <ListRow
            icon="star"
            title={t("manage.ratings")}
            subtitle={t("manage.ratingsSubtitle")}
            onPress={() => navigation.navigate("RatingsOverview")}
            divider={false}
          />
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: SPACING.xxxl },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: RADII.card,
    marginHorizontal: SPACING.screen,
    marginTop: SPACING.sm,
  },
  createIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  createText: { color: "#FFFFFF", fontSize: 17 },
  createSub: { color: "rgba(255,255,255,0.9)", fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    marginHorizontal: SPACING.screen,
    overflow: "hidden",
  },
  bizCard: {
    backgroundColor: "#1C1B2E",
    borderRadius: RADII.card,
    marginHorizontal: SPACING.screen,
    padding: 16,
  },
  bizTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  bizIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  bizName: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", flexShrink: 1 },
  bizSub: { color: "rgba(255,255,255,0.6)", fontSize: 12.5, marginTop: 2 },
  statRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  statTile: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  statNum: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11.5, fontWeight: "600", marginTop: 2 },
});
