import React, { useState } from "react";
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

// Deep link the Stripe return page redirects to (intercepted by
// openAuthSessionAsync to auto-close the browser).
const STRIPE_RETURN_URL = "kinlo://stripe/return";

export default function HostTypeSelectionScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const [selectedType, setSelectedType] = useState(null);
  const [payoutProcessor, setPayoutProcessor] = useState("stripe");
  const [loading, setLoading] = useState(false);

  const { userEmail, fullName, fromProfile } = route.params || {};

  // Where to go once the user has made (or deferred) their choice. From the
  // onboarding flow we land on Home; when opened from Profile we go back.
  const goAfterSelection = () => {
    if (fromProfile && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    }
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
      Alert.alert("Error", "Could not continue. Please try again.");
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedType) {
      Alert.alert(
        "Selection Required",
        "Please select a host type to continue."
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
      } else if (selectedType === "paid" && payoutProcessor === "mercadopago") {
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
          "Mercado Pago",
          "Connecting your Mercado Pago account isn't available yet — we're finishing that integration. You're set up as a host and can create free events for now; paid events unlock once your account is connected."
        );
        goAfterSelection();
      } else if (selectedType === "paid") {
        // Create Stripe Connect account
        console.log("📤 Creating Stripe Connect account...");
        const accountResult = await createConnectAccount(
          auth.currentUser.uid,
          userEmail || auth.currentUser.email,
          fullName || "Host"
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
        "Setup Error",
        error.message || "Could not complete setup. Please try again."
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
          Choose Host Type
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
            Congratulations!
          </Text>
          <Text style={[styles.introText, { color: colors.textSecondary }]}>
            You've been approved as a host. Now choose what type of events you'd
            like to create.
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
                  Hosting Free Events Only
                </Text>
                <Text
                  style={[
                    styles.optionSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  No Stripe account needed
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
                  Create unlimited free events
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Build your community
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Get started immediately
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Upgrade to paid events anytime
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
                Perfect for getting started
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
                  Hosting Free and Paid Events
                </Text>
                <Text
                  style={[
                    styles.optionSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  Requires Stripe account
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
                  Create paid events
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Also create free events
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Receive payments directly (100%)
                </Text>
              </View>
              <View style={styles.featureRow}>
                <View style={styles.featureBullet}>
                  <Icon name="check" size={14} color={colors.success} />
                </View>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Platform and processing fees covered by attendees
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
                Requires Stripe verification (1-2 days)
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Payout processor — only when "paid" is selected */}
        {selectedType === "paid" && (
          <View style={styles.processorSection}>
            <Text style={[styles.processorLabel, { color: colors.textSecondary }]}>
              How do you want to get paid?
            </Text>
            {[
              {
                id: "stripe",
                title: "Stripe",
                subtitle: "Direct to your bank · requires RFC (Mexico tax ID)",
              },
              {
                id: "mercadopago",
                title: "Mercado Pago",
                subtitle: "No RFC needed · great for foreigners in Mexico",
              },
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
                  Setting up...
                </Text>
              </View>
            ) : (
              <Text style={[styles.continueText, { color: colors.primary }]}>
                Continue
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
            Decide Later
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
