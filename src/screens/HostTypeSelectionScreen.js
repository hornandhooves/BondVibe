import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { doc, updateDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import * as WebBrowser from "expo-web-browser";
import {
  createConnectAccount,
  getAccountLink,
  checkAccountStatus,
} from "../services/stripeConnectService";
import { MERCADOPAGO_ENABLED } from "../config/featureFlags";

// Deep link the Stripe return page redirects to (intercepted by
// openAuthSessionAsync to auto-close the browser).
const STRIPE_RETURN_URL = "kinlo://stripe/return";

export default function HostTypeSelectionScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState(null);
  const [payoutProcessor, setPayoutProcessor] = useState("stripe");
  const [loading, setLoading] = useState(false);

  const { userEmail, fullName, fromProfile } = route.params || {};

  // Where to go once the user has made (or deferred) their choice. Opened from
  // Profile → pop back. During ONBOARDING → do NOT self-navigate: the hostConfig
  // write we just made re-fires the AppNavigator user-doc listener, which
  // advances the flow (→ AiOptIn → MainTabs), exactly like Legal/ProfileSetup.
  // (The old reset to "Home" targeted a route that no longer exists after the
  // 5-tab MainTabs refactor — a dead/no-op action that raced the router.)
  const goAfterSelection = () => {
    if (fromProfile && navigation.canGoBack()) {
      navigation.goBack();
    }
    // else: onboarding — the AppNavigator router takes over from here.
  };

  const handleDecideLater = async () => {
    setLoading(true);
    try {
      // User deferred. They remain a NORMAL user (role: "user", no host
      // privileges) but keep hostApproved so they can pick a type later from
      // their Profile. The "deferred" marker stops AppNavigator from
      // prompting them again on every login.
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        role: "user",
        "hostConfig.type": "deferred",
        "hostConfig.canCreatePaidEvents": false,
        "hostConfig.updatedAt": new Date().toISOString(),
      });
      console.log("✅ User deferred host type selection (stays normal user)");
      goAfterSelection();
    } catch (error) {
      console.error("❌ Error deferring selection:", error);
      Alert.alert(t("hostTypeSelection.error"), t("hostTypeSelection.couldNotContinue"));
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedType) {
      Alert.alert(
        t("hostTypeSelection.selectionRequired"),
        t("hostTypeSelection.selectionRequiredMessage")
      );
      return;
    }

    setLoading(true);

    try {
      if (selectedType === "free") {
        // Activate hosting as a Free Host (role becomes "host").
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          role: "host",
          "hostConfig.type": "free",
          "hostConfig.canCreatePaidEvents": false,
          "hostConfig.createdAt": new Date().toISOString(),
          "hostConfig.updatedAt": new Date().toISOString(),
        });

        console.log("✅ User set as Free Host");
        goAfterSelection();
      } else if (
        selectedType === "paid" &&
        payoutProcessor === "mercadopago" &&
        MERCADOPAGO_ENABLED
      ) {
        // Unreachable while the flag is off (the option isn't rendered and the
        // default is stripe) — the guard is here so a stale state can't write a
        // payoutProcessor the rest of the app now refuses to honour.
        // Mercado Pago payout (for hosts without an RFC). The MP account
        // connection is wired separately; for now we record the preference and
        // activate the paid host. canCreatePaidEvents stays false until the MP
        // account is connected/verified.
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          role: "host",
          "hostConfig.type": "paid",
          "hostConfig.payoutProcessor": "mercadopago",
          "hostConfig.canCreatePaidEvents": false,
          "hostConfig.createdAt": new Date().toISOString(),
          "hostConfig.updatedAt": new Date().toISOString(),
        });
        console.log("✅ User set as Paid Host (Mercado Pago, connection pending)");
        Alert.alert(
          t("hostTypeSelection.mercadoPago"),
          t("hostTypeSelection.mercadoPagoMessage")
        );
        goAfterSelection();
      } else if (selectedType === "paid") {
        // Create Stripe Connect account
        console.log("📤 Creating Stripe Connect account...");
        const accountResult = await createConnectAccount(
          auth.currentUser.uid,
          userEmail || auth.currentUser.email,
          fullName || t("hostTypeSelection.host")
        );

        if (!accountResult.success) {
          throw new Error(accountResult.error);
        }

        // Get onboarding link
        console.log("📤 Getting onboarding link...");
        const linkResult = await getAccountLink(auth.currentUser.uid);

        if (!linkResult.success) {
          throw new Error(linkResult.error);
        }

        // Open Stripe onboarding. openAuthSessionAsync auto-closes the browser
        // when Stripe redirects back to our return page.
        console.log("🌐 Opening Stripe onboarding...");
        await WebBrowser.openAuthSessionAsync(linkResult.url, STRIPE_RETURN_URL);

        // Activate hosting as a Paid Host. Do NOT hardcode canCreatePaidEvents:
        // an account already set up (e.g. via the rental flow) may already be
        // charge-enabled. Derive it from the real Stripe status below.
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          role: "host",
          "hostConfig.type": "paid",
          "hostConfig.payoutProcessor": "stripe",
          "hostConfig.createdAt": new Date().toISOString(),
          "hostConfig.updatedAt": new Date().toISOString(),
        });

        // Sync canCreatePaidEvents from Stripe (sets true when charges+details
        // are ready); never clobbers an already-active account.
        await checkAccountStatus(auth.currentUser.uid).catch(() => {});

        console.log("✅ User set as Paid Host (status synced from Stripe)");
        goAfterSelection();
      }
    } catch (error) {
      console.error("❌ Error setting up host:", error);
      Alert.alert(
        t("hostTypeSelection.setupError"),
        error.message || t("hostTypeSelection.setupErrorMessage")
      );
      setLoading(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={styles.header}>
        <View style={{ width: 50 }} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t("hostTypeSelection.chooseHostType")}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introSection}>
          <View style={styles.introIconTile}>
            <Icon name="tent" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.introTitle, { color: colors.text }]}>
            {t("hostTypeSelection.congratulations")}
          </Text>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            {t("hostTypeSelection.introText")}
          </Text>
        </View>

        {/* Free Host Option */}
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => setSelectedType("free")}
          activeOpacity={0.8}
          disabled={loading}
        >
          <View
            style={[
              styles.optionGlass,
              {
                backgroundColor:
                  selectedType === "free"
                    ? `${colors.primary}26`
                    : colors.surfaceGlass,
                borderColor:
                  selectedType === "free"
                    ? `${colors.primary}66`
                    : colors.border,
                opacity: loading ? 0.5 : 1,
              },
            ]}
          >
            <View style={styles.optionHeader}>
              <View style={styles.optionIconTile}>
                <Icon name="calendar" size={24} color={colors.primary} />
              </View>
              <View style={styles.optionTitleContainer}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  {t("hostTypeSelection.freeHostTitle")}
                </Text>
                <Text
                  style={[
                    styles.optionSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t("hostTypeSelection.freeHostSubtitle")}
                </Text>
              </View>
              {selectedType === "free" && (
                <Icon name="check" size={22} color={colors.primary} />
              )}
            </View>

            <View style={styles.featuresList}>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {t("hostTypeSelection.freeFeatureUnlimitedEvents")}
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {t("hostTypeSelection.freeFeatureBuildCommunity")}
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {t("hostTypeSelection.freeFeatureGetStarted")}
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {t("hostTypeSelection.freeFeatureUpgradeAnytime")}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.recommendBadge,
                { backgroundColor: `${colors.primary}15` },
              ]}
            >
              <Text style={[styles.recommendText, { color: colors.primary }]}>
                {t("hostTypeSelection.perfectForGettingStarted")}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Paid Host Option */}
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => setSelectedType("paid")}
          activeOpacity={0.8}
          disabled={loading}
        >
          <View
            style={[
              styles.optionGlass,
              {
                backgroundColor:
                  selectedType === "paid"
                    ? `${colors.primary}26`
                    : colors.surfaceGlass,
                borderColor:
                  selectedType === "paid"
                    ? `${colors.primary}66`
                    : colors.border,
                opacity: loading ? 0.5 : 1,
              },
            ]}
          >
            <View style={styles.optionHeader}>
              <View style={styles.optionIconTile}>
                <Icon name="dollar" size={24} color={colors.primary} />
              </View>
              <View style={styles.optionTitleContainer}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  {t("hostTypeSelection.paidHostTitle")}
                </Text>
                <Text
                  style={[
                    styles.optionSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t("hostTypeSelection.paidHostSubtitle")}
                </Text>
              </View>
              {selectedType === "paid" && (
                <Icon name="check" size={22} color={colors.primary} />
              )}
            </View>

            <View style={styles.featuresList}>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {t("hostTypeSelection.paidFeatureCreatePaidEvents")}
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {t("hostTypeSelection.paidFeatureAlsoFreeEvents")}
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {t("hostTypeSelection.paidFeatureReceiveDirectly")}
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  {t("hostTypeSelection.paidFeatureFeesCovered")}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.infoBadge,
                { backgroundColor: "rgba(255, 159, 10, 0.15)" },
              ]}
            >
              <Icon name="info" size={14} color={colors.warning} />
              <Text style={[styles.infoText, { color: colors.warning }]}>
                {t("hostTypeSelection.requiresStripeVerification")}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Payout processor — only when "paid" is selected */}
        {selectedType === "paid" && (
          <View style={styles.processorSection}>
            <Text style={[styles.processorLabel, { color: colors.textSecondary }]}>
              {t("hostTypeSelection.howDoYouWantToGetPaid")}
            </Text>
            {[
              {
                id: "stripe",
                title: t("hostTypeSelection.stripeTitle"),
                subtitle: t("hostTypeSelection.stripeSubtitle"),
              },
              // Hidden, not removed, until the Mercado Pago integration lands —
              // flipping MERCADOPAGO_ENABLED restores it verbatim. The list is a
              // vertical stack, so Stripe alone renders full-width and correct.
              ...(MERCADOPAGO_ENABLED
                ? [
                    {
                      id: "mercadopago",
                      title: t("hostTypeSelection.mercadoPagoTitle"),
                      subtitle: t("hostTypeSelection.mercadoPagoSubtitle"),
                    },
                  ]
                : []),
            ].map((opt) => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => setPayoutProcessor(opt.id)}
                activeOpacity={0.8}
                disabled={loading}
                style={[
                  styles.processorOption,
                  {
                    backgroundColor:
                      payoutProcessor === opt.id
                        ? `${colors.primary}1F`
                        : colors.surfaceGlass,
                    borderColor:
                      payoutProcessor === opt.id
                        ? `${colors.primary}66`
                        : colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.processorTitle, { color: colors.text }]}>
                    {opt.title}
                  </Text>
                  <Text
                    style={[
                      styles.processorSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {opt.subtitle}
                  </Text>
                </View>
                {payoutProcessor === opt.id && (
                  <Icon name="check" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          disabled={!selectedType || loading}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.continueGlass,
              {
                backgroundColor: `${colors.primary}33`,
                borderColor: `${colors.primary}66`,
                opacity: !selectedType || loading ? 0.5 : 1,
              },
            ]}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text
                  style={[
                    styles.continueText,
                    { color: colors.primary, marginLeft: 12 },
                  ]}
                >
                  {t("hostTypeSelection.settingUp")}
                </Text>
              </View>
            ) : (
              <Text style={[styles.continueText, { color: colors.primary }]}>
                {t("hostTypeSelection.continue")}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDecideLater}
          disabled={loading}
          style={styles.noteSection}
        >
          <Text
            style={[
              styles.noteText,
              { color: colors.textTertiary, opacity: loading ? 0.5 : 1 },
            ]}
          >
            {t("hostTypeSelection.decideLater")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    skipButton: {
      fontSize: 15,
      fontWeight: "600",
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    introSection: { alignItems: "center", marginBottom: 32 },
    introIconTile: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    introTitle: {
      fontSize: 28,
      fontWeight: "700",
      marginBottom: 12,
      letterSpacing: -0.5,
    },
    introText: {
      fontSize: 15,
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: 20,
    },
    optionCard: { borderRadius: 20, overflow: "hidden", marginBottom: 20 },
    optionGlass: { borderWidth: 1, padding: 20 },
    optionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    optionIconTile: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    optionTitleContainer: { flex: 1 },
    optionTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
    optionSubtitle: { fontSize: 13 },
    featuresList: { marginBottom: 16 },
    featureRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 10,
    },
    featureBullet: { marginRight: 10, marginTop: 3 },
    featureText: { fontSize: 14, flex: 1, lineHeight: 20 },
    recommendBadge: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignItems: "center",
    },
    recommendText: { fontSize: 13, fontWeight: "600" },
    infoBadge: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    infoText: { fontSize: 13, fontWeight: "600" },
    processorSection: { marginBottom: 16 },
    processorLabel: { fontSize: 14, fontWeight: "700", marginBottom: 10 },
    processorOption: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
    },
    processorTitle: { fontSize: 16, fontWeight: "700" },
    processorSubtitle: { fontSize: 13, marginTop: 2 },
    continueButton: { borderRadius: 16, overflow: "hidden", marginTop: 8 },
    continueGlass: {
      borderWidth: 1,
      paddingVertical: 18,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 58,
    },
    loadingRow: { flexDirection: "row", alignItems: "center" },
    continueText: { fontSize: 18, fontWeight: "700", letterSpacing: -0.3 },
    noteSection: { padding: 16, alignItems: "center", marginTop: 12 },
    noteText: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  });
}
