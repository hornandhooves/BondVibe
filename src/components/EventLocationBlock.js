/**
 * F2 gated-location block for EventDetail — the same resolveEventLocation the map
 * uses, so the gate logic isn't duplicated. Three states:
 *   • Locked (non-participant, gated): approximate map CIRCLE + area + a "reserve
 *     to unlock" CTA. Never the exact address.
 *   • Unlocked (participant): exact map PIN + venue + street address + Open in Maps.
 *   • Legacy (un-migrated): renders exact fields as today.
 */
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import Icon from "./Icon";
import { APPROX_CIRCLE_RADIUS_M } from "../utils/eventLocation";
import { getEventLocation } from "../services/eventLocationService";
import { formatMXN } from "../utils/pricing";

// Three explicit states — never let "we haven't checked yet" masquerade as
// "locked". A synchronous initial guess is exactly the bug this replaced:
// EventDetailScreen's isJoined starts false and only flips true once
// isOnRoster() resolves, so computing an initial state from isParticipant at
// mount time was guaranteed to render the wrong answer for a genuine
// attendee on their very first paint.
const STATUS = { LOADING: "loading", LOCKED: "locked", UNLOCKED: "unlocked" };

export default function EventLocationBlock({ event, eventId, isParticipant, onReserve }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);

  const withId = { ...event, id: eventId || event?.id };
  // No synchronous initializer — this component derives NO state of its own
  // from the (possibly still-resolving) isParticipant prop. The effect below
  // is the only thing allowed to set a real answer; until it does, we
  // genuinely don't know, and say so.
  const [resolved, setResolved] = useState(null);

  useEffect(() => {
    let alive = true;
    // Re-entering "unknown" on every dependency change (not just at mount)
    // means a stale answer is never shown while a fresh one is in flight —
    // e.g. isParticipant flipping false→true right after mount shows a
    // skeleton again instead of holding onto the wrong locked render.
    setResolved(null);
    // Forward the caller's real membership (e.g. EventDetailScreen's
    // isOnRoster-informed isParticipant) — without this, getEventLocation
    // falls back to the creator/co-host-only heuristic and silently
    // downgrades a genuine attendee back to the locked/approximate view
    // once this effect resolves and overwrites the initial render.
    getEventLocation(withId, { isParticipant }).then((r) => {
      if (alive && r) setResolved(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId || event?.id, isParticipant]);

  // `locked` and `exact` are independent booleans, not inverses — a
  // participant whose private doc hasn't loaded yet (fetchPrivateLocation
  // returned null) resolves to {locked: false, exact: false}
  // (resolveEventLocation's gated branch: locked = !isParticipant). What's
  // DRAWN (pin/green vs circle/gray) must track `exact` — whether we
  // actually have real venue/address/coords to show, not just whether the
  // viewer is nominally "not locked out".
  const status =
    resolved === null ? STATUS.LOADING : resolved.exact ? STATUS.UNLOCKED : STATUS.LOCKED;

  if (status === STATUS.LOADING) {
    return (
      <View
        style={styles.wrap}
        accessible
        accessibilityLabel={t("eventLocation.loading")}
      >
        <View style={[styles.skeletonMap, { backgroundColor: colors.sunken, borderColor: colors.borderStrong }]} />
        <View style={[styles.skeletonBox, { backgroundColor: colors.sunken, borderColor: colors.borderStrong }]}>
          <View style={[styles.skeletonLine, styles.skeletonLineShort, { backgroundColor: colors.border }]} />
          <View style={[styles.skeletonLine, { backgroundColor: colors.border }]} />
        </View>
      </View>
    );
  }

  const { legacy, area, venueName, address, coords } = resolved;

  const openMaps = () => {
    if (!coords && !address) return;
    const q = coords ? `${coords.latitude},${coords.longitude}` : address;
    const url =
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` +
      (event?.placeId ? `&query_place_id=${event.placeId}` : "");
    Linking.openURL(url);
  };

  const priceLabel = event?.price > 0 ? formatMXN(event.price) : null;

  return (
    <View style={styles.wrap}>
      {!!coords && (
        <View style={[styles.mapBox, { borderColor: colors.borderStrong }]}>
          <MapView
            style={styles.map}
            pointerEvents="none"
            userInterfaceStyle={isDark ? "dark" : "light"}
            initialRegion={{ ...coords, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          >
            {status === STATUS.UNLOCKED ? (
              <Marker coordinate={coords} pinColor={colors.primary} />
            ) : (
              <Circle
                center={coords}
                radius={APPROX_CIRCLE_RADIUS_M}
                fillColor={`${colors.primary}22`}
                strokeColor={colors.primary}
                strokeWidth={2}
                lineDashPattern={[6, 6]}
              />
            )}
          </MapView>
          {/* The tag's wording ("reserve to see it") is about GATING, which
              tracks resolved.locked directly — not the derived `status`
              (what's drawn). A participant with {locked:false, exact:false}
              already has access; they just don't have data yet, so they
              shouldn't be told to "reserve" something they already did. */}
          {resolved.locked && (
            <View style={[styles.approxTag, { backgroundColor: colors.text }]}>
              <Text style={[styles.approxTagText, { color: colors.surface }]}>
                {t("eventLocation.approxArea")}
              </Text>
            </View>
          )}
        </View>
      )}

      {status === STATUS.UNLOCKED ? (
        <View style={[styles.exactBox, { backgroundColor: `${colors.success}12`, borderColor: `${colors.success}44` }]}>
          {!legacy && (
            <View style={styles.badgeRow}>
              <Icon name="check" size={13} color={colors.success} type="ui" />
              <Text style={[styles.unlockedBadge, { color: colors.success }]}>{t("eventLocation.unlocked")}</Text>
            </View>
          )}
          <Text style={[styles.exactLabel, { color: colors.success }]}>{t("eventLocation.exactLocation")}</Text>
          {!!venueName && <Text style={[styles.venue, { color: colors.text }]}>{venueName}</Text>}
          {!!address && <Text style={[styles.address, { color: colors.textSecondary }]}>{address}</Text>}
          {(!!coords || !!address) && (
            <TouchableOpacity style={styles.mapsLink} onPress={openMaps} activeOpacity={0.7}>
              <Icon name="location" size={14} color={colors.primary} type="ui" />
              <Text style={[styles.mapsLinkText, { color: colors.primary }]}>{t("eventDetail.openInMaps")}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={[styles.lockedBox, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
          <View style={styles.badgeRow}>
            <Icon name="lock" size={13} color={colors.warning} type="ui" />
            <Text style={[styles.lockedBadge, { color: colors.warning }]}>{t("eventLocation.locked")}</Text>
          </View>
          <Text style={[styles.lockedArea, { color: colors.text }]}>{area || t("eventLocation.approxArea")}</Text>
          <Text style={[styles.lockedHint, { color: colors.textTertiary }]}>{t("eventLocation.approxNote")}</Text>
          {!!onReserve && (
            <TouchableOpacity style={[styles.reserveCta, { backgroundColor: colors.primary }]} onPress={onReserve} activeOpacity={0.9}>
              <Icon name="lock" size={15} color={colors.onPrimary} type="ui" />
              <Text style={[styles.reserveText, { color: colors.onPrimary }]}>
                {event?.price > 0
                  ? `${t("eventLocation.reserve")} · ${priceLabel}`
                  : t("eventLocation.joinToUnlock")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { marginBottom: 12 },
    mapBox: { height: 150, borderRadius: 16, overflow: "hidden", borderWidth: 1, marginBottom: 10 },
    map: { flex: 1 },
    // Loading — content-shaped placeholders only, matching mapBox/lockedBox's
    // footprint so nothing jumps once the real answer lands.
    skeletonMap: { height: 150, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
    skeletonBox: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
    skeletonLine: { height: 12, borderRadius: 6, width: "70%" },
    skeletonLineShort: { width: "40%" },
    approxTag: {
      position: "absolute",
      bottom: 10,
      alignSelf: "center",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      opacity: 0.9,
    },
    approxTagText: { fontSize: 11.5, fontWeight: "700" },
    badgeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
    // Unlocked / exact
    exactBox: { borderWidth: 1, borderRadius: 14, padding: 16 },
    unlockedBadge: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
    exactLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 },
    venue: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
    address: { fontSize: 13.5, marginTop: 2, lineHeight: 19 },
    mapsLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
    mapsLinkText: { fontSize: 13.5, fontWeight: "800" },
    // Locked
    lockedBox: { borderWidth: 1, borderRadius: 14, padding: 16 },
    lockedBadge: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
    lockedArea: { fontSize: 16.5, fontWeight: "800", letterSpacing: -0.3 },
    lockedHint: { fontSize: 12.5, marginTop: 4, lineHeight: 18 },
    reserveCta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 48,
      borderRadius: 24,
      marginTop: 14,
    },
    reserveText: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  });
}
