import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Sizes from '../constants/Sizes';
import Icon from './Icon';
import { useTheme } from '../contexts/ThemeContext';
import { FONTS, RADII } from '../constants/theme-tokens';
import { formatMXN } from '../utils/pricing';
import { coarseLocationLabel } from '../utils/eventLocation';
import { formatDate as fmtDate } from "../utils/formatDate";

export default function EventCard({ event, onPress }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);
  const formatDate = (dateString) =>
    fmtDate(new Date(dateString), {
      weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

  const spotsLeft = event.maxAttendees - event.currentAttendees;
  const isAlmostFull = spotsLeft <= 2;
  const isFree = event.price === 0;
  const loc = coarseLocationLabel(event); // F2: area for gated events, never the venue

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {/* Compatibility badge — only when a real, explainable fit is provided */}
      {event.matchLabel ? (
        <View style={[styles.badge, { backgroundColor: event.matchStrong ? colors.successBg : colors.warnSoft }]}>
          <Text style={[styles.badgeText, { color: event.matchStrong ? colors.success : colors.warning }]}>
            {event.matchLabel}
          </Text>
        </View>
      ) : null}

      {/* Event Info */}
      <View style={styles.header}>
        <Text style={styles.hostAvatar}>{event.hostAvatar}</Text>
        <View style={styles.headerInfo}>
          <Text style={styles.category}>{event.category}</Text>
          <Text style={styles.hostName}>{t("eventCard.hostedBy", { name: event.hostName })}</Text>
        </View>
      </View>

      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.description} numberOfLines={2}>
        {event.description}
      </Text>

      {/* Details */}
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Icon
            name="calendar"
            size={13}
            color={colors.textSecondary}
            style={styles.detailIcon}
          />
          <Text style={styles.detailText}>{formatDate(event.date)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Icon
            name="location"
            size={13}
            color={colors.textSecondary}
            style={styles.detailIcon}
          />
          <Text style={styles.detailText}>
            {loc.label || (loc.gated ? t("eventLocation.approxArea") : "")}
          </Text>
          {loc.gated && (
            <Icon name="lock" size={11} color={colors.textTertiary} style={{ marginLeft: 4 }} />
          )}
        </View>

        <View style={styles.detailRow}>
          <Icon
            name="clock"
            size={13}
            color={colors.textSecondary}
            style={styles.detailIcon}
          />
          <Text style={styles.detailText}>{event.duration}</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.spots}>
          <Text style={[styles.spotsText, isAlmostFull && styles.spotsWarning]}>
            {t("eventCard.spotsLeft", { count: spotsLeft })}
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(event.currentAttendees / event.maxAttendees) * 100}%` }
              ]}
            />
          </View>
        </View>

        <View style={styles.price}>
          {isFree ? (
            <Text style={styles.freeText}>{t("eventCard.free")}</Text>
          ) : (
            <Text style={styles.priceText}>{formatMXN(event.price)}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADII.card,
      padding: Sizes.padding,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      // Flat card per CLAUDE.md §3: border only, no shadow.
    },
    badge: {
      position: 'absolute',
      top: 12,
      right: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    badgeText: {
      fontFamily: FONTS.bodyBold,
      fontSize: 11,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    hostAvatar: {
      fontSize: 32,
      marginRight: 12,
    },
    headerInfo: {
      flex: 1,
    },
    category: {
      fontFamily: FONTS.bodySemibold,
      fontSize: 12,
      color: colors.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    hostName: {
      fontFamily: FONTS.body,
      fontSize: Sizes.fontSize.small,
      color: colors.textSecondary,
    },
    title: {
      fontFamily: FONTS.display,
      fontSize: Sizes.fontSize.large,
      color: colors.text,
      marginBottom: 8,
    },
    description: {
      fontFamily: FONTS.body,
      fontSize: Sizes.fontSize.small,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: 12,
    },
    details: {
      marginBottom: 12,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    detailIcon: {
      marginRight: 8,
    },
    detailText: {
      fontFamily: FONTS.body,
      fontSize: Sizes.fontSize.small,
      color: colors.text,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    spots: {
      flex: 1,
    },
    spotsText: {
      fontFamily: FONTS.body,
      fontSize: Sizes.fontSize.small,
      color: colors.text,
      marginBottom: 4,
    },
    spotsWarning: {
      color: colors.error,
      fontFamily: FONTS.bodySemibold,
    },
    progressBar: {
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      overflow: 'hidden',
      width: 100,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
    },
    price: {
      marginLeft: 16,
    },
    freeText: {
      fontFamily: FONTS.bodyBold,
      fontSize: Sizes.fontSize.medium,
      color: colors.accent,
    },
    priceText: {
      fontFamily: FONTS.display,
      fontSize: Sizes.fontSize.large,
      color: colors.text,
    },
  });
}
