/**
 * MembershipCardScreen — host view of a member's digital membership / loyalty
 * card (dashboard handoff §paper-stack). The host can pull up any member's card
 * to show/verify it; the same card the member sees in "My memberships". Reuses
 * the shared MembershipCard (gradient + QR + credits + loyalty stamps).
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import MembershipCard from "../../components/business/MembershipCard";
import { useTheme } from "../../contexts/ThemeContext";
import { getMember } from "../../services/businessMembersService";
import { getBusiness } from "../../services/businessService";
import { FONTS } from "../../constants/theme-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";

export default function MembershipCardScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const memberId = route.params?.memberId;
  const [pass, setPass] = useState(null);
  const { loading, run } = useAsyncLoad();

  const load = useCallback(
    () =>
      run(async () => {
        const [m, biz] = await Promise.all([getMember(memberId), getBusiness()]);
        if (m && biz) {
          setPass({
            bizId: biz.id,
            memberId,
            businessName: biz.name || "",
            memberName: m.name || "",
            activePackage: m.activePackage || null,
            creditBalance: m.creditBalance || 0,
            visitsTotal: m.visitsTotal || 0,
          });
        }
      }),
    [memberId, run]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.card.title")}</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : pass ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <MembershipCard pass={pass} />
        </ScrollView>
      ) : (
        <View style={styles.loading}>
          <Text style={[styles.notFound, { color: colors.textTertiary }]}>{t("business.record.notFound")}</Text>
        </View>
      )}
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 60, paddingBottom: 8 },
    headerTitle: { fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.4 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 6 },
    notFound: { fontFamily: FONTS.bodyMedium, fontSize: 14 },
  });
}
