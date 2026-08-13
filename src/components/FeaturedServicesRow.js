/**
 * KIN-185 — Home "Featured Services" bar: paid-placement marketplace
 * listings (featuredUntil still valid), filtered by the signed-in user's
 * city when they have one.
 *
 * The sibling of FeaturedEventsRow, deliberately built the same way: same
 * focus-refresh hook (KIN-150), same forwardRef + reload() for Home's
 * pull-to-refresh, same "render null when empty" contract that the 3-bar
 * Home layout depends on. It does NOT reuse FeaturedCarousel: that component
 * is shaped around an event (date, attendee count), and a service has a
 * price and a duration instead. Forcing a listing into an event's shape
 * would mean faking fields — so this renders listing cards.
 */
import React, { forwardRef, useState, useCallback, useImperativeHandle } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS, RADII, SPACING } from "../constants/theme-tokens";
import { getFeaturedListings } from "../services/promotionService";
import { useFocusRefresh } from "../hooks/useFocusRefresh";
import { formatCentavos } from "../utils/pricing";

const FeaturedServicesRow = forwardRef(function FeaturedServicesRow(
  { navigation, city },
  ref,
) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const s = createStyles(colors);

  const [listings, setListings] = useState([]);

  const load = useCallback(async () => {
    setListings(await getFeaturedListings({ city, max: 10 }));
  }, [city]);
  // KIN-221: same silent-failure shape as Featured Events.
  const { reload } = useFocusRefresh(load, {
    reportAs: "promotionService.getFeaturedListings",
  });
  useImperativeHandle(ref, () => ({ reload }), [reload]);

  if (listings.length === 0) return null;

  return (
    <View style={s.wrap}>
      <Text style={[s.title, { color: colors.text }]}>
        {t("home.featuredServices.title")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.strip}
      >
        {listings.map((l) => (
          <TouchableOpacity
            key={`${l.bizId}_${l.id}`}
            style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate("ServiceDetail", { bizId: l.bizId, listingId: l.id })
            }
          >
            {l.photos[0] ? (
              <Image source={{ uri: l.photos[0] }} style={s.photo} />
            ) : (
              <View style={[s.photo, { backgroundColor: colors.surfaceGlass }]} />
            )}
            <View style={s.body}>
              <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
                {l.name}
              </Text>
              <Text style={[s.biz, { color: colors.textTertiary }]} numberOfLines={1}>
                {l.businessName || "—"}
              </Text>
              <Text style={[s.price, { color: colors.text }]}>
                {l.priceCents > 0 ? formatCentavos(l.priceCents) : "—"}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

export default FeaturedServicesRow;

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { marginTop: 8, marginBottom: 18 },
    title: {
      fontFamily: FONTS.bodyExtra,
      fontSize: 17,
      marginBottom: 12,
      paddingHorizontal: 24,
    },
    strip: { paddingHorizontal: 24, gap: SPACING.md },
    // Flat card: 1px border, no shadow (theme rule) — shadows are for CTAs
    // and the gradient hero cards only.
    card: {
      width: 172,
      borderWidth: 1,
      borderRadius: RADII.card,
      overflow: "hidden",
    },
    photo: { width: "100%", height: 104 },
    body: { padding: SPACING.sm },
    name: { fontFamily: FONTS.bodyExtra, fontSize: 14 },
    biz: { fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
    price: {
      fontFamily: FONTS.display, // Space Grotesk — numerals/amounts
      fontSize: 15,
      marginTop: 6,
      letterSpacing: -0.5,
    },
  });
}
