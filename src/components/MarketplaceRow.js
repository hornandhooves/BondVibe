import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import Icon from "./Icon";
import { formatCentavos } from "../utils/pricing";
import { getMarketplaceListings } from "../services/marketplaceService";
import { VERTICAL_META } from "../screens/MarketplaceExploreScreen";

/**
 * Home "Services near you" carousel (Marketplace M0). Read-only + navigation:
 * a horizontal row of public SessionTypes + a Rentals category card. "See all"
 * and the service cards open the Services tab (MarketplaceExplore); the Rentals
 * card opens RentalHub (its own flow). No new engine — just a listings read.
 *
 * NOTE: "near you" ordering isn't implemented (no geolocation source yet) — the
 * row shows listings in query order; distance sort is a follow-up.
 */
export default function MarketplaceRow({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const s = createStyles(colors);

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setListings(await getMarketplaceListings({ max: 8 }));
    } catch (e) {
      setError(true);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const goServices = () => navigation.navigate("ServicesTab");
  const goRentals = () => navigation.navigate("RentalHub");

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={[s.title, { color: colors.text }]}>{t("home.marketplace.title")}</Text>
        <TouchableOpacity onPress={goServices}>
          <Text style={[s.seeAll, { color: colors.primary }]}>{t("home.marketplace.seeAll")}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rowContent}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[s.card, { borderColor: colors.border, backgroundColor: "#ECE9F1" }]} />
          ))}
        </ScrollView>
      ) : error ? (
        <TouchableOpacity style={[s.stateCard, { borderColor: colors.border }]} onPress={load} activeOpacity={0.85}>
          <Icon name="close" size={20} color={colors.error} />
          <Text style={[s.stateTxt, { color: colors.textSecondary }]}>{t("home.marketplace.error")}</Text>
          <Text style={[s.stateAction, { color: colors.primary }]}>{t("home.marketplace.retry")}</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rowContent}>
          {listings.map((l) => {
            const meta = VERTICAL_META[l.vertical] || VERTICAL_META.wellness;
            return (
              <TouchableOpacity
                key={`${l.bizId}_${l.id}`}
                style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={goServices}
                activeOpacity={0.85}
              >
                <View style={[s.thumb, { backgroundColor: meta.bg }]}>
                  {l.photos[0] ? (
                    <Image source={{ uri: l.photos[0] }} style={s.thumbImg} />
                  ) : (
                    <Icon name={meta.icon} size={22} color={meta.fg} />
                  )}
                </View>
                <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={1}>{l.name}</Text>
                <Text style={[s.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {t(`marketplace.vertical.${l.vertical || "wellness"}`)}
                </Text>
                <Text style={[s.cardPrice, { color: colors.text }]}>
                  {l.bookingMode === "quote"
                    ? t("marketplace.detail.quote")
                    : !l.priceCents
                    ? t("marketplace.detail.free")
                    : formatCentavos(l.priceCents)}
                </Text>
              </TouchableOpacity>
            );
          })}
          {/* Rentals category card — its own flow (RentalHub). */}
          <TouchableOpacity
            style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={goRentals}
            activeOpacity={0.85}
          >
            <View style={[s.thumb, { backgroundColor: VERTICAL_META.rentals.bg }]}>
              <Icon name="bike" size={22} color={VERTICAL_META.rentals.fg} />
            </View>
            <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={1}>{t("marketplace.vertical.rentals")}</Text>
            <Text style={[s.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>{t("home.marketplace.rentalsCard")}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { marginTop: 8, marginBottom: 18 },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingHorizontal: 24 },
    title: { fontFamily: FONTS.bodyExtra, fontSize: 17 },
    seeAll: { fontFamily: FONTS.bodyBold, fontSize: 13 },
    rowContent: { paddingLeft: 24, paddingRight: 8, gap: 12 },
    card: {
      width: 132,
      minHeight: 150,
      borderWidth: 1,
      borderRadius: 18,
      padding: 12,
    },
    thumb: {
      width: "100%",
      height: 76,
      borderRadius: 12,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    thumbImg: { width: "100%", height: 76 },
    cardTitle: { fontFamily: FONTS.display, fontSize: 14, letterSpacing: -0.2 },
    cardMeta: { fontFamily: FONTS.bodyMedium, fontSize: 12, marginTop: 3 },
    cardPrice: { fontFamily: FONTS.display, fontSize: 14, letterSpacing: -0.5, marginTop: 6 },
    // Full-width, centered — the empty/error state spans the row, not one card.
    stateCard: {
      marginHorizontal: 24,
      minHeight: 104,
      borderWidth: 1,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      gap: 8,
    },
    stateTxt: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, textAlign: "center" },
    stateAction: { fontFamily: FONTS.bodyBold, fontSize: 12.5 },
  });
}
