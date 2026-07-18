/**
 * MyServicesScreen — the host's own marketplace services (Services P0/P2).
 *
 * Reached from the Services tab's "My services" entry (host mode). Lists the
 * business's services — public SessionTypes with a `vertical` (Category) set —
 * with Live (`publicListing:true`) / Paused (`publicListing:false`) status, and
 * lets the host edit / pause / unpublish each. Private (uncategorised) session
 * types are the CRM's, not shown here. Non-approved hosts hit the become-a-host
 * gate in-place (mirrors MyFleetScreen).
 *
 * P0 ships the gate + screen shell; P2 fills the list + management.
 */
import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import useUserRole from "../../hooks/useUserRole";
import { isApprovedHost } from "../../utils/hostGate";
import { ServiceHostGate } from "./PublishServiceScreen";

export default function MyServicesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { role, hostApproved, loading: roleLoading } = useUserRole();
  const approved = isApprovedHost({ role, hostApproved });
  const styles = createStyles(colors);

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
        <Text style={[styles.title, { color: colors.text }]}>{t("services.my.title")}</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate("PublishService")}
          testID="my-services-add"
        >
          <Icon name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content} />
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingTop: 60,
      paddingBottom: 12,
    },
    title: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.4, flex: 1, marginLeft: 10 },
    addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    content: { paddingHorizontal: 18, paddingBottom: 40 },
  });
}
