/**
 * KIN-184 — Home "Featured Events" bar: paid-placement events
 * (featuredUntil still valid), filtered by the signed-in user's city when
 * they have one. Reuses FeaturedCarousel (the same component already used
 * by MyEventsScreen's "Popular" row) — this is a second instance with its
 * own label and its own city-filtered query, not a copy of the carousel
 * mechanics.
 *
 * Renders nothing when there are no featured events — the 3-bar Home layout
 * (this + Featured Services [KIN-185] + Browse by Community) is built on
 * each bar returning null when empty, so there's never a fixed gap for an
 * absent section.
 *
 * Refetches on tab focus (KIN-150's useFocusRefresh, not a bespoke
 * mechanism) and exposes `reload()` via ref for Home's pull-to-refresh.
 */
import React, { forwardRef, useState, useCallback, useImperativeHandle } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import FeaturedCarousel from "./FeaturedCarousel";
import { getFeaturedEventsNearby } from "../services/promotionService";
import { useFocusRefresh } from "../hooks/useFocusRefresh";
import { filterDiscoverableEvents } from "../utils/eventFilters";

const FeaturedEventsRow = forwardRef(function FeaturedEventsRow({ navigation, city }, ref) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const s = createStyles(colors);

  const [events, setEvents] = useState([]);

  const load = useCallback(async () => {
    // KIN-158: a paid placement doesn't keep an event alive past its end.
    setEvents(filterDiscoverableEvents(await getFeaturedEventsNearby({ city, max: 10 })));
  }, [city]);
  // KIN-221: this carousel is where the silent failure was found. Naming the
  // surface is what gets a failed read into Cloud Logging instead of nowhere.
  const { reload } = useFocusRefresh(load, {
    reportAs: "promotionService.getFeaturedEventsNearby",
  });
  useImperativeHandle(ref, () => ({ reload }), [reload]);

  if (events.length === 0) return null;

  return (
    <View style={s.wrap}>
      <Text style={[s.title, { color: colors.text }]}>{t("home.featuredEvents.title")}</Text>
      <FeaturedCarousel
        events={events}
        onPressEvent={(ev) => navigation.navigate("EventDetail", { eventId: ev.id })}
      />
    </View>
  );
});

export default FeaturedEventsRow;

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { marginTop: 8, marginBottom: 18, paddingHorizontal: 24 },
    title: { fontFamily: FONTS.bodyExtra, fontSize: 17, marginBottom: 12 },
  });
}
