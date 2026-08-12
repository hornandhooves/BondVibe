import React, { forwardRef, useState, useCallback, useImperativeHandle } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import Icon from "./Icon";
import { getUpcomingEvents } from "../services/eventsFeedService";
import { filterDiscoverableEvents } from "../utils/eventFilters";
import { useFocusRefresh } from "../hooks/useFocusRefresh";

/**
 * Home "Events near you" carousel (M0). Same pattern as MarketplaceRow, with its
 * OWN local loading/empty/error state — nothing here can leak into the Services
 * carousel or the rest of Home (fixes the chained-empty bug). "See all" opens
 * the Events tab; a card opens that event's detail. Read-only + navigation.
 *
 * "near you" ordering is a follow-up (no geolocation source) — soonest-first for now.
 *
 * KIN-150: refetches on every tab focus (via useFocusRefresh), not just on
 * mount — previously this only ever loaded once, the whole life of the app
 * process, because HomeScreen stays mounted as a tab root. Exposes `reload`
 * via ref so HomeScreen's pull-to-refresh can force an immediate refetch.
 */
const EventsRow = forwardRef(function EventsRow({ navigation }, ref) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const s = createStyles(colors);

  const [events, setEvents] = useState([]);

  const load = useCallback(async () => {
    // KIN-158: the feed query bounds by day, so an event that ended this
    // morning still comes back. Drop finished/cancelled before rendering.
    setEvents(filterDiscoverableEvents(await getUpcomingEvents(8)));
  }, []);
  const { loading, error, reload } = useFocusRefresh(load);
  useImperativeHandle(ref, () => ({ reload }), [reload]);

  const goEvents = () => navigation.navigate("EventsTab");
  const fmtDate = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(i18n.language, { weekday: "short", month: "short", day: "numeric" })
      : "";

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={[s.title, { color: colors.text }]}>{t("home.events.title")}</Text>
        <TouchableOpacity onPress={goEvents}>
          <Text style={[s.seeAll, { color: colors.primary }]}>{t("home.events.seeAll")}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rowContent}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[s.card, { borderColor: colors.border, backgroundColor: "#ECE9F1" }]} />
          ))}
        </ScrollView>
      ) : error ? (
        <TouchableOpacity style={[s.stateCard, { borderColor: colors.border }]} onPress={reload} activeOpacity={0.85}>
          <Icon name="close" size={20} color={colors.error} />
          <Text style={[s.stateTxt, { color: colors.textSecondary }]}>{t("home.events.error")}</Text>
          <Text style={[s.stateAction, { color: colors.primary }]}>{t("home.events.retry")}</Text>
        </TouchableOpacity>
      ) : events.length === 0 ? (
        <TouchableOpacity style={[s.stateCard, { borderColor: colors.border }]} onPress={goEvents} activeOpacity={0.85}>
          <Icon name="calendar" size={22} color={colors.textTertiary} />
          <Text style={[s.stateTxt, { color: colors.textSecondary }]}>{t("home.events.empty")}</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rowContent}>
          {events.map((ev) => {
            const img = Array.isArray(ev.images) ? ev.images[0] : null;
            return (
              <TouchableOpacity
                key={ev.id}
                style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => navigation.navigate("EventDetail", { eventId: ev.id })}
                activeOpacity={0.85}
              >
                <View style={[s.thumb, { backgroundColor: colors.brandSoft }]}>
                  {img ? (
                    <Image source={{ uri: img }} style={s.thumbImg} />
                  ) : (
                    <Icon name="calendar" size={22} color={colors.primary} />
                  )}
                </View>
                <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={2}>{ev.title}</Text>
                <Text style={[s.cardDate, { color: colors.textSecondary }]} numberOfLines={1}>{fmtDate(ev.date)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
});

export default EventsRow;

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { marginTop: 8, marginBottom: 18 },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingHorizontal: 24 },
    title: { fontFamily: FONTS.bodyExtra, fontSize: 17 },
    seeAll: { fontFamily: FONTS.bodyBold, fontSize: 13 },
    rowContent: { paddingLeft: 24, paddingRight: 8, gap: 12 },
    card: { width: 148, minHeight: 150, borderWidth: 1, borderRadius: 18, padding: 12 },
    thumb: { width: "100%", height: 84, borderRadius: 12, overflow: "hidden", alignItems: "center", justifyContent: "center", marginBottom: 10 },
    thumbImg: { width: "100%", height: 84 },
    cardTitle: { fontFamily: FONTS.display, fontSize: 14, letterSpacing: -0.2, lineHeight: 18 },
    cardDate: { fontFamily: FONTS.displaySemibold, fontSize: 12.5, marginTop: 6, letterSpacing: -0.2 },
    // Full-width, centered — the empty/error state spans the row, not one card.
    stateCard: { marginHorizontal: 24, minHeight: 104, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 20, gap: 8 },
    stateTxt: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, textAlign: "center" },
    stateAction: { fontFamily: FONTS.bodyBold, fontSize: 12.5 },
  });
}
