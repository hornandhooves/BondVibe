/**
 * PublishServiceScreen — publish a service to the Kinlo marketplace (Services P0/P1).
 *
 * Reached from the Services tab's "Publish service" FAB (host mode). A "service"
 * is a public SessionType (`publicListing:true`) under businesses/{bizId}/
 * sessionTypes — the SAME model the CRM's private sessions use, minus the toggle:
 * publishing from here always sets publicListing:true. Non-approved hosts hit the
 * become-a-host gate in-place (mirrors MyFleetScreen), because the server
 * (firestore.rules) requires an approved host to create a public listing — and a
 * verified + insured business for at-home (at_customer) services.
 *
 * P0 ships the gate + screen shell; P1 fills the form.
 */
import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import BecomeHostGate from "../../components/BecomeHostGate";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import useUserRole from "../../hooks/useUserRole";
import { isApprovedHost } from "../../utils/hostGate";

/** The 3-benefit invitation shown to a not-yet-approved host (mock screen 4). */
export function ServiceHostGate({ navigation, onBack }) {
  const { t } = useTranslation();
  return (
    <BecomeHostGate
      navigation={navigation}
      onBack={onBack}
      title={t("services.gate.title")}
      body={t("services.gate.body")}
      ctaLabel={t("services.gate.cta")}
      note={t("services.gate.note")}
      benefits={[
        { icon: "tag", text: t("services.gate.benefitList") },
        { icon: "events", text: t("services.gate.benefitEvents") },
        { icon: "dollar", text: t("services.gate.benefitStripe") },
      ]}
    />
  );
}

export default function PublishServiceScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { role, hostApproved, loading: roleLoading } = useUserRole();
  const approved = isApprovedHost({ role, hostApproved });
  const styles = createStyles(colors);

  // Unified host gate: publishing a public listing requires an approved host.
  // The server enforces the same on create — this is the UX layer.
  if (!roleLoading && !approved) {
    return (
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ServiceHostGate navigation={navigation} onBack={() => navigation.goBack()} />
      </>
    );
  }

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.title, { color: colors.text }]}>{t("services.publish.title")}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("services.publish.subtitle")}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" />
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 18, paddingTop: 60, paddingBottom: 10 },
    title: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.4 },
    subtitle: { fontFamily: FONTS.bodyMedium, fontSize: 13, marginTop: 3, lineHeight: 18 },
    content: { paddingHorizontal: 18, paddingBottom: 40 },
  });
}
