/**
 * EventMap (F1) — the Map view for Search. Consumes the SAME `filteredEvents`
 * the list uses, so every active filter applies. Respects F2 (strict): a
 * non-participant event is drawn as an approximate CIRCLE over approxCoords
 * (never an exact pin); the exact pin is only for events the user joined/paid.
 *
 * Phase 1: toggle body = MapView + pins/circles + tap→callout→EventDetail +
 * the "N not on map" note. (Near-me / place-search / "Search this area" /
 * distance arrive in Phase 2.)
 */
import React, { useMemo, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import Icon, { getCategoryIcon } from "../../components/Icon";
import { getCategoryLabel } from "../../utils/eventCategories";
import { formatISODate, formatEventTime } from "../../utils/dateUtils";
import { formatMXN } from "../../utils/pricing";
import { buildMapData } from "../../utils/eventMapData";

export default function EventMap({ events, navigation, currentUid }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);

  const { markers, offMapCount, initialRegion } = useMemo(
    () => buildMapData(events, currentUid),
    [events, currentUid],
  );

  const [selectedId, setSelectedId] = useState(null);
  const selected = markers.find((m) => m.id === selectedId) || null;

  // Let custom marker views paint, then stop tracking (perf).
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 1200);
    return () => clearTimeout(id);
  }, [markers.length]);

  const priceLabel = (ev) =>
    ev.price > 0 ? formatMXN(ev.price) : t("searchEvents.free_badge");

  return (
    <View style={styles.wrap}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        userInterfaceStyle={isDark ? "dark" : "light"}
        onPress={() => setSelectedId(null)}
      >
        {markers.map((m) =>
          m.kind === "circle" ? (
            <React.Fragment key={m.id}>
              <Circle
                center={m.coords}
                radius={m.radius}
                strokeColor={colors.warning}
                strokeWidth={2}
                lineDashPattern={[6, 6]}
                fillColor={`${colors.warning}22`}
              />
              <Marker
                coordinate={m.coords}
                onPress={() => setSelectedId(m.id)}
                tracksViewChanges={tracks}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.lockChip, { backgroundColor: colors.text }]}>
                  <Icon name="lock" size={11} color={colors.warning} type="ui" />
                  <Text style={[styles.lockChipText, { color: colors.surface }]}>
                    {priceLabel(m.event)}
                  </Text>
                </View>
              </Marker>
            </React.Fragment>
          ) : (
            <Marker
              key={m.id}
              coordinate={m.coords}
              onPress={() => setSelectedId(m.id)}
              tracksViewChanges={tracks}
            >
              <View style={styles.pinWrap}>
                <View style={[styles.pinBubble, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.pinText, { color: colors.onPrimary }]}>
                    {priceLabel(m.event)}
                  </Text>
                </View>
                <View style={[styles.pinTail, { borderTopColor: colors.primary }]} />
              </View>
            </Marker>
          ),
        )}
      </MapView>

      {/* "N not on map" note (legacy events without coordinates). */}
      {offMapCount > 0 && (
        <View style={[styles.notOnMap, { backgroundColor: colors.text }]}>
          <Text style={[styles.notOnMapText, { color: colors.surface }]}>
            {t("searchEvents.notOnMap", { count: offMapCount })}
          </Text>
        </View>
      )}

      {/* Callout card overlapping the map bottom. */}
      {selected && (
        <CalloutCard
          marker={selected}
          colors={colors}
          styles={styles}
          t={t}
          priceLabel={priceLabel(selected.event)}
          onPress={() =>
            navigation.navigate("EventDetail", { eventId: selected.event.id })
          }
        />
      )}
    </View>
  );
}

function CalloutCard({ marker, colors, styles, t, priceLabel, onPress }) {
  const ev = marker.event;
  const CategoryIcon = getCategoryIcon(ev.category);
  // F2: never surface the exact street for a locked (non-participant) event.
  const areaLabel = marker.locked
    ? ev.area || t("eventLocation.approxArea")
    : ev.area || ev.location || "";
  return (
    <TouchableOpacity
      style={[styles.callout, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
      activeOpacity={0.9}
      onPress={onPress}
      testID="map-callout"
    >
      <View style={styles.calloutBody}>
        <View style={styles.calloutTopRow}>
          <View style={[styles.categoryChip, { backgroundColor: `${colors.primary}26` }]}>
            <CategoryIcon size={12} color={colors.primary} strokeWidth={2} />
            <Text style={[styles.categoryChipText, { color: colors.primary }]}>
              {getCategoryLabel(ev.category)}
            </Text>
          </View>
          <Text style={[styles.calloutMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {formatISODate(ev.date)} · {formatEventTime(ev.date, ev.time)}
          </Text>
        </View>
        <Text style={[styles.calloutTitle, { color: colors.text }]} numberOfLines={1}>
          {ev.title}
        </Text>
        <View style={styles.calloutBottomRow}>
          <Icon name="location" size={13} color={colors.textTertiary} type="ui" />
          <Text style={[styles.calloutSub, { color: colors.textSecondary }]} numberOfLines={1}>
            {areaLabel ? `${areaLabel} · ` : ""}{priceLabel}
          </Text>
        </View>
      </View>
      <Icon name="forward" size={20} color={colors.textTertiary} type="ui" />
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    map: { flex: 1 },
    // Pin (participant / exact)
    pinWrap: { alignItems: "center" },
    pinBubble: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
    pinText: { fontSize: 12, fontWeight: "800", letterSpacing: -0.2 },
    pinTail: {
      width: 0,
      height: 0,
      borderLeftWidth: 5,
      borderRightWidth: 5,
      borderTopWidth: 6,
      borderLeftColor: "transparent",
      borderRightColor: "transparent",
      marginTop: -1,
    },
    // Chip over an approximate circle (locked / non-participant)
    lockChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 11,
    },
    lockChipText: { fontSize: 11, fontWeight: "800", letterSpacing: -0.2 },
    // "N not on map"
    notOnMap: {
      position: "absolute",
      left: 12,
      bottom: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      opacity: 0.88,
    },
    notOnMapText: { fontSize: 10.5, fontWeight: "600" },
    // Callout card
    callout: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 28,
      elevation: 8,
    },
    calloutBody: { flex: 1, gap: 5 },
    calloutTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    categoryChipText: { fontSize: 10.5, fontWeight: "700" },
    calloutMeta: { fontSize: 11.5, fontWeight: "600", flexShrink: 1 },
    calloutTitle: { fontSize: 14.5, fontWeight: "800", letterSpacing: -0.3 },
    calloutBottomRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    calloutSub: { fontSize: 12.5, flex: 1 },
  });
}
