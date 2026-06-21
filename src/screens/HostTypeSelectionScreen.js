import React, { useState, useEffect } from "react";
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
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import * as WebBrowser from "expo-web-browser";
import {
  createConnectAccount,
  getAccountLink,
} from "../services/stripeConnectService";

export default function HostTypeSelectionScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const [selectedType, setSelectedType] = useState(null);
  const [loading, setLoading] = useState(false);

  const { userEmail, fullName } = route.params || {};

  // Listen for hostConfig changes and navigate to Home when detected
  useEffect(() => {
    if (!auth.currentUser) return;

    console.log("🔄 Setting up hostConfig listener in HostTypeSelection");

    const userDocRef = doc(db, "users", auth.currentUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const userData = docSnapshot.data();

        // If hostConfig was just created and we're in loading state
        if (userData.hostConfig && loading) {
          console.log(
            "✅ hostConfig detected, AppNavigator will handle navigation"
          );
          // Stop loading to allow AppNavigator to take over
          setLoading(false);
        }
      }
    });

    return () => {
      console.log("🔕 Cleaning up hostConfig listener");
      unsubscribe();
    };
  }, [loading]);

  // Handle skip - set as Free Host by default
  const handleSkip = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        "hostConfig.type": "free",
        "hostConfig.canCreatePaidEvents": false,
        "hostConfig.createdAt": new Date().toISOString(),
        "hostConfig.updatedAt": new Date().toISOString(),
      });
      console.log("✅ User skipped selection, defaulted to Free Host");
      // The onSnapshot above will detect this and stop loading
      // Then AppNavigator's onSnapshot will navigate to Home
    } catch (error) {
      console.error("❌ Error skipping selection:", error);
      Alert.alert("Error", "Could not skip selection. Please try again.");
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
        // Update user to Free Host
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          "hostConfig.type": "free",
          "hostConfig.canCreatePaidEvents": false,
          "hostConfig.createdAt": new Date().toISOString(),
          "hostConfig.updatedAt": new Date().toISOString(),
        });

        console.log("✅ User set as Free Host");
        // The onSnapshot will detect this change and navigate to Home
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

        // Open Stripe onboarding in browser
        console.log("🌐 Opening Stripe onboarding...");
        await WebBrowser.openBrowserAsync(linkResult.url);

        // After browser closes, the Firestore webhook will update the user
        // The onSnapshot will detect changes and navigate appropriately
        console.log("✅ Stripe onboarding opened, waiting for verification");
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
        <TouchableOpacity onPress={handleSkip} disabled={loading}>
          <Text
            style={[
              styles.skipButton,
              { color: colors.primary, opacity: loading ? 0.5 : 1 },
            ]}
          >
            Free Host →
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introSection}>
          <Text style={styles.introEmoji}>🎉</Text>
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
              <Text style={styles.optionEmoji}>🆓</Text>
              <View style={styles.optionTitleContainer}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  Free Host
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
                <Text style={[styles.checkmark, { color: colors.primary }]}>
                  ✓
                </Text>
              )}
            </View>

            <View style={styles.featuresList}>
              <View style={styles.featureRow}>
                <Text style={styles.featureBullet}>✓</Text>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Create unlimited free events
                </Text>
              </View>
              <View style={styles.featureRow}>
                <Text style={styles.featureBullet}>✓</Text>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Build your community
                </Text>
              </View>
              <View style={styles.featureRow}>
                <Text style={styles.featureBullet}>✓</Text>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Get started immediately
                </Text>
              </View>
              <View style={styles.featureRow}>
                <Text style={styles.featureBullet}>✓</Text>
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
              <Text style={styles.optionEmoji}>💰</Text>
              <View style={styles.optionTitleContainer}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  Paid Host
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
                <Text style={[styles.checkmark, { color: colors.primary }]}>
                  ✓
                </Text>
              )}
            </View>

            <View style={styles.featuresList}>
              <View style={styles.featureRow}>
                <Text style={styles.featureBullet}>✓</Text>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Create paid events
                </Text>
              </View>
              <View style={styles.featureRow}>
                <Text style={styles.featureBullet}>✓</Text>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Also create free events
                </Text>
              </View>
              <View style={styles.featureRow}>
                <Text style={styles.featureBullet}>✓</Text>
                <Text style={[styles.featureText, { color: colors.text }]}>
                  Receive payments directly (100%)
                </Text>
              </View>
              <View style={styles.featureRow}>
                <Text style={styles.featureBullet}>✓</Text>
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
              <Text style={[styles.infoText, { color: "#FF9F0A" }]}>
                ℹ️ Requires Stripe verification (1-2 days)
              </Text>
            </View>
          </View>
        </TouchableOpacity>

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

        <View style={styles.noteSection}>
          <Text style={[styles.noteText, { color: colors.textTertiary }]}>
            💡 You can always change your host type later from your profile
            settings.
          </Text>
        </View>
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
    backButton: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    skipButton: {
      fontSize: 15,
      fontWeight: "600",
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    introSection: { alignItems: "center", marginBottom: 32 },
    introEmoji: { fontSize: 64, marginBottom: 16 },
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
    optionGlass: { borderWidth: 2, padding: 20 },
    optionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    optionEmoji: { fontSize: 36, marginRight: 14 },
    optionTitleContainer: { flex: 1 },
    optionTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
    optionSubtitle: { fontSize: 13 },
    checkmark: { fontSize: 28, fontWeight: "700" },
    featuresList: { marginBottom: 16 },
    featureRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 10,
    },
    featureBullet: { fontSize: 16, marginRight: 10, color: "#34C759" },
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
      alignItems: "center",
    },
    infoText: { fontSize: 13, fontWeight: "600" },
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
