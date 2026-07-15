import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import Icon from "./Icon";

/**
 * Unified become-a-host gate (Marketplace P0).
 *
 * Rendered in place of a host-only surface (MyFleet, PublishVehicle — and
 * reusable for the Events host empty-state) when the user is NOT an approved
 * host. Its CTA routes into the EXISTING `RequestHost` flow — there is no
 * parallel rentals-only application. An event-approved host never sees this
 * (they're already `isApprovedHost`), which is the whole point: one approval,
 * every host capability.
 *
 * Pixel spec (rentals/FIDELITY §2–3): hero gradient #2A1E3D→#4A2A6E, CTA
 * gradient #7C3AED→#C026D3 with a soft brand shadow. Copy is passed in so the
 * surface (rentals / services) supplies its own strings; all default to i18n.
 */
export default function BecomeHostGate({
  navigation,
  title,
  body,
  note,
  ctaLabel,
  benefits,
  onBack,
  destination = "RequestHost",
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const s = createStyles(colors, isDark);

  const items = benefits || [
    { icon: "calendar", text: t("hostGate.benefitEvents") },
    { icon: "bike", text: t("hostGate.benefitRentals") },
    { icon: "verified", text: t("hostGate.benefitOne") },
  ];

  return (
    <View style={[s.wrap, { backgroundColor: colors.background }]}>
      {onBack && (
        <TouchableOpacity style={s.back} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="back" size={24} color={colors.text} />
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={["#2A1E3D", "#4A2A6E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <View style={s.heroIcon}>
            <Icon name="verified" size={30} color="#fff" />
          </View>
          <Text style={s.heroTitle}>{title || t("hostGate.title")}</Text>
          <Text style={s.heroBody}>{body || t("hostGate.body")}</Text>
        </LinearGradient>

        <View style={s.benefits}>
          {items.map((b, i) => (
            <View key={i} style={s.benefitRow}>
              <View style={[s.benefitIcon, { backgroundColor: colors.brandSoft }]}>
                <Icon name={b.icon} size={18} color={colors.primary} />
              </View>
              <Text style={[s.benefitText, { color: colors.text }]}>{b.text}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.note, { color: colors.textSecondary }]}>{note || t("hostGate.alreadyHost")}</Text>
      </ScrollView>

      <View style={[s.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate(destination)}
          style={s.ctaShadow}
        >
          <LinearGradient
            colors={["#7C3AED", "#C026D3"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.cta}
          >
            <Text style={s.ctaTxt}>{ctaLabel || t("hostGate.cta")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    back: { position: "absolute", top: 56, left: 18, zIndex: 5 },
    scroll: { paddingHorizontal: 18, paddingTop: 96, paddingBottom: 24 },
    hero: {
      borderRadius: 22,
      padding: 24,
      alignItems: "center",
      ...Platform.select({
        ios: { shadowColor: "rgba(42,30,61,0.3)", shadowOpacity: 1, shadowRadius: 30, shadowOffset: { width: 0, height: 14 } },
        android: { elevation: 10 },
      }),
    },
    heroIcon: {
      width: 60, height: 60, borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.14)",
      alignItems: "center", justifyContent: "center", marginBottom: 16,
    },
    heroTitle: {
      fontFamily: FONTS.bodyExtra, fontSize: 22, lineHeight: 28,
      color: "#fff", textAlign: "center", letterSpacing: -0.4, marginBottom: 10,
    },
    heroBody: {
      fontFamily: FONTS.bodyMedium, fontSize: 14.5, lineHeight: 21,
      color: "rgba(255,255,255,0.82)", textAlign: "center",
    },
    benefits: { marginTop: 22, gap: 14 },
    benefitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    benefitIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    benefitText: { flex: 1, fontFamily: FONTS.bodySemibold, fontSize: 14.5, lineHeight: 20 },
    note: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: 24 },
    footer: {
      borderTopWidth: 1,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: Platform.OS === "ios" ? 30 : 18,
    },
    ctaShadow: {
      borderRadius: 27,
      ...Platform.select({
        ios: { shadowColor: "#7C3AED", shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
        android: { elevation: 6 },
      }),
    },
    cta: { borderRadius: 27, paddingVertical: 16, alignItems: "center" },
    ctaTxt: { fontFamily: FONTS.bodyExtra, fontSize: 16, color: "#fff", letterSpacing: 0.2 },
  });
}
