import Icon from "../components/Icon";
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { useFocusEffect } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import { friendlyCallableError } from "../utils/callableError";
import {
  createConnectAccount,
  getAccountLink,
  checkAccountStatus,
} from "../services/stripeConnectService";

// Deep link the Stripe return/refresh pages redirect to. openAuthSessionAsync
// watches for this URL to auto-close the browser and return to the app.
const STRIPE_RETURN_URL = "kinlo://stripe/return";

export default function StripeConnectScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [userData, setUserData] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data());
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStatus = async ({ silent = false } = {}) => {
    setRefreshing(true);
    try {
      const result = await checkAccountStatus(auth.currentUser.uid);
      if (result.success) {
        await loadData();
        if (!silent) {
          Alert.alert(
            t("stripeConnect.statusUpdatedTitle"),
            t("stripeConnect.statusUpdatedMessage")
          );
        }
      } else if (!silent) {
        Alert.alert(t("stripeConnect.errorTitle"), result.error || t("stripeConnect.couldNotRefresh"));
      }
    } catch (error) {
      console.error("Error refreshing status:", error);
      if (!silent) {
        Alert.alert(t("stripeConnect.errorTitle"), t("stripeConnect.couldNotRefreshRetry"));
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleConnectStripe = async () => {
    setConnecting(true);
    try {
      // ✅ NUEVO: Si no hay cuenta de Stripe, crearla primero
      if (!userData.stripeConnect?.accountId) {
        console.log("📤 No Stripe account found, creating one...");
        const accountResult = await createConnectAccount(
          auth.currentUser.uid,
          userData.email || auth.currentUser.email,
          userData.fullName || t("stripeConnect.defaultHostName")
        );

        if (!accountResult.success) {
          throw new Error(accountResult.error);
        }

        console.log("✅ Stripe account created:", accountResult.accountId);

        // Recargar userData para obtener la nueva cuenta
        await loadData();
      }

      // Ahora obtener el onboarding link
      console.log("📤 Getting onboarding link...");
      const linkResult = await getAccountLink(auth.currentUser.uid);

      if (!linkResult.success) {
        throw new Error(linkResult.error);
      }

      console.log("🌐 Opening Stripe onboarding...");
      // openAuthSessionAsync auto-closes the browser when Stripe redirects to
      // our return/refresh page (which deep-links back to STRIPE_RETURN_URL),
      // returning control to the app without a manual "Open App" tap.
      await WebBrowser.openAuthSessionAsync(linkResult.url, STRIPE_RETURN_URL);

      // Whether they finished, deferred, or just closed the browser, sync the
      // real status from Stripe so the UI reflects reality instead of showing
      // a misleading "Verification Incomplete" message.
      await handleRefreshStatus({ silent: true });
    } catch (error) {
      console.error("❌ Error connecting Stripe:", error);
      // Map known callable codes (e.g. email_not_verified from createConnectAccount)
      // to friendly copy instead of surfacing the raw code.
      Alert.alert(
        t("stripeConnect.connectionErrorTitle"),
        friendlyCallableError(error, t, "stripeConnect.couldNotConnect")
      );
    } finally {
      setConnecting(false);
    }
  };

  const styles = createStyles(colors);

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const stripeConnect = userData?.stripeConnect;
  const hostConfig = userData?.hostConfig;
  const isActive = stripeConnect?.status === "active";
  const isPending = stripeConnect?.status === "pending";
  const canCreatePaidEvents = hostConfig?.canCreatePaidEvents;
  // Can charge attendees but Stripe isn't releasing funds to the bank yet.
  const payoutsPending =
    stripeConnect?.chargesEnabled && !stripeConnect?.payoutsEnabled;

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t("stripeConnect.title")}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefreshStatus}
            tintColor={colors.primary}
          />
        }
      >
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusGlass,
              {
                backgroundColor: isActive
                  ? "rgba(52, 199, 89, 0.1)"
                  : isPending
                  ? "rgba(255, 159, 10, 0.1)"
                  : colors.surfaceGlass,
                borderColor: isActive
                  ? "rgba(52, 199, 89, 0.3)"
                  : isPending
                  ? "rgba(255, 159, 10, 0.3)"
                  : colors.border,
              },
            ]}
          >
            <Icon
              name={isActive ? "successCircle" : isPending ? "clock" : "payment"}
              size={40}
              color={isActive ? colors.success : isPending ? colors.warning : colors.primary}
            />
            <Text style={[styles.statusTitle, { color: colors.text }]}>
              {isActive
                ? t("stripeConnect.accountActive")
                : isPending
                ? t("stripeConnect.verificationPending")
                : t("stripeConnect.notConnected")}
            </Text>
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              {isActive
                ? t("stripeConnect.canCreatePaidEvents")
                : isPending
                ? t("stripeConnect.beingVerified")
                : t("stripeConnect.connectToCreatePaidEvents")}
            </Text>

            {canCreatePaidEvents && (
              <View
                style={[
                  styles.featureBadge,
                  { backgroundColor: "rgba(52, 199, 89, 0.15)" },
                ]}
              >
                <Text style={styles.featureBadgeText}>
                  {t("stripeConnect.paidEventsEnabled")}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Current Host Type Info */}
        <View style={styles.hostTypeCard}>
          <View
            style={[
              styles.hostTypeGlass,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <Icon
              name={hostConfig?.type === "paid" ? "dollar" : hostConfig?.type === "free" ? "calendar" : "pro"}
              size={28}
              color={colors.primary}
            />
            <Text style={[styles.hostTypeTitle, { color: colors.text }]}>
              {t("stripeConnect.current", {
                type:
                  hostConfig?.type === "paid"
                    ? t("stripeConnect.paidHost")
                    : hostConfig?.type === "free"
                    ? t("stripeConnect.freeHost")
                    : t("stripeConnect.hostTypeNotSelected"),
              })}
            </Text>
            <Text
              style={[styles.hostTypeText, { color: colors.textSecondary }]}
            >
              {hostConfig?.type === "paid"
                ? t("stripeConnect.canCreateBoth")
                : hostConfig?.type === "free"
                ? t("stripeConnect.canCreateFreeOnly")
                : t("stripeConnect.chooseHostType")}
            </Text>
          </View>
        </View>

        {/* Payouts pending warning */}
        {payoutsPending && (
          <View style={styles.detailsCard}>
            <View
              style={[
                styles.detailsGlass,
                {
                  backgroundColor: "rgba(255, 159, 10, 0.1)",
                  borderColor: "rgba(255, 159, 10, 0.3)",
                },
              ]}
            >
              <Text style={[styles.detailsTitle, { color: colors.warning }]}>
                {t("stripeConnect.payoutsNotActiveTitle")}
              </Text>
              <Text
                style={[styles.statusText, { color: colors.textSecondary, textAlign: "left", marginBottom: 12 }]}
              >
                {t("stripeConnect.payoutsNotActiveMessage")}
              </Text>
              <TouchableOpacity onPress={handleConnectStripe} disabled={connecting}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {connecting ? t("stripeConnect.opening") : t("stripeConnect.completeSetupArrow")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Details Card */}
        {stripeConnect?.accountId && (
          <View style={styles.detailsCard}>
            <View
              style={[
                styles.detailsGlass,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.detailsTitle, { color: colors.text }]}>
                {t("stripeConnect.accountDetails")}
              </Text>

              <View style={styles.detailRow}>
                <Text
                  style={[styles.detailLabel, { color: colors.textSecondary }]}
                >
                  {t("stripeConnect.accountId")}
                </Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {stripeConnect.accountId.substring(0, 12)}...
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text
                  style={[styles.detailLabel, { color: colors.textSecondary }]}
                >
                  {t("stripeConnect.chargesEnabled")}
                </Text>
                <Text
                  style={[
                    styles.detailValue,
                    {
                      color: stripeConnect.chargesEnabled
                        ? "#34C759"
                        : colors.textTertiary,
                    },
                  ]}
                >
                  {stripeConnect.chargesEnabled ? t("stripeConnect.yes") : t("stripeConnect.no")}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text
                  style={[styles.detailLabel, { color: colors.textSecondary }]}
                >
                  {t("stripeConnect.payoutsEnabled")}
                </Text>
                <Text
                  style={[
                    styles.detailValue,
                    {
                      color: stripeConnect.payoutsEnabled
                        ? "#34C759"
                        : colors.textTertiary,
                    },
                  ]}
                >
                  {stripeConnect.payoutsEnabled ? t("stripeConnect.yes") : t("stripeConnect.no")}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text
                  style={[styles.detailLabel, { color: colors.textSecondary }]}
                >
                  {t("stripeConnect.detailsSubmitted")}
                </Text>
                <Text
                  style={[
                    styles.detailValue,
                    {
                      color: stripeConnect.detailsSubmitted
                        ? "#34C759"
                        : colors.textTertiary,
                    },
                  ]}
                >
                  {stripeConnect.detailsSubmitted ? t("stripeConnect.yes") : t("stripeConnect.no")}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <View
            style={[
              styles.infoGlass,
              {
                backgroundColor: `${colors.primary}15`,
                borderColor: `${colors.primary}40`,
              },
            ]}
          >
            <Icon name="dollar" size={28} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.text }]}>
              {t("stripeConnect.howPaymentsWork")}
            </Text>
            <View style={styles.infoList}>
              <Text style={[styles.infoItem, { color: colors.textSecondary }]}>
                {t("stripeConnect.infoReceive100")}
              </Text>
              <Text style={[styles.infoItem, { color: colors.textSecondary }]}>
                {t("stripeConnect.infoFees")}
              </Text>
              <Text style={[styles.infoItem, { color: colors.textSecondary }]}>
                {t("stripeConnect.infoAttendeesSeeTotal")}
              </Text>
              <Text style={[styles.infoItem, { color: colors.textSecondary }]}>
                {t("stripeConnect.infoDirectPayments")}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        {!isActive && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleConnectStripe}
            disabled={connecting}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.actionGlass,
                {
                  backgroundColor: `${colors.primary}33`,
                  borderColor: `${colors.primary}66`,
                  opacity: connecting ? 0.5 : 1,
                },
              ]}
            >
              {connecting ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text
                    style={[
                      styles.actionText,
                      { color: colors.primary, marginLeft: 12 },
                    ]}
                  >
                    {stripeConnect?.accountId
                      ? t("stripeConnect.connecting")
                      : t("stripeConnect.settingUp")}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.actionText, { color: colors.primary }]}>
                  {isPending
                    ? t("stripeConnect.completeVerification")
                    : stripeConnect?.accountId
                    ? t("stripeConnect.continueSetup")
                    : t("stripeConnect.connectAccount")}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefreshStatus}
          disabled={refreshing}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.refreshGlass,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
                opacity: refreshing ? 0.5 : 1,
              },
            ]}
          >
            <Text style={[styles.refreshText, { color: colors.text }]}>
              {t("stripeConnect.refreshStatus")}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.noteSection}>
          <Text style={[styles.noteText, { color: colors.textTertiary }]}>
            {t("stripeConnect.verificationNote")}
          </Text>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    statusCard: {
      borderRadius: 20,
      overflow: "hidden",
      marginBottom: 20,
    },
    statusGlass: {
      borderWidth: 1,
      padding: 24,
      alignItems: "center",
    },
    statusEmoji: { fontSize: 56, marginBottom: 16 },
    statusTitle: {
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 8,
      letterSpacing: -0.4,
    },
    statusText: {
      fontSize: 14,
      textAlign: "center",
      lineHeight: 21,
      marginBottom: 16,
    },
    featureBadge: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 10,
      marginTop: 8,
    },
    featureBadgeText: {
      fontSize: 13,
      fontWeight: "600",
      color: "#34C759",
    },
    hostTypeCard: {
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 20,
    },
    hostTypeGlass: {
      borderWidth: 1,
      padding: 18,
      alignItems: "center",
    },
    hostTypeEmoji: { fontSize: 36, marginBottom: 12 },
    hostTypeTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 8,
      letterSpacing: -0.3,
    },
    hostTypeText: {
      fontSize: 13,
      textAlign: "center",
      lineHeight: 19,
    },
    detailsCard: {
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 20,
    },
    detailsGlass: {
      borderWidth: 1,
      padding: 18,
    },
    detailsTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 16,
      letterSpacing: -0.3,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(0, 0, 0, 0.05)",
    },
    detailLabel: { fontSize: 14 },
    detailValue: { fontSize: 14, fontWeight: "600" },
    infoCard: {
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 20,
    },
    infoGlass: {
      borderWidth: 1,
      padding: 20,
    },
    infoEmoji: { fontSize: 36, marginBottom: 12 },
    infoTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 14,
      letterSpacing: -0.3,
    },
    infoList: { gap: 8 },
    infoItem: { fontSize: 14, lineHeight: 21 },
    actionButton: {
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 12,
    },
    actionGlass: {
      borderWidth: 1,
      paddingVertical: 18,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 58,
    },
    loadingRow: { flexDirection: "row", alignItems: "center" },
    actionText: { fontSize: 17, fontWeight: "700", letterSpacing: -0.3 },
    refreshButton: {
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 20,
    },
    refreshGlass: {
      borderWidth: 1,
      paddingVertical: 14,
      alignItems: "center",
    },
    refreshText: { fontSize: 15, fontWeight: "600" },
    noteSection: { padding: 16, alignItems: "center" },
    noteText: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  });
}
