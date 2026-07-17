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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import Icon from "../components/Icon";
import { activateHost, deferHostType } from "../services/hostService";

/**
 * How you host — free (live instantly) or paid (payouts set up later).
 *
 * Two things changed here, both about when we ask for money:
 *
 * 1. Free is preselected and recommended. The screen used to open with nothing
 *    chosen, demanding a decision between a free thing and a thing involving a
 *    tax ID before the person had hosted anything at all.
 * 2. Choosing paid no longer opens Stripe onboarding. That put a KYC flow —
 *    account creation, an external browser, bank details — between someone and
 *    their first event, and the browser hop was where they left. Payouts are now
 *    connected in context, when they actually price an event. Picking paid here
 *    just records the intent.
 *
 * Either way hosting activates now: the real gate on taking money is
 * `canCreatePaidEvents`, which only Stripe's charge-enabled status flips.
 *
 * Mercado Pago (MERCADOPAGO_ENABLED, config/featureFlags) stays hidden: this
 * screen no longer picks a payout processor at all, so there is nothing here to
 * gate. That choice belongs to the payout setup step, which already honours the
 * flag.
 */
export default function HostTypeSelectionScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Preselected: an opinionated default is the difference between "choose your
  // business model" and "start hosting".
  const [selectedType, setSelectedType] = useState("free");
  const [loading, setLoading] = useState(false);

  const { fromProfile } = route.params || {};

  // Where to go once the user has made (or deferred) their choice. Opened from
  // Profile → pop back. During ONBOARDING → do NOT self-navigate: the hostConfig
  // write we just made re-fires the AppNavigator user-doc listener, which
  // advances the flow, exactly like Legal/ProfileSetup.
  const goAfterSelection = () => {
    if (fromProfile && navigation.canGoBack()) {
      navigation.goBack();
    }
    // else: onboarding — the AppNavigator router takes over from here.
  };

  const handleDecideLater = async () => {
    setLoading(true);
    try {
      // The user stays a NORMAL user but keeps hostApproved, so they can pick a
      // type later from their Profile. The "deferred" marker stops AppNavigator
      // prompting them again on every login.
      await deferHostType();
      goAfterSelection();
    } catch (error) {
      console.error("❌ Error deferring selection:", error);
      Alert.alert(
        t("hostTypeSelection.error"),
        t("hostTypeSelection.couldNotContinue")
      );
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      // Server-side: role is no longer client-writable, so hosting is granted by
      // the activateHost callable (which also decides what stays locked).
      await activateHost(selectedType);

      // Land on the outcome, rather than dropping into the tabs with no signal
      // that anything happened. Both screens replace this one so Back can't
      // return to a choice that's already been made.
      navigation.replace(selectedType === "free" ? "HostLive" : "HostStatus");
    } catch (error) {
      console.error("❌ Error setting up host:", error);
      Alert.alert(
        t("hostTypeSelection.setupError"),
        error.message || t("hostTypeSelection.setupErrorMessage")
      );
      setLoading(false);
    }
  };

  const s = createStyles(colors);
  const freeSelected = selectedType === "free";

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={[
          s.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.intro}>
          <View style={[s.introIcon, { backgroundColor: colors.brandSoft }]}>
            <Icon name="tent" size={32} color={colors.primary} />
          </View>
          <Text style={[s.title, { color: colors.text }]}>
            {t("hostTypeSelection.approvedTitle")}
          </Text>
          <Text style={[s.subtitle, { color: colors.textSecondary }]}>
            {t("hostTypeSelection.approvedSubtitle")}
          </Text>
        </View>

        {/* Free — recommended, live instantly */}
        <TouchableOpacity
          onPress={() => setSelectedType("free")}
          activeOpacity={0.85}
          disabled={loading}
          accessibilityRole="button"
          accessibilityState={{ selected: freeSelected }}
          style={[
            s.card,
            {
              backgroundColor: freeSelected ? colors.brandSoft : colors.surface,
              borderColor: freeSelected ? colors.primary : colors.border,
              borderWidth: freeSelected ? 2 : 1,
              opacity: loading ? 0.6 : 1,
            },
          ]}
        >
          <View style={s.cardHeader}>
            <View style={[s.cardIcon, { backgroundColor: colors.surface }]}>
              <Icon name="calendar" size={22} color={colors.primary} />
            </View>
            <View style={s.cardTitles}>
              <Text style={[s.cardTitle, { color: colors.text }]}>
                {t("hostTypeSelection.freeTitle")}
              </Text>
              <Text style={[s.cardMeta, { color: colors.textSecondary }]}>
                {t("hostTypeSelection.freeMeta")}
              </Text>
            </View>
            {freeSelected && (
              <View style={[s.check, { backgroundColor: colors.primary }]}>
                <Icon name="check" size={14} color={colors.onPrimary} />
              </View>
            )}
          </View>

          <View style={s.features}>
            {["freeFeatureEvents", "freeFeatureMembers", "freeFeatureUpgrade"].map(
              (k) => (
                <View key={k} style={s.featureRow}>
                  <Icon name="check" size={14} color={colors.success} />
                  <Text style={[s.featureText, { color: colors.text }]}>
                    {t(`hostTypeSelection.${k}`)}
                  </Text>
                </View>
              )
            )}
          </View>
        </TouchableOpacity>

        {/* Paid — secondary. No Stripe here; payouts get connected in context. */}
        <TouchableOpacity
          onPress={() => setSelectedType("paid")}
          activeOpacity={0.85}
          disabled={loading}
          accessibilityRole="button"
          accessibilityState={{ selected: !freeSelected }}
          style={[
            s.card,
            {
              backgroundColor: colors.surface,
              borderColor: !freeSelected ? colors.primary : colors.border,
              borderWidth: !freeSelected ? 2 : 1,
              opacity: loading ? 0.6 : 1,
            },
          ]}
        >
          <View style={s.cardHeader}>
            <View style={[s.cardIcon, { backgroundColor: colors.warnSoft }]}>
              <Icon name="dollar" size={22} color={colors.warning} />
            </View>
            <View style={s.cardTitles}>
              <Text style={[s.cardTitle, { color: colors.text }]}>
                {t("hostTypeSelection.paidTitle")}
              </Text>
              <Text style={[s.cardMeta, { color: colors.textSecondary }]}>
                {t("hostTypeSelection.paidMeta")}
              </Text>
            </View>
            {!freeSelected && (
              <View style={[s.check, { backgroundColor: colors.primary }]}>
                <Icon name="check" size={14} color={colors.onPrimary} />
              </View>
            )}
          </View>

          <View style={[s.notice, { backgroundColor: colors.warnSoft }]}>
            <Icon name="info" size={14} color={colors.warning} />
            <Text style={[s.noticeText, { color: colors.warning }]}>
              {t("hostTypeSelection.paidLaterNote")}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.9}
          style={[
            s.cta,
            { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 },
          ]}
        >
          {loading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color={colors.onPrimary} />
              <Text
                style={[s.ctaText, { color: colors.onPrimary, marginLeft: 10 }]}
              >
                {t("hostTypeSelection.settingUp")}
              </Text>
            </View>
          ) : (
            <Text style={[s.ctaText, { color: colors.onPrimary }]}>
              {freeSelected
                ? t("hostTypeSelection.ctaStartFree")
                : t("hostTypeSelection.ctaContinuePaid")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDecideLater}
          disabled={loading}
          style={s.later}
          activeOpacity={0.7}
        >
          <Text
            style={[
              s.laterText,
              { color: colors.textTertiary, opacity: loading ? 0.5 : 1 },
            ]}
          >
            {t("hostTypeSelection.decideLater")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 20 },
    intro: { alignItems: "center", marginBottom: 28 },
    introIcon: {
      width: 68,
      height: 68,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    title: {
      fontFamily: FONTS.display,
      fontSize: 26,
      letterSpacing: -0.6,
      textAlign: "center",
      marginBottom: 8,
    },
    subtitle: {
      fontFamily: FONTS.body,
      fontSize: 14.5,
      lineHeight: 21,
      textAlign: "center",
      paddingHorizontal: 8,
    },
    // Flat cards: border only, no shadow (design system §3).
    card: { borderRadius: 18, padding: 18, marginBottom: 14 },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
    cardIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    cardTitles: { flex: 1 },
    cardTitle: { fontFamily: FONTS.display, fontSize: 17, letterSpacing: -0.3 },
    cardMeta: { fontFamily: FONTS.body, fontSize: 12.5, marginTop: 2 },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    features: { marginTop: 14, gap: 9 },
    featureRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    featureText: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, flex: 1 },
    notice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      borderRadius: 10,
      padding: 11,
      marginTop: 14,
    },
    noticeText: {
      fontFamily: FONTS.bodySemibold,
      fontSize: 12.5,
      flex: 1,
      lineHeight: 17,
    },
    cta: {
      borderRadius: 27,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 54,
      marginTop: 10,
    },
    ctaText: { fontFamily: FONTS.bodyExtra, fontSize: 16, letterSpacing: 0.2 },
    loadingRow: { flexDirection: "row", alignItems: "center" },
    later: { alignItems: "center", paddingVertical: 18 },
    laterText: { fontFamily: FONTS.bodySemibold, fontSize: 13.5 },
  });
}
