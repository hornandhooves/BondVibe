import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
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
import { doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import {
  getHostMembershipPlans,
  formatPlanPrice,
  describePlan,
  audienceAllows,
} from "../services/membershipService";
import { listOnlinePlans } from "../services/plansService";
import { getMyPricingTierForHost } from "../services/businessMembersService";

export default function HostMembershipsScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { hostId, hostName: hostNameParam } = route.params || {};
  const [plans, setPlans] = useState([]);
  const [hostName, setHostName] = useState(hostNameParam || "");
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [hostId])
  );

  const load = async () => {
    const [unified, legacy, hostSnap, myTier] = await Promise.all([
      // Already filtered to what a member can buy for themselves: a manual-only
      // plan is the host's to hand out, and showing it with a Buy button would
      // sell something that has no online price path.
      listOnlinePlans(hostId),
      getHostMembershipPlans(hostId, { activeOnly: true }),
      getDoc(doc(db, "users", hostId)),
      getMyPricingTierForHost(hostId),
    ]);
    // TRANSITIONAL — REMOVE AFTER PLANS MIGRATION (scripts/migrate-plans.mjs --apply)
    //
    // `plans` is empty until the migration runs, and the migration deliberately
    // waits until these screens are verified in a build. Reading only the new
    // source in between would leave members unable to buy anything — an outage
    // caused purely by ordering. Legacy membershipPlans were the online-sold
    // ones by definition, so they stand in safely.
    //
    // It goes quiet on its own the moment the migration runs, which is exactly
    // why it needs deleting deliberately: once `plans` is populated this line
    // never takes the fallback again, so it will look harmless forever while
    // quietly keeping a dead read (and the whole membershipService import) alive.
    //
    // To remove: drop `legacy` from the Promise.all, drop this branch, and drop
    // getHostMembershipPlans from the import above if nothing else uses it.
    const data = unified.length ? unified : legacy;
    // Purchase scope (kinlo_business/05 §G): only show plans this buyer's tier
    // is allowed to buy (local-only plans hidden from general members).
    setPlans(data.filter((p) => audienceAllows(p.audienceTier, myTier)));
    if (hostSnap.exists()) {
      const d = hostSnap.data();
      setHostName(d.fullName || d.name || hostNameParam || t("hostMemberships.host"));
    }
    setLoading(false);
  };

  const styles = createStyles(colors, isDark);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {hostName ? t("hostMemberships.hostPlans", { hostName }) : t("hostMemberships.membershipPlans")}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : plans.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="ticket" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("hostMemberships.noPlansAvailable")}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t("hostMemberships.noPlansAvailableSubtitle")}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {t("hostMemberships.introText")}
          </Text>
          {plans.map((plan) => {
            return (
              <View key={plan.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.iconCircle}>
                    <Icon name="ticket" size={20} color={colors.primary} />
                  </View>
                  <Text style={[styles.planName, { color: colors.text }]} numberOfLines={1}>
                    {plan.name}
                  </Text>
                  <Text style={[styles.planPrice, { color: colors.primary }]}>
                    {formatPlanPrice(plan.priceCentavos)}
                  </Text>
                </View>
                <Text style={[styles.planMeta, { color: colors.textSecondary }]}>
                  {describePlan(plan)}
                </Text>
                {!!plan.description && (
                  <>
                    <Text style={[styles.sectionHeading, { color: colors.text }]}>
                      {t("hostMemberships.whatsIncluded")}
                    </Text>
                    <Text style={[styles.planDesc, { color: colors.textTertiary }]}>
                      {plan.description}
                    </Text>
                  </>
                )}
                {!!plan.terms && (
                  <>
                    <Text style={[styles.sectionHeading, { color: colors.text }]}>
                      {t("hostMemberships.termsAndConditions")}
                    </Text>
                    <Text style={[styles.planDesc, { color: colors.textTertiary }]}>
                      {plan.terms}
                    </Text>
                  </>
                )}
                <TouchableOpacity
                  style={styles.buyButton}
                  onPress={() => navigation.navigate("MembershipCheckout", { plan })}
                  activeOpacity={0.85}
                >
                  <View
                    style={[
                      styles.buyGlass,
                      { backgroundColor: `${colors.primary}33`, borderColor: `${colors.primary}66` },
                    ]}
                  >
                    <Text style={[styles.buyText, { color: colors.primary }]}>{t("hostMemberships.buy")}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", flex: 1, textAlign: "center" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    intro: { fontSize: 14, lineHeight: 21, marginBottom: 20 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
    emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
      padding: 16,
      marginBottom: 12,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.primary}1F`,
    },
    planName: { fontSize: 16, fontWeight: "700", flex: 1 },
    planPrice: { fontSize: 16, fontWeight: "700" },
    planMeta: { fontSize: 13, marginBottom: 4, marginLeft: 52 },
    sectionHeading: {
      fontSize: 13,
      fontWeight: "700",
      marginLeft: 52,
      marginTop: 10,
      marginBottom: 2,
    },
    planDesc: { fontSize: 13, lineHeight: 18, marginLeft: 52 },
    buyButton: { borderRadius: 12, overflow: "hidden", marginTop: 14 },
    buyGlass: {
      borderWidth: 1,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    buyText: { fontSize: 15, fontWeight: "700" },
  });
}
