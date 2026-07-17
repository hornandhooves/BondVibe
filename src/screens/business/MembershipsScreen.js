/**
 * MembershipsScreen — everything the host sells, as ONE list.
 *
 * Replaces PackagesScreen, and with it the split that made a host learn two
 * screens for one idea: packages (assigned by hand) and membership plans (sold
 * online) were the same product filed under different verbs. The channel is a
 * badge now, not a separate section — and Membership Plans finally has a home,
 * having been reachable only by creating a paid event.
 */
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import { listPlans } from "../../services/plansService";
import {
  PLAN_KIND,
  PAYMENT_MODE,
  MEMBERSHIP_AUDIENCE,
  sanitizePaymentModes,
} from "../../constants/plans";
import { formatCentavos } from "../../utils/pricing";

/** Icon per kind — the same three the model already had. */
const KIND_ICON = {
  [PLAN_KIND.CLASS]: "ticket",
  [PLAN_KIND.SESSION]: "clock",
  [PLAN_KIND.EVENT]: "calendar",
};

export default function MembershipsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      setPlans(await listPlans());
    } catch (e) {
      console.warn("plans load failed:", e?.message);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const s = createStyles(colors);
  const openForm = (planId) => navigation.navigate("BusinessPlanForm", planId ? { planId } : {});

  /** "10 credits · valid 60 days · class pack" — the line under the name. */
  const describe = (p) => {
    const bits = [
      p.unlimited
        ? t("plans.unlimited")
        : t("plans.creditsCount", { count: p.credits || 0 }),
      p.validityDays
        ? t("plans.validDays", { days: p.validityDays })
        : t("plans.noExpiry"),
      t(`plans.kind.${p.kind || PLAN_KIND.CLASS}`),
    ];
    return bits.join(" · ");
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>{t("plans.title")}</Text>
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => openForm(null)}
          accessibilityRole="button"
          testID="plans-add"
        >
          <Icon name="plus" size={20} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={s.empty}>
          <Text style={[s.emptyTitle, { color: colors.text }]}>{t("plans.errorTitle")}</Text>
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>{t("plans.errorText")}</Text>
          <TouchableOpacity style={[s.cta, { backgroundColor: colors.primary }]} onPress={load}>
            <Text style={[s.ctaText, { color: colors.onPrimary }]}>{t("plans.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : plans.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyArt, { backgroundColor: colors.brandSoft }]}>
            <Icon name="ticket" size={32} color={colors.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.text }]}>{t("plans.emptyTitle")}</Text>
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>{t("plans.emptyText")}</Text>
          <TouchableOpacity style={[s.cta, { backgroundColor: colors.primary }]} onPress={() => openForm(null)}>
            <Text style={[s.ctaText, { color: colors.onPrimary }]}>{t("plans.addFirst")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={[s.subtitle, { color: colors.textSecondary }]}>{t("plans.subtitle")}</Text>

          {plans.map((p) => {
            const modes = sanitizePaymentModes(p.paymentModes);
            return (
              <TouchableOpacity
                key={p.id}
                style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => openForm(p.id)}
                activeOpacity={0.85}
                testID={`plan-${p.id}`}
              >
                <View style={[s.kindIcon, { backgroundColor: colors.brandSoft }]}>
                  <Icon name={KIND_ICON[p.kind] || "ticket"} size={20} color={colors.primary} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { color: colors.text }]}>{p.name}</Text>
                  <Text style={[s.meta, { color: colors.textSecondary }]}>{describe(p)}</Text>

                  {/* The channel, made visible. A host looking at this list used
                      to have no way to tell what a product could actually do. */}
                  <View style={s.badges}>
                    {modes.includes(PAYMENT_MODE.ONLINE) && (
                      <View style={[s.badge, { backgroundColor: colors.successBg }]}>
                        <Icon name="payment" size={11} color={colors.success} />
                        <Text style={[s.badgeText, { color: colors.success }]}>
                          {t("plans.paymentMode.online")}
                        </Text>
                      </View>
                    )}
                    {modes.includes(PAYMENT_MODE.MANUAL) && (
                      <View style={[s.badge, { backgroundColor: colors.brandSoft }]}>
                        <Icon name="edit" size={11} color={colors.primary} />
                        <Text style={[s.badgeText, { color: colors.primary }]}>
                          {t("plans.paymentMode.manual")}
                        </Text>
                      </View>
                    )}
                    {p.audienceTier === MEMBERSHIP_AUDIENCE.BOTH && (
                      <View style={[s.badge, { backgroundColor: colors.sunken }]}>
                        <Text style={[s.badgeText, { color: colors.textSecondary }]}>
                          {t("plans.audience.both")}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <Text style={[s.price, { color: colors.text }]}>
                  {p.priceCents ? formatCentavos(p.priceCents) : t("plans.free")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontFamily: FONTS.display, fontSize: 20, letterSpacing: -0.4 },
    addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    centre: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    subtitle: { fontFamily: FONTS.body, fontSize: 13, lineHeight: 19, marginBottom: 16 },
    // Flat card: 1px border, no shadow (design system §3).
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      borderWidth: 1,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
    },
    kindIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    name: { fontFamily: FONTS.display, fontSize: 15.5, letterSpacing: -0.2 },
    meta: { fontFamily: FONTS.body, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
    badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 7,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: { fontFamily: FONTS.bodyBold, fontSize: 11 },
    price: { fontFamily: FONTS.display, fontSize: 15.5, letterSpacing: -0.3 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
    emptyArt: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    emptyTitle: { fontFamily: FONTS.display, fontSize: 18, marginBottom: 8, textAlign: "center" },
    emptyText: { fontFamily: FONTS.body, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
    cta: { borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28 },
    ctaText: { fontFamily: FONTS.bodyExtra, fontSize: 15 },
  });
}
