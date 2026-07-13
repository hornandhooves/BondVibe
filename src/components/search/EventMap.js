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
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Modal, ScrollView, UIManager } from "react-native";

// react-native-maps is a NATIVE module. On a build made before it was linked
// (stale pods), the JS shim still imports fine but the native view managers
// aren't registered, so rendering <MapView>/<Marker> throws "View config not
// found for AIRMapMarker" and takes down the whole Search screen. Load it
// defensively; the MapErrorBoundary below catches that render failure (or a
// null component) and shows a friendly fallback instead of crashing. We do NOT
// pre-flight the view-manager registry — that misfired as a false negative and
// hid a perfectly good map; catching the actual error is what's reliable.
let MapView, Marker, Circle;
try {
  const Maps = require("react-native-maps");
  MapView = Maps.default;
  Marker = Maps.Marker;
  Circle = Maps.Circle;
} catch (e) {
  MapView = Marker = Circle = null;
}

// Whether the native map view managers are registered in THIS binary. Uses the
// same API react-native-maps uses internally (hasViewManagerConfig) so it stays
// silent when absent — checking here lets us skip rendering the map on a build
// without the native module (rendering it throws "View config not found for
// AIRMapMarker" and, in dev, flashes the LogBox error). MapErrorBoundary below
// is the belt-and-suspenders net.
function nativeMapsAvailable() {
  try {
    const has = UIManager.hasViewManagerConfig;
    if (typeof has !== "function") return false;
    return has.call(UIManager, "AIRMap") || has.call(UIManager, "AIRGoogleMap");
  } catch (e) {
    return false;
  }
}
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import Icon, { getCategoryIcon } from "../../components/Icon";
import { getCategoryLabel } from "../../utils/eventCategories";
import { formatISODate, formatEventTime } from "../../utils/dateUtils";
import { formatMXN } from "../../utils/pricing";
import PlaceAutocomplete from "../../components/PlaceAutocomplete";
import { buildMapData, filterMarkersToRegion, clusterMarkers } from "../../utils/eventMapData";
import { haversineKm, formatDistanceKm } from "../../utils/geo";

const FOCUS_DELTA = 0.08;

// Default export renders the real map, wrapped in an error boundary: if the
// native module is missing (stale build) the map render throws and we show a
// friendly fallback instead of taking down the Search screen. With maps linked
// it renders normally. The List/Map toggle lives above this in
// SearchEventsScreen, so the user can always switch back.
export default function EventMap(props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Skip the map entirely when the native module isn't in this build: a clean
  // fallback with no render attempt (so dev doesn't flash a LogBox error).
  if (!MapView || !nativeMapsAvailable()) {
    return <MapUnavailable colors={colors} t={t} />;
  }
  // Belt-and-suspenders: if the pre-check ever wrong-positives, catch the map
  // render failure instead of taking down the Search screen.
  return (
    <MapErrorBoundary fallback={<MapUnavailable colors={colors} t={t} />}>
      <EventMapView {...props} />
    </MapErrorBoundary>
  );
}

class MapErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    // Expected on builds without the react-native-maps native module linked.
    console.warn("EventMap: native map unavailable —", error?.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function MapUnavailable({ colors, t }) {
  return (
    <View style={[unavailableStyles.wrap, { backgroundColor: colors.background }]} testID="map-unavailable">
      <View style={[unavailableStyles.iconCircle, { backgroundColor: colors.brandSoft }]}>
        <Icon name="location" size={30} color={colors.primary} type="ui" />
      </View>
      <Text style={[unavailableStyles.title, { color: colors.text }]}>{t("searchEvents.mapUnavailableTitle")}</Text>
      <Text style={[unavailableStyles.text, { color: colors.textSecondary }]}>{t("searchEvents.mapUnavailableText")}</Text>
    </View>
  );
}

const unavailableStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 14 },
  iconCircle: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3, textAlign: "center" },
  text: { fontSize: 14, fontWeight: "500", textAlign: "center", lineHeight: 21 },
});

function EventMapView({ events, navigation, currentUid, activeFilterCount = 0, onOpenFilters }) {
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
  const [clusterList, setClusterList] = useState(null); // co-located cluster → list sheet

  // Stable signature of the marker SET (ids) — resets below fire when the set
  // actually changes, not on every filter re-run that keeps the same events.
  const markerSig = useMemo(() => allMarkers.map((m) => m.id).join("|"), [allMarkers]);

  // The event set changed (filters) → drop any "search this area" constraint.
  useEffect(() => {
    setSearchedRegion(null);
    setMoved(false);
  }, [markerSig]);

  const markers = useMemo(
    () => (searchedRegion ? filterMarkersToRegion(allMarkers, searchedRegion) : allMarkers),
    [allMarkers, searchedRegion],
  );
  // Cluster for the current zoom; lone markers render as pins/circles.
  const { clusters, singles } = useMemo(() => clusterMarkers(markers, region), [markers, region]);
  const selected = singles.find((m) => m.id === selectedId) || null;

  useEffect(() => {
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 1200);
    return () => clearTimeout(id);
  }, [singles.length, clusters.length, isDark]);

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

  const zoomToCluster = (cluster) => {
    mapRef.current?.animateToRegion(
      {
        latitude: cluster.coords.latitude,
        longitude: cluster.coords.longitude,
        latitudeDelta: Math.max(region.latitudeDelta / 2.5, 0.01),
        longitudeDelta: Math.max(region.longitudeDelta / 2.5, 0.01),
      },
      400,
    );
  };

  // Zooming only helps when the members sit at DIFFERENT points. Co-located
  // events (F2 snaps every non-participant to the same ~1km grid cell) can never
  // zoom-split, so open a list instead — otherwise those events are unreachable.
  const onClusterPress = (cluster) => {
    const distinct = new Set(cluster.markers.map((m) => `${m.coords.latitude},${m.coords.longitude}`));
    if (distinct.size > 1) zoomToCluster(cluster);
    else setClusterList(cluster.markers);
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
          {clusters.map((c) => (
            <Marker key={c.id} coordinate={c.coords} onPress={() => onClusterPress(c)} tracksViewChanges={tracks} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.cluster, { backgroundColor: colors.primary, borderColor: colors.onPrimary }]}>
                <Text style={[styles.clusterText, { color: colors.onPrimary }]}>{c.count}</Text>
              </View>
            </Marker>
          ))}
          {singles.map((m) =>
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

      {/* Co-located cluster → a list so every event stays reachable. */}
      <ClusterListSheet
        markers={clusterList}
        colors={colors}
        styles={styles}
        t={t}
        priceLabel={priceLabel}
        distanceOrigin={distanceOrigin}
        onSelect={(id) => {
          setClusterList(null);
          navigation.navigate("EventDetail", { eventId: id });
        }}
        onClose={() => setClusterList(null)}
      />
    </View>
  );
}

function ClusterListSheet({ markers, colors, styles, t, priceLabel, distanceOrigin, onSelect, onClose }) {
  return (
    <Modal visible={!!markers} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.clusterOverlay}>
        <TouchableOpacity style={styles.clusterBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.clusterSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.clusterHandle}>
            <View style={[styles.clusterGrip, { backgroundColor: colors.borderStrong }]} />
            <Text style={[styles.clusterHeader, { color: colors.text }]}>
              {t("searchEvents.eventsHere", { count: markers ? markers.length : 0 })}
            </Text>
          </View>
          <ScrollView style={styles.clusterBody} showsVerticalScrollIndicator={false}>
            {(markers || []).map((m) => {
              const ev = m.event;
              const CategoryIcon = getCategoryIcon(ev.category);
              const areaLabel = m.locked ? ev.area || t("eventLocation.approxArea") : ev.area || ev.location || "";
              const dist = formatDistanceKm(haversineKm(distanceOrigin, m.coords));
              return (
                <TouchableOpacity key={m.id} style={[styles.clusterRow, { borderBottomColor: colors.border }]} onPress={() => onSelect(ev.id)} activeOpacity={0.85}>
                  <View style={[styles.categoryChip, { backgroundColor: `${colors.primary}26` }]}>
                    <CategoryIcon size={12} color={colors.primary} strokeWidth={2} />
                    <Text style={[styles.categoryChipText, { color: colors.primary }]}>{getCategoryLabel(ev.category)}</Text>
                  </View>
                  <View style={styles.clusterRowBody}>
                    <Text style={[styles.calloutTitle, { color: colors.text }]} numberOfLines={1}>{ev.title}</Text>
                    <Text style={[styles.calloutSub, { color: colors.textSecondary }]} numberOfLines={1}>
                      {[areaLabel, priceLabel(ev), dist].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Icon name="forward" size={18} color={colors.textTertiary} type="ui" />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
    // Cluster count bubble
    cluster: {
      minWidth: 34,
      height: 34,
      borderRadius: 17,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
    },
    clusterText: { fontSize: 13, fontWeight: "800" },
    // Cluster list sheet
    clusterOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
    clusterBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    clusterSheet: { maxHeight: "70%", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 24 },
    clusterHandle: { alignItems: "center", paddingTop: 10, paddingBottom: 8 },
    clusterGrip: { width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
    clusterHeader: { fontSize: 15.5, fontWeight: "800", letterSpacing: -0.3 },
    clusterBody: { paddingHorizontal: 16 },
    clusterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    clusterRowBody: { flex: 1, gap: 3 },
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
