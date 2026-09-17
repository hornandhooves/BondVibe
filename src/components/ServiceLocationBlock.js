/**
 * KIN-284/288 gated-location block for ServiceDetailScreen. Copied from
 * EventLocationBlock.js, not imported — see businessLocation.js's header for
 * the isolation rationale. Three states:
 *   • Locked (no real access, gated): approximate map CIRCLE + area + a "book
 *     to unlock" CTA. Never the exact address.
 *   • Unlocked (staff/owner, OR a buyer with a confirmed booking — KIN-288
 *     added the latter): exact map PIN + venue + street address + Open in
 *     Maps.
 *   • Nothing (business never set a location): renders null.
 *
 * hasConfirmedBooking is what makes a buyer's "unlocked" state real as of
 * KIN-288: paymentWebhook.js's handleServiceBookingPayment writes
 * businesses/{bizId}/confirmedBuyers/{buyerUid} on payment confirmation, and
 * firestore.rules' businesses/{bizId}/private/{doc} read rule checks that doc
 * via exists() — so fetchPrivateLocation actually succeeds for a genuinely
 * confirmed buyer now, not just staff/owner.
 */
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import Icon from "./Icon";
import { APPROX_CIRCLE_RADIUS_M } from "../utils/businessLocation";
import { getServiceLocation } from "../services/businessLocationService";

const STATUS = { LOADING: "loading", LOCKED: "locked", UNLOCKED: "unlocked" };

export default function ServiceLocationBlock({ business, bizId, hasConfirmedBooking, onReserve }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);

  const id = bizId || business?.id;
  // No synchronous initializer — same reasoning as EventLocationBlock: this
  // component derives no state of its own from a possibly-still-resolving
  // hasConfirmedBooking prop.
  const [resolved, setResolved] = useState(null);

  useEffect(() => {
    let alive = true;
    setResolved(null);
    getServiceLocation(business, { bizId: id, hasConfirmedBooking }).then((r) => {
      if (alive && r) setResolved(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hasConfirmedBooking]);

  if (resolved !== null && !resolved.hasLocation) return null;

  const status =
    resolved === null ? STATUS.LOADING : resolved.exact ? STATUS.UNLOCKED : STATUS.LOCKED;

  if (status === STATUS.LOADING) {
    return (
      <View
        style={styles.wrap}
        accessible
        accessibilityLabel={t("serviceLocation.loading")}
      >
        <View style={[styles.skeletonMap, { backgroundColor: colors.sunken, borderColor: colors.borderStrong }]} />
        <View style={[styles.skeletonBox, { backgroundColor: colors.sunken, borderColor: colors.borderStrong }]}>
          <View style={[styles.skeletonLine, styles.skeletonLineShort, { backgroundColor: colors.border }]} />
          <View style={[styles.skeletonLine, { backgroundColor: colors.border }]} />
        </View>
      </View>
    );
  }

  const { area, venueName, address, coords } = resolved;

  const openMaps = () => {
    if (!coords && !address) return;
    const q = coords ? `${coords.latitude},${coords.longitude}` : address;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
  };

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
          {resolved.locked && (
            <View style={[styles.approxTag, { backgroundColor: colors.text }]}>
              <Text style={[styles.approxTagText, { color: colors.surface }]}>
                {t("serviceLocation.approxArea")}
              </Text>
            </View>
          )}
        </View>
      )}

      {status === STATUS.UNLOCKED ? (
        <View style={[styles.exactBox, { backgroundColor: `${colors.success}12`, borderColor: `${colors.success}44` }]}>
          <View style={styles.badgeRow}>
            <Icon name="check" size={13} color={colors.success} type="ui" />
            <Text style={[styles.unlockedBadge, { color: colors.success }]}>{t("serviceLocation.unlocked")}</Text>
          </View>
          <Text style={[styles.exactLabel, { color: colors.success }]}>{t("serviceLocation.exactLocation")}</Text>
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
            <Text style={[styles.lockedBadge, { color: colors.warning }]}>{t("serviceLocation.locked")}</Text>
          </View>
          <Text style={[styles.lockedArea, { color: colors.text }]}>{area || t("serviceLocation.approxArea")}</Text>
          <Text style={[styles.lockedHint, { color: colors.textTertiary }]}>{t("serviceLocation.approxNote")}</Text>
          {!!onReserve && (
            <TouchableOpacity style={[styles.reserveCta, { backgroundColor: colors.primary }]} onPress={onReserve} activeOpacity={0.9}>
              <Icon name="lock" size={15} color={colors.onPrimary} type="ui" />
              <Text style={[styles.reserveText, { color: colors.onPrimary }]}>{t("serviceLocation.reserveToUnlock")}</Text>
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
    exactBox: { borderWidth: 1, borderRadius: 14, padding: 16 },
    unlockedBadge: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
    exactLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 },
    venue: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
    address: { fontSize: 13.5, marginTop: 2, lineHeight: 19 },
    mapsLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
    mapsLinkText: { fontSize: 13.5, fontWeight: "800" },
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
