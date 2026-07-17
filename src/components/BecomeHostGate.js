import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { collection, query, where, limit, onSnapshot } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS, BRAND, HERO_PANEL } from "../constants/theme-tokens";
import Icon from "./Icon";

/**
 * Unified become-a-host gate.
 *
 * Rendered in place of a host-only surface (MyFleet, PublishVehicle — and
 * reusable for the Events host empty-state) when the user is NOT an approved
 * host. Its CTA routes into the EXISTING `RequestHost` flow — there is no
 * parallel rentals-only application. An event-approved host never sees this
 * (they're already `isApprovedHost`), which is the whole point: one approval,
 * every host capability.
 *
 * Two changes from the redesign:
 *
 * 1. It reads as an invitation, not an application form, and leads with the
 *    community rather than with verification.
 * 2. It no longer asks someone to apply when they already have. A request in
 *    flight means they started and stopped at the host-type step, so the gate
 *    picks the thread back up instead of pretending nothing happened.
 *
 * Colours come from tokens only — the hero and CTA gradients used to be
 * hardcoded hex, which would have survived a rebrand and quietly become the
 * only purple left in the app.
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

  // Is there already an application in flight? Live, so a request filed on
  // another device (or just now) reflects here without a relaunch.
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // Filter by userId — the rule only proves a request is readable when it's
    // the caller's own, so a broader query would just be denied.
    const q = query(
      collection(db, "hostRequests"),
      where("userId", "==", uid),
      where("status", "==", "pending"),
      limit(1)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setPending(!snap.empty),
      // Never let this break the gate: no answer means show the invitation,
      // which is the safe default — the worst case is an extra tap.
      (e) => console.warn("host request lookup failed:", e?.message)
    );
    return unsub;
  }, []);

  const items = benefits || [
    { icon: "chat", text: t("hostGate.benefitChat") },
    { icon: "users", text: t("hostGate.benefitMembers") },
    { icon: "matching", text: t("hostGate.benefitMatching") },
    { icon: "chart", text: t("hostGate.benefitInsights") },
  ];

  return (
    <View style={[s.wrap, { backgroundColor: colors.background }]}>
      {onBack && (
        <TouchableOpacity
          style={s.back}
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="back" size={24} color={colors.text} />
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={HERO_PANEL}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <View style={s.heroIcon}>
            {/* Community, not a verification badge: this is an invitation to
                gather people, not a vetting process. */}
            <Icon name="community" size={30} color={colors.onPrimary} />
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

        <Text style={[s.note, { color: colors.textSecondary }]}>
          {note || t("hostGate.alreadyHost")}
        </Text>
      </ScrollView>

      <View style={[s.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        {pending && (
          <View style={[s.pending, { backgroundColor: colors.warnSoft }]}>
            <Icon name="clock" size={14} color={colors.warning} />
            <Text style={[s.pendingText, { color: colors.warning }]}>
              {t("hostGate.pendingNote")}
            </Text>
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.9}
          // A pending request means they stopped at the host-type step, so send
          // them there rather than back through a form they already filled in.
          onPress={() =>
            navigation.navigate(pending ? "HostTypeSelection" : destination)
          }
          style={s.ctaShadow}
        >
          {/* BRAND.gradient, not colors.gradientPrimary: the brand gradient is
              identical in both themes, so reading it off the theme object would
              imply a variation that doesn't exist. */}
          <LinearGradient
            colors={BRAND.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.cta}
          >
            <Text style={s.ctaTxt}>
              {pending ? t("hostGate.ctaResume") : ctaLabel || t("hostGate.cta")}
            </Text>
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
      // Hero + CTAs are the only surfaces that carry a shadow (design system §3).
      ...Platform.select({
        ios: {
          shadowColor: colors.hardShadow,
          shadowOpacity: 1,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 14 },
        },
        android: { elevation: 10 },
      }),
    },
    heroIcon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: colors.glow,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    heroTitle: {
      fontFamily: FONTS.display,
      fontSize: 22,
      lineHeight: 28,
      color: colors.onPrimary,
      textAlign: "center",
      letterSpacing: -0.4,
      marginBottom: 10,
    },
    heroBody: {
      fontFamily: FONTS.bodyMedium,
      fontSize: 14.5,
      lineHeight: 21,
      color: colors.onPrimary,
      opacity: 0.82,
      textAlign: "center",
    },
    benefits: { marginTop: 22, gap: 14 },
    benefitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    benefitIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    benefitText: { flex: 1, fontFamily: FONTS.bodySemibold, fontSize: 14.5, lineHeight: 20 },
    note: {
      fontFamily: FONTS.bodyMedium,
      fontSize: 12.5,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 24,
    },
    footer: {
      borderTopWidth: 1,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: Platform.OS === "ios" ? 30 : 18,
    },
    pending: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 10,
    },
    pendingText: { fontFamily: FONTS.bodySemibold, fontSize: 12.5, flex: 1, lineHeight: 17 },
    ctaShadow: {
      borderRadius: 27,
      ...Platform.select({
        ios: {
          shadowColor: colors.primary,
          shadowOpacity: 0.28,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
        },
        android: { elevation: 6 },
      }),
    },
    cta: { borderRadius: 27, paddingVertical: 16, alignItems: "center" },
    ctaTxt: {
      fontFamily: FONTS.bodyExtra,
      fontSize: 16,
      color: colors.onPrimary,
      letterSpacing: 0.2,
    },
  });
}
