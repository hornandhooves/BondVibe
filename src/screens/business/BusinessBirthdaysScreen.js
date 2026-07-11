/**
 * BusinessBirthdaysScreen — Birthdays host view (dashboard handoff §Birthdays).
 * Who's celebrating today / this week, with gift ideas grounded in the member's
 * tags + attended classes, and one-tap "Send wish" / "Gift a pack" (reusing the
 * member record's assign-package flow). A retention lever, especially for
 * at-risk members.
 *
 * PRIVACY (hard rule): day + month only — never the year, never an age. Every
 * date shown goes through birthdayLabel (MM-DD); nothing here reads dob's year.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { listUpcomingBirthdays, giftSuggestions } from "../../services/birthdayService";
import { listPackages } from "../../services/businessPackagesService";
import { birthdayLabel, canSms, PRICING_TIER } from "../../services/businessMembersService";
import { formatCentavos } from "../../utils/pricing";
import { FONTS } from "../../constants/theme-tokens";

const BANNER_GRADIENT = ["#E8A33D", "#F97316"]; // Birthday "today" banner (135°)
const BRAND_GRADIENT = ["#7C3AED", "#C026D3"];
const TIER_COLOR = { green: "#1F8A6E", yellow: "#B45309", red: "#8a86a0" };

const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

const firstName = (name = "") => name.trim().split(/\s+/)[0] || name;

export default function BusinessBirthdaysScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ today: [], week: [] });
  const [suggestions, setSuggestions] = useState({}); // memberId -> giftSuggestions result

  const load = useCallback(async () => {
    setLoading(true);
    const { today, week } = await listUpcomingBirthdays();
    const packages = await listPackages({ activeOnly: true });
    const entries = await Promise.all(today.map((m) => giftSuggestions(m, packages).then((s) => [m.id, s])));
    setSuggestions(Object.fromEntries(entries));
    setData({ today, week });
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const giftPack = (member) => navigation.navigate("BusinessMemberRecord", { memberId: member.id, openAssign: true });

  const sendWish = (member) => {
    const message = t("business.birthdays.wishMessage", { name: firstName(member.name) });
    if (member.phone) {
      const sep = Platform.OS === "ios" ? "&" : "?";
      const smsUrl = `sms:${member.phone}${sep}body=${encodeURIComponent(message)}`;
      Alert.alert(t("business.birthdays.sendWish"), t("business.birthdays.sendWishHow", { name: firstName(member.name) }), [
        { text: t("business.common.cancel"), style: "cancel" },
        ...(canSms(member) || member.phone ? [{ text: t("business.birthdays.viaSms"), onPress: () => Linking.openURL(smsUrl).catch(() => Share.share({ message })) }] : []),
        { text: t("business.birthdays.viaShare"), onPress: () => Share.share({ message }) },
      ]);
    } else {
      Share.share({ message });
    }
  };

  const tierChipLabel = (m) =>
    m.pricingTier === PRICING_TIER.LOCAL ? t("business.dashboard.tierLocal") : m.pricingTier === PRICING_TIER.GENERAL ? t("business.dashboard.tierGeneral") : null;

  const styles = createStyles(colors);

  const renderCard = (member) => {
    const s = suggestions[member.id];
    const tierChip = tierChipLabel(member);
    return (
      <View key={member.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardHead}>
          <View style={[styles.avatar, { backgroundColor: `${colors.primary}18` }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(member.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{member.name}</Text>
            <Text style={[styles.meta, { color: colors.textTertiary }]} numberOfLines={1}>
              {birthdayLabel(member, i18n.language)}
              {s ? ` · ${t("business.birthdays.classesCount", { count: s.attendedCount })}` : ""}
              {member.tags?.[0] ? ` · ${member.tags[0]}` : ""}
            </Text>
          </View>
          {tierChip && (
            <View style={[styles.tierChip, { backgroundColor: `${colors.warning}1A` }]}>
              <Text style={[styles.tierChipText, { color: colors.warning }]}>{tierChip}</Text>
            </View>
          )}
        </View>

        {/* Gift ideas — grounded, with a confidence badge */}
        {s && s.suggestions.length > 0 && (
          <View style={[styles.giftBox, { backgroundColor: `${colors.primary}0A`, borderColor: `${colors.primary}22` }]}>
            <View style={styles.giftHead}>
              <Icon name="gift" size={14} color={colors.primary} />
              <Text style={[styles.giftTitle, { color: colors.primary }]} numberOfLines={1}>
                {t("business.birthdays.giftIdeas", { name: firstName(member.name) })}
              </Text>
              <View style={[styles.confDot, { backgroundColor: TIER_COLOR[s.tier] }]} />
            </View>
            <Text style={[styles.giftWhy, { color: colors.textSecondary }]} numberOfLines={2}>
              {s.tier === "red"
                ? t("business.birthdays.whyGeneric")
                : t("business.birthdays.whyMatched", { category: s.topCategory || t("business.birthdays.theirInterests"), count: s.attendedCount })}
            </Text>
            {s.suggestions.map((g) => (
              <View key={g.id} style={[styles.giftRow, { borderTopColor: colors.divider || "#F0ECF6" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.giftName, { color: colors.text }]} numberOfLines={1}>{g.name}</Text>
                  <Text style={[styles.giftSub, { color: colors.textTertiary }]} numberOfLines={1}>
                    {g.matched ? t("business.birthdays.topMatch") : t(`business.birthdays.kind.${g.kind}`, { defaultValue: t("business.birthdays.kind.class") })}
                    {g.priceCents != null ? ` · ${formatCentavos(g.priceCents)}` : ""}
                  </Text>
                </View>
                <TouchableOpacity style={[styles.giftBtn, { backgroundColor: `${colors.primary}18` }]} onPress={() => giftPack(member)}>
                  <Text style={[styles.giftBtnText, { color: colors.primary }]}>{t("business.birthdays.gift")}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.ctaRow}>
          <TouchableOpacity style={[styles.wishBtn, { backgroundColor: colors.text }]} onPress={() => sendWish(member)} activeOpacity={0.9}>
            <Text style={[styles.wishText, { color: colors.background }]}>{t("business.birthdays.sendWish")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.giftPackBtn} onPress={() => giftPack(member)} activeOpacity={0.9}>
            <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.giftPackGrad}>
              <Text style={styles.giftPackText}>{t("business.birthdays.giftPack")}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const empty = !loading && data.today.length === 0 && data.week.length === 0;

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.birthdays.title")}</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {data.today.length > 0 && (
            <View style={styles.bannerShadow}>
              <LinearGradient colors={BANNER_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
                <Text style={styles.bannerEyebrow}>{t("business.birthdays.today")}</Text>
                <Text style={styles.bannerTitle}>{t("business.birthdays.celebrating", { count: data.today.length })} 🎉</Text>
                <Text style={styles.bannerSub}>{t("business.birthdays.bannerSub")}</Text>
              </LinearGradient>
            </View>
          )}

          {data.today.map(renderCard)}

          {data.week.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("business.birthdays.thisWeek")}</Text>
              <View style={[styles.weekCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {data.week.map(({ member, daysUntil }, i) => (
                  <TouchableOpacity
                    key={member.id}
                    style={[styles.weekRow, i > 0 && { borderTopColor: colors.divider || "#F0ECF6", borderTopWidth: StyleSheet.hairlineWidth }]}
                    onPress={() => navigation.navigate("BusinessMemberRecord", { memberId: member.id })}
                  >
                    <View style={[styles.avatarSm, { backgroundColor: `${colors.primary}12` }]}>
                      <Text style={[styles.avatarSmText, { color: colors.primary }]}>{initials(member.name)}</Text>
                    </View>
                    <Text style={[styles.weekName, { color: colors.text }]} numberOfLines={1}>{member.name}</Text>
                    <Text style={[styles.weekWhen, { color: colors.textTertiary }]}>
                      {birthdayLabel(member, i18n.language)} · {daysUntil === 1 ? t("business.birthdays.tomorrow") : t("business.birthdays.inDays", { count: daysUntil })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {empty && (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.emptyEmoji}>🎂</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("business.birthdays.emptyTitle")}</Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t("business.birthdays.emptyText")}</Text>
            </View>
          )}

          <View style={styles.privacyRow}>
            <Icon name="lock" size={12} color={colors.textTertiary} />
            <Text style={[styles.privacyText, { color: colors.textTertiary }]}>{t("business.birthdays.privacyNote")}</Text>
          </View>
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 60, paddingBottom: 8 },
    headerTitle: { fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.4 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 16, paddingBottom: 40 },
    bannerShadow: {
      borderRadius: 18,
      shadowColor: "#F97316",
      shadowOpacity: 0.28,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
      marginBottom: 14,
    },
    banner: { borderRadius: 18, padding: 18 },
    bannerEyebrow: { fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,0.85)" },
    bannerTitle: { fontFamily: FONTS.display, fontSize: 21, color: "#fff", marginTop: 4, letterSpacing: -0.4 },
    bannerSub: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginTop: 6, lineHeight: 17 },
    card: { borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 14 },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 11 },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    avatarText: { fontFamily: FONTS.bodyExtra, fontSize: 16 },
    name: { fontFamily: FONTS.bodyBold, fontSize: 15.5 },
    meta: { fontFamily: FONTS.bodyMedium, fontSize: 12, marginTop: 3 },
    tierChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
    tierChipText: { fontFamily: FONTS.bodyBold, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase" },
    giftBox: { borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 13 },
    giftHead: { flexDirection: "row", alignItems: "center", gap: 7 },
    giftTitle: { flex: 1, fontFamily: FONTS.bodyBold, fontSize: 12.5 },
    confDot: { width: 8, height: 8, borderRadius: 4 },
    giftWhy: { fontFamily: FONTS.bodyMedium, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
    giftRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
    giftName: { fontFamily: FONTS.bodySemibold, fontSize: 13.5 },
    giftSub: { fontFamily: FONTS.bodyMedium, fontSize: 11.5, marginTop: 2 },
    giftBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
    giftBtnText: { fontFamily: FONTS.bodyBold, fontSize: 12.5 },
    ctaRow: { flexDirection: "row", gap: 10, marginTop: 14 },
    wishBtn: { flex: 1, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
    wishText: { fontFamily: FONTS.bodyExtra, fontSize: 14 },
    giftPackBtn: { flex: 1, borderRadius: 23, overflow: "hidden" },
    giftPackGrad: { height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
    giftPackText: { fontFamily: FONTS.bodyExtra, fontSize: 14, color: "#fff" },
    sectionLabel: { fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 10, marginBottom: 9, paddingHorizontal: 4 },
    weekCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 },
    weekRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12 },
    avatarSm: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    avatarSmText: { fontFamily: FONTS.bodyBold, fontSize: 12 },
    weekName: { flex: 1, fontFamily: FONTS.bodySemibold, fontSize: 14 },
    weekWhen: { fontFamily: FONTS.bodyMedium, fontSize: 12 },
    emptyCard: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: "center", marginTop: 8 },
    emptyEmoji: { fontSize: 34, marginBottom: 10 },
    emptyTitle: { fontFamily: FONTS.bodyBold, fontSize: 15, marginBottom: 6 },
    emptyText: { fontFamily: FONTS.bodyMedium, fontSize: 13, textAlign: "center", lineHeight: 18 },
    privacyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, paddingHorizontal: 20 },
    privacyText: { fontFamily: FONTS.bodyMedium, fontSize: 11.5, textAlign: "center" },
  });
}
