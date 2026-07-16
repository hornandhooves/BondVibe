import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { formatCentavos } from "../utils/pricing";
import {
  getMarketplaceListings,
  MARKETPLACE_VERTICALS,
} from "../services/marketplaceService";

// Per-vertical accent (rentals/FIDELITY §4). Exact hues per the pixel spec.
export const VERTICAL_META = {
  beauty: { bg: "#FBE4F1", fg: "#B01E6F", icon: "heart" },
  wellness: { bg: "#E1F5EC", fg: "#1a6b52", icon: "wellness" },
  rentals: { bg: "#EDE4FC", fg: "#7C3AED", icon: "bike" },
  home: { bg: "#E1F5EC", fg: "#1a6b52", icon: "home" },
  auto: { bg: "#E6EAFB", fg: "#3d47ab", icon: "settings" },
};

const locationLabelKey = (m) =>
  m === "at_customer"
    ? "marketplace.detail.atCustomer"
    : m === "online"
    ? "marketplace.detail.online"
    : "marketplace.detail.atStudio";

export default function MarketplaceExploreScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const s = createStyles(colors, isDark);

  const [vertical, setVertical] = useState(null); // null = all service verticals
  const [q, setQ] = useState("");
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Rentals is not a SessionType — it never comes from this query.
      const v = vertical && vertical !== "rentals" ? vertical : undefined;
      const list = await getMarketplaceListings({ vertical: v });
      setListings(list);
    } catch (e) {
      setError(true);
    }
    setLoading(false);
  }, [vertical]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = q.trim()
    ? listings.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase()))
    : listings;

  const onVertical = (v) => {
    if (v === "rentals") {
      navigation.navigate("RentalHub");
      return;
    }
    setVertical((cur) => (cur === v ? null : v));
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={s.header}>
        <Text style={[s.headerTitle, { color: colors.text }]}>{t("marketplace.tab")}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={[s.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon name="search" size={17} color={colors.textTertiary} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder={t("marketplace.searchPh")}
            placeholderTextColor={colors.textTertiary}
            value={q}
            onChangeText={setQ}
          />
        </View>

        {/* Vertical grid */}
        <View style={s.grid}>
          {MARKETPLACE_VERTICALS.map((v) => {
            const meta = VERTICAL_META[v];
            const active = vertical === v;
            return (
              <TouchableOpacity
                key={v}
                style={s.gridItem}
                activeOpacity={0.85}
                onPress={() => onVertical(v)}
              >
                <View
                  style={[
                    s.tile,
                    // Selected chip: brand-purple 1.5px border (not the vertical's
                    // own colour), for all verticals. Exact brand hue per spec.
                    { backgroundColor: meta.bg, borderColor: active ? "#7C3AED" : "transparent" },
                  ]}
                >
                  <Icon name={meta.icon} size={22} color={meta.fg} />
                </View>
                <Text
                  style={[
                    s.tileLabel,
                    {
                      color: active ? colors.text : colors.textSecondary,
                      fontFamily: active ? FONTS.bodyBold : FONTS.bodySemibold,
                    },
                  ]}
                >
                  {t(`marketplace.vertical.${v}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[s.sectionTitle, { color: colors.text }]}>
          {vertical ? t(`marketplace.vertical.${vertical}`) : t("marketplace.nearYou")}
        </Text>

        {loading ? (
          <SkeletonList colors={colors} />
        ) : error ? (
          <ErrorState colors={colors} s={s} t={t} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState colors={colors} s={s} t={t} />
        ) : (
          filtered.map((l) => {
            const meta = VERTICAL_META[l.vertical] || VERTICAL_META.wellness;
            return (
              <TouchableOpacity
                key={`${l.bizId}_${l.id}`}
                style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate("ServiceDetail", { bizId: l.bizId, listingId: l.id })}
              >
                <View style={[s.thumb, { backgroundColor: meta.bg }]}>
                  {l.photos[0] ? (
                    <Image source={{ uri: l.photos[0] }} style={s.thumbImg} />
                  ) : (
                    <Icon name={meta.icon} size={24} color={meta.fg} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={[s.eyebrowPill, { backgroundColor: meta.bg }]}>
                    <Text style={[s.eyebrowTxt, { color: meta.fg }]}>
                      {t(`marketplace.vertical.${l.vertical || "wellness"}`)}
                    </Text>
                  </View>
                  <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={1}>
                    {l.name}
                  </Text>
                  <Text style={[s.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t("marketplace.detail.duration", { min: l.durationMin })}
                    {l.city ? ` · ${l.city}` : ""} · {t(locationLabelKey(l.locationMode))}
                  </Text>
                </View>
                <Text style={[s.cardPrice, { color: colors.text }]}>
                  {l.bookingMode === "quote" || !l.priceCents
                    ? t("marketplace.detail.quoteFree")
                    : formatCentavos(l.priceCents)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </GradientBackground>
  );
}

function SkeletonList({ colors }) {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            gap: 14,
            padding: 14,
            marginBottom: 12,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ width: 72, height: 72, borderRadius: 14, backgroundColor: "#ECE9F1" }} />
          <View style={{ flex: 1, justifyContent: "center", gap: 8 }}>
            <View style={{ height: 12, width: "50%", borderRadius: 6, backgroundColor: "#ECE9F1" }} />
            <View style={{ height: 12, width: "80%", borderRadius: 6, backgroundColor: "#F0EDF4" }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({ colors, s, t }) {
  return (
    <View style={s.state}>
      <View style={[s.stateIcon, { backgroundColor: colors.brandSoft }]}>
        <Icon name="search" size={28} color={colors.primary} />
      </View>
      <Text style={[s.stateTitle, { color: colors.text }]}>{t("marketplace.empty.title")}</Text>
      <Text style={[s.stateBody, { color: colors.textSecondary }]}>{t("marketplace.empty.body")}</Text>
    </View>
  );
}

function ErrorState({ colors, s, t, onRetry }) {
  return (
    <View style={s.state}>
      <View style={[s.stateIcon, { backgroundColor: "#F5E9E2" }]}>
        <Icon name="close" size={26} color="#C2410C" />
      </View>
      <Text style={[s.stateTitle, { color: colors.text }]}>{t("marketplace.error.title")}</Text>
      <TouchableOpacity
        style={[s.retry, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={onRetry}
      >
        <Text style={s.retryTxt}>{t("marketplace.error.retry")}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: { paddingHorizontal: 18, paddingTop: 60, paddingBottom: 8 },
    headerTitle: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.4 },
    content: { paddingHorizontal: 18, paddingBottom: 8 },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      paddingHorizontal: 14,
      marginBottom: 16,
    },
    searchInput: { flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 14.5 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 18 },
    gridItem: { width: "18%", alignItems: "center", marginBottom: 8 },
    tile: {
      width: 52,
      height: 52,
      borderRadius: 15,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    tileLabel: { fontFamily: FONTS.bodySemibold, fontSize: 10, textAlign: "center" },
    sectionTitle: { fontFamily: FONTS.bodyExtra, fontSize: 17, marginBottom: 12 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderWidth: 1,
      borderRadius: 18,
      padding: 13,
      marginBottom: 12,
    },
    thumb: {
      width: 72,
      height: 72,
      borderRadius: 14,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    thumbImg: { width: 72, height: 72 },
    eyebrowPill: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 5 },
    eyebrowTxt: { fontFamily: FONTS.bodyBold, fontSize: 9.5, letterSpacing: 0.3, textTransform: "uppercase" },
    cardTitle: { fontFamily: FONTS.display, fontSize: 15, letterSpacing: -0.2 },
    cardMeta: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, marginTop: 3 },
    cardPrice: { fontFamily: FONTS.display, fontSize: 15, letterSpacing: -0.5 },
    state: { alignItems: "center", paddingTop: 40, paddingHorizontal: 30 },
    stateIcon: {
      width: 74,
      height: 74,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    stateTitle: { fontFamily: FONTS.display, fontSize: 17, marginBottom: 8, textAlign: "center" },
    stateBody: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, textAlign: "center", lineHeight: 18 },
    retry: { borderRadius: 22, paddingVertical: 12, paddingHorizontal: 28, marginTop: 16 },
    retryTxt: { color: "#fff", fontFamily: FONTS.bodyBold, fontSize: 14 },
  });
}
