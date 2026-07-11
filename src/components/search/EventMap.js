/**
 * EventMap (F1) — the Map view for Search. Consumes the SAME `filteredEvents`
 * the list uses. Respects F2 (strict): non-participant events draw as an
 * approximate CIRCLE over approxCoords; the exact pin is only for events the
 * user joined/paid.
 *
 * Phase 2: place-search + "Filters · N" pill + Near-me (top row & FAB),
 * "Search this area" (re-query the visible region), and distance on the callout.
 */
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import Icon, { getCategoryIcon } from "../../components/Icon";
import { getCategoryLabel } from "../../utils/eventCategories";
import { formatISODate, formatEventTime } from "../../utils/dateUtils";
import { formatMXN } from "../../utils/pricing";
import PlaceAutocomplete from "../../components/PlaceAutocomplete";
import { buildMapData, filterMarkersToRegion } from "../../utils/eventMapData";
import { haversineKm, formatDistanceKm } from "../../utils/geo";

const FOCUS_DELTA = 0.08;

export default function EventMap({ events, navigation, currentUid, activeFilterCount = 0, onOpenFilters }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);
  const mapRef = useRef(null);

  const { markers: allMarkers, offMapCount, initialRegion } = useMemo(
    () => buildMapData(events, currentUid),
    [events, currentUid],
  );

  const [searchedRegion, setSearchedRegion] = useState(null); // null → show all
  const [region, setRegion] = useState(initialRegion);
  const [moved, setMoved] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [tracks, setTracks] = useState(true);

  // The event set changed (filters) → drop any "search this area" constraint.
  useEffect(() => {
    setSearchedRegion(null);
    setMoved(false);
  }, [allMarkers.length]);

  const markers = searchedRegion ? filterMarkersToRegion(allMarkers, searchedRegion) : allMarkers;
  const selected = markers.find((m) => m.id === selectedId) || null;

  useEffect(() => {
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 1200);
    return () => clearTimeout(id);
  }, [markers.length]);

  const onRegionChangeComplete = useCallback(
    (r) => {
      setRegion(r);
      const ref = searchedRegion || initialRegion;
      const dLat = Math.abs(r.latitude - ref.latitude);
      const dLng = Math.abs(r.longitude - ref.longitude);
      setMoved(dLat > ref.latitudeDelta * 0.35 || dLng > ref.longitudeDelta * 0.35);
    },
    [searchedRegion, initialRegion],
  );

  const onSearchThisArea = () => {
    setSearchedRegion(region);
    setMoved(false);
    setSelectedId(null);
  };

  const goNearMe = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("searchEvents.locationDeniedTitle"), t("searchEvents.locationDeniedMsg"));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUserLocation(coords);
      mapRef.current?.animateToRegion({ ...coords, latitudeDelta: FOCUS_DELTA, longitudeDelta: FOCUS_DELTA }, 500);
    } catch (e) {
      Alert.alert(t("searchEvents.locationDeniedTitle"), t("searchEvents.locationDeniedMsg"));
    } finally {
      setLocating(false);
    }
  };

  const onPlaceSelect = (place) => {
    if (place && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
      mapRef.current?.animateToRegion(
        { latitude: place.latitude, longitude: place.longitude, latitudeDelta: FOCUS_DELTA, longitudeDelta: FOCUS_DELTA },
        500,
      );
    }
  };

  const priceLabel = (ev) => (ev.price > 0 ? formatMXN(ev.price) : t("searchEvents.free_badge"));
  const distanceOrigin = userLocation || region;

  return (
    <View style={styles.wrap}>
      {/* Top row: place-search + Filters·N pill + Near-me */}
      <View style={styles.topRow}>
        <View style={styles.placeSearch}>
          <PlaceAutocomplete onSelect={onPlaceSelect} placeholder={t("searchEvents.searchPlace")} />
        </View>
        <TouchableOpacity
          style={[styles.filtersPill, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
          onPress={onOpenFilters}
          activeOpacity={0.85}
          testID="map-filters-pill"
        >
          <Icon name="filter" size={14} color={activeFilterCount > 0 ? colors.primary : colors.textSecondary} type="ui" />
          <Text style={[styles.filtersPillText, { color: colors.textSecondary }]}>{t("searchEvents.filters")}</Text>
          {activeFilterCount > 0 && (
            <View style={[styles.filtersBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.filtersBadgeText, { color: colors.onPrimary }]}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nearMeBtn, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
          onPress={goNearMe}
          activeOpacity={0.85}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="crosshair" size={19} color={colors.primary} type="ui" />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation={!!userLocation}
          userInterfaceStyle={isDark ? "dark" : "light"}
          onRegionChangeComplete={onRegionChangeComplete}
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
                <Marker coordinate={m.coords} onPress={() => setSelectedId(m.id)} tracksViewChanges={tracks} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={[styles.lockChip, { backgroundColor: colors.text }]}>
                    <Icon name="lock" size={11} color={colors.warning} type="ui" />
                    <Text style={[styles.lockChipText, { color: colors.surface }]}>{priceLabel(m.event)}</Text>
                  </View>
                </Marker>
              </React.Fragment>
            ) : (
              <Marker key={m.id} coordinate={m.coords} onPress={() => setSelectedId(m.id)} tracksViewChanges={tracks}>
                <View style={styles.pinWrap}>
                  <View style={[styles.pinBubble, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.pinText, { color: colors.onPrimary }]}>{priceLabel(m.event)}</Text>
                  </View>
                  <View style={[styles.pinTail, { borderTopColor: colors.primary }]} />
                </View>
              </Marker>
            ),
          )}
        </MapView>

        {/* Search this area (appears after the map is panned). */}
        {moved && (
          <TouchableOpacity
            style={[styles.searchArea, { backgroundColor: colors.text }]}
            onPress={onSearchThisArea}
            activeOpacity={0.9}
            testID="search-this-area"
          >
            <Icon name="refresh" size={14} color={colors.surface} type="ui" />
            <Text style={[styles.searchAreaText, { color: colors.surface }]}>{t("searchEvents.searchThisArea")}</Text>
          </TouchableOpacity>
        )}

        {/* Near-me FAB */}
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.surface }]} onPress={goNearMe} activeOpacity={0.85}>
          <Icon name="crosshair" size={20} color={colors.primary} type="ui" />
        </TouchableOpacity>

        {/* "N not on map" */}
        {offMapCount > 0 && (
          <View style={[styles.notOnMap, { backgroundColor: colors.text }]}>
            <Text style={[styles.notOnMapText, { color: colors.surface }]}>
              {t("searchEvents.notOnMap", { count: offMapCount })}
            </Text>
          </View>
        )}

        {/* Callout */}
        {selected && (
          <CalloutCard
            marker={selected}
            colors={colors}
            styles={styles}
            t={t}
            priceLabel={priceLabel(selected.event)}
            distance={formatDistanceKm(haversineKm(distanceOrigin, selected.coords))}
            onPress={() => navigation.navigate("EventDetail", { eventId: selected.event.id })}
          />
        )}
      </View>
    </View>
  );
}

function CalloutCard({ marker, colors, styles, t, priceLabel, distance, onPress }) {
  const ev = marker.event;
  const CategoryIcon = getCategoryIcon(ev.category);
  // F2: never surface the exact street for a locked (non-participant) event.
  const areaLabel = marker.locked ? ev.area || t("eventLocation.approxArea") : ev.area || ev.location || "";
  const meta = [formatISODate(ev.date), formatEventTime(ev.date, ev.time), distance].filter(Boolean).join(" · ");
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
            <Text style={[styles.categoryChipText, { color: colors.primary }]}>{getCategoryLabel(ev.category)}</Text>
          </View>
          <Text style={[styles.calloutMeta, { color: colors.textSecondary }]} numberOfLines={1}>{meta}</Text>
        </View>
        <Text style={[styles.calloutTitle, { color: colors.text }]} numberOfLines={1}>{ev.title}</Text>
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
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    placeSearch: { flex: 1 },
    filtersPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    filtersPillText: { fontSize: 12.5, fontWeight: "700" },
    filtersBadge: {
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    filtersBadgeText: { fontSize: 10.5, fontWeight: "800" },
    nearMeBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    mapWrap: { flex: 1 },
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
    // Chip over an approximate circle (locked)
    lockChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 11,
    },
    lockChipText: { fontSize: 11, fontWeight: "800", letterSpacing: -0.2 },
    // "Search this area" (top-center over the map)
    searchArea: {
      position: "absolute",
      top: 12,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 22,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 18,
      elevation: 6,
    },
    searchAreaText: { fontSize: 13, fontWeight: "800", letterSpacing: -0.2 },
    // Near-me FAB
    fab: {
      position: "absolute",
      right: 14,
      bottom: 96,
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
      elevation: 6,
    },
    // "N not on map"
    notOnMap: {
      position: "absolute",
      left: 12,
      bottom: 96,
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
    categoryChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    categoryChipText: { fontSize: 10.5, fontWeight: "700" },
    calloutMeta: { fontSize: 11.5, fontWeight: "600", flexShrink: 1 },
    calloutTitle: { fontSize: 14.5, fontWeight: "800", letterSpacing: -0.3 },
    calloutBottomRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    calloutSub: { fontSize: 12.5, flex: 1 },
  });
}
