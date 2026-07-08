import React, { useState, useCallback } from "react";
import Icon from "../components/Icon";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import BusinessPassCard from "../components/business/BusinessPassCard";
import { getMyBusinessPasses } from "../services/businessPassService";
import {
  getUserMemberships,
  getMembershipState,
  getMembershipExpiryDate,
  getMembershipPlan,
} from "../services/membershipService";

export default function MyMembershipsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const STATE_META = {
    active: { label: t("myMemberships.stateActive"), color: "#34C759" },
    depleted: { label: t("myMemberships.stateDepleted"), color: "#B45309" },
    expired: { label: t("myMemberships.stateExpired"), color: "#c25b5b" },
  };
  const [memberships, setMemberships] = useState([]);
  const [passes, setPasses] = useState([]);
  const [passModal, setPassModal] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    const [data, biz] = await Promise.all([getUserMemberships(), getMyBusinessPasses()]);
    setMemberships(data);
    setPasses(biz);
    setLoading(false);
  };

  const handleRenew = async (m) => {
    const plan = await getMembershipPlan(m.planId);
    if (plan && plan.active) {
      navigation.navigate("MembershipCheckout", { plan });
    } else {
      Alert.alert(
        t("myMemberships.planUnavailableTitle"),
        t("myMemberships.planUnavailableMessage")
      );
    }
  };

  const styles = createStyles(colors, isDark);

  const renderCard = (m) => {
    const state = getMembershipState(m);
    const meta = STATE_META[state] || STATE_META.expired;
    const expiry = getMembershipExpiryDate(m);
    const remaining = m.creditsRemaining || 0;
    const total = m.creditsTotal || 0;
    const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

    return (
      <View key={m.id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.iconCircle}>
            <Icon name="ticket" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.planName, { color: colors.text }]} numberOfLines={1}>
              {m.planName}
            </Text>
            <Text style={[styles.expiry, { color: colors.textSecondary }]}>
              {state === "expired"
                ? t("myMemberships.expiredOn", { date: expiry ? expiry.toLocaleDateString() : "" })
                : t("myMemberships.validUntil", { date: expiry ? expiry.toLocaleDateString() : "—" })}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        <View style={styles.creditsSection}>
          <View style={styles.creditsHeader}>
            <Text style={[styles.creditsText, { color: colors.text }]}>
              {t("myMemberships.classesLeft", { remaining, total })}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${pct * 100}%`, backgroundColor: meta.color },
              ]}
            />
          </View>
        </View>

        {state !== "active" && (
          <TouchableOpacity
            style={[
              styles.renewButton,
              { backgroundColor: `${colors.primary}22`, borderColor: colors.primary },
            ]}
            onPress={() => handleRenew(m)}
            activeOpacity={0.8}
          >
            <Text style={[styles.renewText, { color: colors.primary }]}>{t("myMemberships.renew")}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("myMemberships.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Kinlo for Business — link a host's guest code + your check-in passes. */}
      <View style={styles.bizBlock}>
        <TouchableOpacity
          style={[styles.bizEntry, { borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
          onPress={() => navigation.navigate("BusinessRedeemCode")}
          activeOpacity={0.85}
        >
          <View style={[styles.bizEntryIcon, { backgroundColor: colors.brandSoft }]}>
            <Icon name="qr" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bizEntryTitle, { color: colors.text }]}>{t("business.redeem.entryTitle")}</Text>
            <Text style={[styles.bizEntrySub, { color: colors.textTertiary }]}>{t("business.redeem.entrySub")}</Text>
          </View>
          <Icon name="forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
        {passes.map((p) => (
          <TouchableOpacity
            key={`${p.bizId}-${p.memberId}`}
            style={[styles.bizPassRow, { borderColor: colors.border }]}
            onPress={() => setPassModal(p)}
            activeOpacity={0.85}
          >
            <Icon name="ticket" size={18} color={colors.primary} />
            <Text style={[styles.bizPassName, { color: colors.text }]} numberOfLines={1}>
              {p.businessName || t("business.pass.defaultBusiness")}
            </Text>
            <Text style={[styles.bizPassAction, { color: colors.primary }]}>{t("business.pass.show")}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : memberships.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="ticket" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("myMemberships.noneYet")}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t("myMemberships.noneYetHint")}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {memberships.map(renderCard)}
        </ScrollView>
      )}

      {/* Business check-in pass */}
      <Modal visible={!!passModal} transparent animationType="fade" onRequestClose={() => setPassModal(null)}>
        <TouchableOpacity style={styles.passBackdrop} activeOpacity={1} onPress={() => setPassModal(null)}>
          <View style={{ width: "100%", maxWidth: 360 }}>
            <BusinessPassCard pass={passModal} />
            <TouchableOpacity
              style={[styles.requestBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={() => {
                const p = passModal;
                setPassModal(null);
                navigation.navigate("BusinessRequestSession", { bizId: p.bizId, businessName: p.businessName });
              }}
            >
              <Icon name="calendar" size={17} color="#fff" />
              <Text style={styles.requestBtnText}>{t("business.request.entry")}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
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
    bizBlock: { paddingHorizontal: 24, paddingBottom: 12, gap: 10 },
    bizEntry: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
    bizEntryIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    bizEntryTitle: { fontSize: 14.5, fontWeight: "700" },
    bizEntrySub: { fontSize: 12, marginTop: 2 },
    bizPassRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    bizPassName: { flex: 1, fontSize: 14, fontWeight: "700" },
    bizPassAction: { fontSize: 13, fontWeight: "700" },
    passBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 32 },
    requestBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 25, marginTop: 16 },
    requestBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
    emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
      padding: 16,
      marginBottom: 12,
    },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.primary}1F`,
    },
    planName: { fontSize: 16, fontWeight: "700" },
    expiry: { fontSize: 13, marginTop: 2 },
    badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    badgeText: { fontSize: 12, fontWeight: "700" },
    creditsSection: { marginTop: 14 },
    creditsHeader: { marginBottom: 8 },
    creditsText: { fontSize: 14, fontWeight: "600" },
    progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
    progressFill: { height: 8, borderRadius: 4 },
    unlimitedText: { fontSize: 14, marginTop: 14, fontWeight: "500" },
    renewButton: {
      marginTop: 16,
      borderWidth: 1.5,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
    },
    renewText: { fontSize: 14, fontWeight: "700" },
  });
}
