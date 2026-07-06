import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { usePremium } from "../hooks/usePremium";
import { startProCheckout, openProPortal } from "../services/proService";

const PRO_PRICE_LABEL = "$199 MXN / mo";

const PRO_FEATURES = [
  { icon: "ai", title: "AI coaching", desc: "Recommendations to improve your events based on your reviews" },
  { icon: "chart", title: "Advanced insights", desc: "Trends, sentiment and benchmark vs your category" },
  { icon: "qr", title: "QR check-in", desc: "Take attendance at the event door" },
  { icon: "users", title: "Attendee CRM", desc: "History, regulars and alerts on who needs attention" },
  { icon: "chat", title: "Messaging + unlimited groups", desc: "Mass announcements and unlimited groups" },
];

export default function BondVibeProScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { isPremium, loading } = usePremium();
  const [working, setWorking] = useState(false);
  const styles = createStyles(colors, isDark);

  const openCheckout = async () => {
    setWorking(true);
    try {
      await startProCheckout();
    } catch (e) {
      Alert.alert("Pro", e.message || "Could not start checkout.");
    } finally {
      setWorking(false);
    }
  };

  const openPortal = async () => {
    setWorking(true);
    try {
      await openProPortal();
    } catch (e) {
      Alert.alert("Pro", e.message || "Could not open the billing portal.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Kinlo Pro</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { borderColor: `${colors.primary}55`, backgroundColor: `${colors.primary}12` }]}>
          <Icon name="pro" size={40} color={colors.primary} />
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            {isPremium ? "You're Pro" : "Take your events to the next level"}
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            {isPremium
              ? "You have access to all Pro features."
              : "Tools for hosts who want to grow and retain their community."}
          </Text>
        </View>

        <View style={styles.features}>
          {PRO_FEATURES.map(({ icon, title, desc }) => (
            <View key={title} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: colors.brandSoft }]}>
                <Icon name={icon} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{desc}</Text>
              </View>
              {isPremium && <Icon name="check" size={18} color={colors.primary} />}
            </View>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : isPremium ? (
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border, opacity: working ? 0.6 : 1 }]}
            onPress={openPortal}
            disabled={working}
          >
            {working ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={[styles.secondaryText, { color: colors.text }]}>Manage subscription</Text>
            )}
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: colors.primary, opacity: working ? 0.7 : 1 }]}
              onPress={openCheckout}
              activeOpacity={0.9}
              disabled={working}
            >
              {working ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="pro" size={18} color="#fff" />
                  <Text style={styles.ctaText}>Go Pro · {PRO_PRICE_LABEL}</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={[styles.finePrint, { color: colors.textTertiary }]}>
              Payment is processed securely in your browser. Your Pro access
              activates automatically once payment completes.
            </Text>
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)";
  const cardBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    hero: {
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 20,
      padding: 24,
      gap: 10,
      marginBottom: 24,
    },
    heroTitle: { fontSize: 22, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 },
    heroSubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    features: { gap: 12 },
    featureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    featureIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    featureTitle: { fontSize: 15, fontWeight: "700" },
    featureDesc: { fontSize: 13, marginTop: 2, lineHeight: 18 },
    cta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 16,
      paddingVertical: 16,
      marginTop: 24,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    finePrint: { fontSize: 12, textAlign: "center", marginTop: 12, lineHeight: 17 },
    secondaryBtn: {
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 24,
    },
    secondaryText: { fontSize: 15, fontWeight: "700" },
  });
}
