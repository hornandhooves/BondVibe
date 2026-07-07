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
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
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

export default function ManageScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const { allowed: bizAllowed, tier: bizTier } = useEntitlement("business_erp");

  useFocusEffect(
    useCallback(() => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      getDoc(doc(db, "users", uid))
        .then((snap) => snap.exists() && setProfile(snap.data()))
        .catch(() => {});
    }, [])
  );

  // Same gate the Profile used: can sell memberships if payments are enabled.
  const canSellMemberships =
    profile?.stripeConnect?.status === "active" || profile?.hostConfig?.type === "paid";

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
            <Icon name="add" size={20} color="#FFFFFF" />
            <Text style={[TYPE.label, styles.createText]}>{t("manage.createEvent")}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Kinlo for Business — the host ERP/CRM module. Gated Pro; the row is
            always visible so non-Pro hosts discover it and hit the paywall. */}
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

        <SectionHeader title={t("manage.yourEvents")} />
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
            divider={false}
          />
        </View>

        <SectionHeader title={t("manage.business")} />
        <View style={card}>
          <ListRow
            icon="chart"
            title={t("manage.analytics")}
            subtitle={t("manage.analyticsSubtitle")}
            onPress={() => navigation.navigate("HostAnalytics")}
          />
          <ListRow
            icon="dollar"
            title={t("manage.finance")}
            subtitle={t("manage.financeSubtitle")}
            onPress={() => navigation.navigate("Finance")}
          />
          <ListRow
            icon="payment"
            title={t("manage.payments")}
            subtitle={t("manage.paymentsSubtitle")}
            onPress={() => navigation.navigate("StripeConnect")}
          />
          {canSellMemberships && (
            <ListRow
              icon="ticket"
              title={t("manage.membershipPlans")}
              subtitle={t("manage.membershipPlansSubtitle")}
              onPress={() => navigation.navigate("MembershipPlans")}
            />
          )}
          <ListRow
            icon="star"
            title={t("manage.ratings")}
            subtitle={t("manage.ratingsSubtitle")}
            onPress={() => navigation.navigate("RatingsOverview")}
            divider={false}
          />
        </View>

        <SectionHeader title={t("manage.community")} />
        <View style={card}>
          <ListRow
            icon="users"
            title={t("manage.members")}
            subtitle={t("manage.membersSubtitle")}
            onPress={() => navigation.navigate("HostCRM")}
          />
          <ListRow
            icon="community"
            title={t("manage.groups")}
            subtitle={t("manage.groupsSubtitle")}
            onPress={() => navigation.navigate("HostGroups")}
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
    justifyContent: "center",
    gap: SPACING.sm,
    height: 54,
    borderRadius: RADII.button,
    marginHorizontal: SPACING.screen,
    marginTop: SPACING.sm,
  },
  createText: { color: "#FFFFFF", fontSize: 16 },
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    marginHorizontal: SPACING.screen,
    overflow: "hidden",
  },
});
