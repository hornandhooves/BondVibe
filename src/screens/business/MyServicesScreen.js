/**
 * MyServicesScreen — the host's own marketplace services (Services P0/P2).
 *
 * Reached from the Services tab's "My services" entry (host mode). Lists the
 * business's services — public SessionTypes with a `vertical` (Category) set —
 * filtered by All / Live / Paused, with a status badge, and lets the host edit /
 * pause / unpublish each. Live = `publicListing:true` (visible in the
 * marketplace); Paused = `publicListing:false` (still there and editable, just
 * hidden). Uncategorised session types are the CRM's private sessions, not shown
 * here. Non-approved hosts hit the become-a-host gate in-place (mirrors
 * MyFleetScreen). Replaces the old SessionTypesScreen list that lived in the Hub.
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import useUserRole from "../../hooks/useUserRole";
import { isApprovedHost } from "../../utils/hostGate";
import { ServiceHostGate } from "./PublishServiceScreen";
import { listSessionTypes, updateSessionType, deleteSessionType } from "../../services/businessSessionsService";
import { getBusiness } from "../../services/businessService";
import { formatCentavos } from "../../utils/pricing";
import { VERTICAL_META } from "../MarketplaceExploreScreen";

const FILTERS = ["all", "live", "paused"];

export default function MyServicesScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { role, hostApproved, loading: roleLoading } = useUserRole();
  const approved = isApprovedHost({ role, hostApproved });

  const [services, setServices] = useState([]);
  const [biz, setBiz] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [all, b] = await Promise.all([
      listSessionTypes().catch(() => []),
      getBusiness().catch(() => null),
    ]);
    // A "service" is a categorised SessionType. Uncategorised ones (vertical null)
    // are the CRM's private sessions and belong in the Business Hub, not here.
    setServices((Array.isArray(all) ? all : []).filter((s) => !!s.vertical));
    setBiz(b);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { if (approved) load(); }, [approved, load]));

  const isLive = (s) => s.publicListing === true;
  const filtered = services.filter((s) =>
    filter === "all" ? true : filter === "live" ? isLive(s) : !isLive(s)
  );

  const togglePause = async (s) => {
    // Resuming a paused at-home service still needs verified+insured — the same
    // server gate that blocks publishing it. Guard here so the host sees why
    // instead of an opaque permission error.
    if (!isLive(s) && s.locationMode === "at_customer" && !(biz && biz.verified && biz.insured)) {
      return Alert.alert(t("services.publish.verifyBlock"));
    }
    try {
      await updateSessionType(s.id, { publicListing: !isLive(s) });
      load();
    } catch (e) {
      Alert.alert(t("services.my.actionError"), e?.message || "");
    }
  };

  const deleteService = (s) => {
    Alert.alert(t("services.my.deleteTitle"), t("services.my.deleteMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("services.my.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSessionType(s.id);
            load();
          } catch (e) {
            Alert.alert(t("services.my.actionError"), e?.message || "");
          }
        },
      },
    ]);
  };

  const openMenu = (s) => {
    Alert.alert(s.name, undefined, [
      { text: t("services.my.edit"), onPress: () => navigation.navigate("PublishService", { serviceId: s.id }) },
      { text: isLive(s) ? t("services.my.pause") : t("services.my.resume"), onPress: () => togglePause(s) },
      { text: t("services.my.delete"), style: "destructive", onPress: () => deleteService(s) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  const styles = createStyles(colors, isDark);

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

      {/* Filter chips */}
      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              testID={`filter-${f}`}
              style={[styles.filterChip, { backgroundColor: active ? colors.text : "transparent", borderColor: active ? colors.text : colors.border }]}
            >
              <Text style={[styles.filterTxt, { color: active ? colors.background : colors.textSecondary, fontFamily: active ? FONTS.bodyBold : FONTS.bodySemibold }]}>
                {t(f === "all" ? "services.my.filterAll" : `services.my.${f}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyArt, { backgroundColor: colors.brandSoft }]}>
            <Icon name="tag" size={30} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("services.my.emptyTitle")}</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{t("services.my.emptyBody")}</Text>
          <TouchableOpacity style={[styles.emptyCta, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate("PublishService")}>
            <Text style={styles.emptyCtaTxt}>{t("services.my.emptyCta")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {filtered.map((s) => {
            const meta = VERTICAL_META[s.vertical] || VERTICAL_META.wellness;
            const live = isLive(s);
            const badge = live ? colors.success : colors.warning;
            const price = s.bookingMode === "quote"
              ? t("services.my.quote")
              : !s.priceCents
              ? t("marketplace.detail.free")
              : formatCentavos(s.priceCents);
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate("PublishService", { serviceId: s.id })}
                testID={`service-row-${s.id}`}
              >
                <View style={[styles.thumb, { backgroundColor: meta.bg }]}>
                  {s.photos && s.photos[0] ? (
                    <Image source={{ uri: s.photos[0] }} style={styles.thumbImg} />
                  ) : (
                    <Icon name={meta.icon} size={22} color={meta.fg} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{s.name}</Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t(`marketplace.vertical.${s.vertical}`)} · {price} · {t("marketplace.detail.duration", { min: s.durationMin })}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: `${badge}1F` }]}>
                    <View style={[styles.badgeDot, { backgroundColor: badge }]} />
                    <Text style={[styles.badgeTxt, { color: badge }]}>{t(live ? "services.my.live" : "services.my.paused")}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => openMenu(s)} hitSlop={hit} testID={`service-menu-${s.id}`}>
                  <Icon name="more" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors, isDark) {
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

    filters: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingBottom: 14 },
    filterChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 7 },
    filterTxt: { fontSize: 13 },

    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 18, paddingBottom: 8 },

    card: { flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 12 },
    thumb: { width: 56, height: 56, borderRadius: 13, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    thumbImg: { width: 56, height: 56 },
    name: { fontFamily: FONTS.display, fontSize: 15.5, letterSpacing: -0.2 },
    meta: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, marginTop: 3 },
    badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, marginTop: 7 },
    badgeDot: { width: 6, height: 6, borderRadius: 3 },
    badgeTxt: { fontFamily: FONTS.bodyBold, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase" },

    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
    emptyArt: { width: 66, height: 66, borderRadius: 19, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    emptyTitle: { fontFamily: FONTS.display, fontSize: 19, marginBottom: 8, textAlign: "center" },
    emptyBody: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, textAlign: "center", lineHeight: 20, marginBottom: 22 },
    emptyCta: { borderRadius: 24, paddingVertical: 14, paddingHorizontal: 30 },
    emptyCtaTxt: { color: "#fff", fontFamily: FONTS.bodyExtra, fontSize: 15 },
  });
}
