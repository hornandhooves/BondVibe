import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import { auth, db } from "../services/firebase";
import { joinFreeEvent } from "../services/eventJoinService";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import {
  getUsableMembershipForHost,
  getHostMembershipPlans,
  reserveMembershipCredit,
  getMembershipState,
  getMembershipExpiryDate,
} from "../services/membershipService";

export default function HowToAttendScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const {
    eventId,
    eventTitle,
    price = 0,
    hostId,
    hostName,
    acceptsMembership = false,
  } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [membership, setMembership] = useState(null);
  const [hostHasPlans, setHostHasPlans] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [hostId])
  );

  const load = async () => {
    const [m, plans] = await Promise.all([
      acceptsMembership ? getUsableMembershipForHost(hostId) : null,
      getHostMembershipPlans(hostId, { activeOnly: true }),
    ]);
    setMembership(m);
    setHostHasPlans(plans.length > 0);
    setLoading(false);
  };

  const handleUseCredit = async () => {
    setWorking(true);
    const r = await reserveMembershipCredit(eventId);
    setWorking(false);
    if (r.success) {
      Alert.alert(
        t("howToAttend.spotReservedTitle"),
        t("howToAttend.spotReservedMessage"),
        [{ text: t("howToAttend.done"), onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert(t("howToAttend.couldntUseMembershipTitle"), r.error || t("howToAttend.tryAgain"));
    }
  };

  const handlePay = async () => {
    if (price > 0) {
      navigation.replace("Checkout", {
        eventId,
        eventTitle,
        amount: Math.round(price * 100),
      });
      return;
    }
    // Free event: join atomically via the joinEvent function.
    setWorking(true);
    try {
      const r = await joinFreeEvent(eventId);
      if (!r.success) {
        Alert.alert(t("howToAttend.couldntJoinTitle"), r.error);
        return;
      }
      Alert.alert(t("howToAttend.joinedTitle"), t("howToAttend.joinedMessage"), [
        { text: t("howToAttend.done"), onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert(t("howToAttend.errorTitle"), t("howToAttend.couldNotJoinTryAgain"));
    } finally {
      setWorking(false);
    }
  };

  const styles = createStyles(colors, isDark);

  const state = membership ? getMembershipState(membership) : null;
  const hasActiveMembership = state === "active";
  const expiry = membership ? getMembershipExpiryDate(membership) : null;

  const Option = ({ icon, iconColor, title, subtitle, onPress, primary }) => (
    <TouchableOpacity
      style={[
        styles.option,
        primary && { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
      ]}
      onPress={onPress}
      disabled={working}
      activeOpacity={0.85}
    >
      <View style={[styles.optionIcon, { backgroundColor: `${iconColor}1F` }]}>
        <Icon name={icon} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, { color: colors.text }]}>{title}</Text>
        {!!subtitle && (
          <Text style={[styles.optionSubtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Icon name="forward" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("howToAttend.headerTitle")}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!!eventTitle && (
            <Text style={[styles.eventTitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {eventTitle}
            </Text>
          )}

          {working && (
            <View style={styles.workingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, marginLeft: 8 }}>
                {t("howToAttend.processing")}
              </Text>
            </View>
          )}

          {/* Use membership (active) */}
          {hasActiveMembership && (
            <Option
              icon="ticket"
              iconColor={colors.primary}
              primary
              title={t("howToAttend.useOneCredit")}
              subtitle={t("howToAttend.creditsLeftValidUntil", {
                count: membership.creditsRemaining,
                date: expiry ? expiry.toLocaleDateString() : "—",
              })}
              onPress={handleUseCredit}
            />
          )}

          {/* Renew / buy membership (depleted, expired, or none but host sells) */}
          {hostHasPlans && !hasActiveMembership && (
            <Option
              icon="ai"
              iconColor={colors.warning}
              title={
                membership ? t("howToAttend.renewMembership") : t("howToAttend.getMembership")
              }
              subtitle={
                membership
                  ? state === "expired"
                    ? t("howToAttend.membershipExpired")
                    : t("howToAttend.outOfCredits")
                  : t("howToAttend.buyPack")
              }
              onPress={() =>
                navigation.navigate("HostMemberships", { hostId, hostName })
              }
            />
          )}

          {/* Pay with card / join free */}
          <Option
            icon="payment"
            iconColor="#34C759"
            title={price > 0 ? t("howToAttend.payAmount", { price }) : t("howToAttend.joinForFree")}
            subtitle={
              price > 0 ? t("howToAttend.oneTimePayment") : t("howToAttend.noPaymentNeeded")
            }
            onPress={handlePay}
          />

          <TouchableOpacity
            style={styles.cancel}
            onPress={() => navigation.goBack()}
            disabled={working}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              {t("howToAttend.cancel")}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    eventTitle: { fontSize: 15, fontWeight: "600", marginBottom: 20 },
    workingRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 16,
      marginBottom: 12,
    },
    optionIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    optionTitle: { fontSize: 16, fontWeight: "700" },
    optionSubtitle: { fontSize: 13, marginTop: 2 },
    cancel: { alignItems: "center", paddingVertical: 16, marginTop: 8 },
    cancelText: { fontSize: 15, fontWeight: "600" },
  });
}
