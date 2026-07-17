import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Colors from '../constants/Colors';
import Sizes from '../constants/Sizes';
import Icon from './Icon';
import { useTheme } from '../contexts/ThemeContext';
import { formatMXN } from '../utils/pricing';
import { coarseLocationLabel } from '../utils/eventLocation';
import { formatDate as fmtDate } from "../utils/formatDate";

export default function EventCard({ event, onPress }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
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
        <View style={[styles.badge, { backgroundColor: event.matchStrong ? '#E8F5E9' : '#FFF9E6' }]}>
          <Text style={[styles.badgeText, { color: event.matchStrong ? Colors.success : '#F59E0B' }]}>
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Sizes.borderRadius,
    padding: Sizes.padding,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
    fontSize: 11,
    fontWeight: '700',
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
    fontSize: Sizes.fontSize.small,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: 2,
  },
  hostName: {
    fontSize: Sizes.fontSize.small,
    color: Colors.textLight,
  },
  title: {
    fontSize: Sizes.fontSize.large,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  description: {
    fontSize: Sizes.fontSize.small,
    color: Colors.textLight,
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
    fontSize: Sizes.fontSize.small,
    color: Colors.text,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  spots: {
    flex: 1,
  },
  spotsText: {
    fontSize: Sizes.fontSize.small,
    color: Colors.text,
    marginBottom: 4,
  },
  spotsWarning: {
    color: Colors.error,
    fontWeight: '600',
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    width: 100,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  price: {
    marginLeft: 16,
  },
  freeText: {
    fontSize: Sizes.fontSize.medium,
    fontWeight: 'bold',
    color: Colors.success,
  },
  priceText: {
    fontSize: Sizes.fontSize.large,
    fontWeight: 'bold',
    color: Colors.text,
  },
});
