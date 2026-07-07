/**
 * Reusable primitives the UX audit asked for: AttendeeRow, PaymentPill,
 * HostBadge, RSVPButton, CommunityHeader. Built on the theme tokens so both the
 * warm attendee UI and the denser host dashboards share one system.
 */
import React from "react";
import Icon from "./Icon";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { AvatarDisplay } from "./AvatarPicker";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

// Keyed on a stable, non-translated status kind — never on the displayed label,
// which may already be translated by the caller (see EventRosterScreen).
const PAYMENT_TONES = {
  paid: "#34C759",
  membership: "#7C3AED",
  free: "#8A8398",
  pending: "#FF9F0A",
};

/** Small pill for a payment state (Paid / Pending / Membership / Free). */
export function PaymentPill({ status, kind }) {
  const tone = PAYMENT_TONES[kind] || PAYMENT_TONES[String(status).toLowerCase()] || "#8A8398";
  return (
    <View style={[styles.pill, { backgroundColor: `${tone}22`, borderColor: `${tone}55` }]}>
      <Text style={[styles.pillText, { color: tone }]}>{status}</Text>
    </View>
  );
}

/** Verified-host badge. */
export function HostBadge({ small }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.hostBadge, { backgroundColor: `${colors.secondary || "#1F8A6E"}22` }]}>
      <Icon name="privacy" size={small ? 12 : 14} color={colors.secondary || "#1F8A6E"} />
      <Text style={[styles.hostBadgeText, { color: colors.secondary || "#1F8A6E", fontSize: small ? 11 : 12 }]}>
        {t("primitives.verifiedHost")}
      </Text>
    </View>
  );
}

/** A row for an attendee with avatar, name, optional payment pill + status. */
export function AttendeeRow({ name, avatar, subtitle, status, statusColor, right }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <AvatarDisplay avatar={normAvatar(avatar)} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        {!!subtitle && (
          <Text style={[styles.sub, { color: colors.textTertiary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      {!!status && (
        <Text style={[styles.status, { color: statusColor || colors.textSecondary }]}>
          {status}
        </Text>
      )}
    </View>
  );
}

/** One-tap RSVP / join button. */
export function RSVPButton({ label = "RSVP", onPress, disabled, loading }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.rsvp, { backgroundColor: colors.primary, opacity: disabled || loading ? 0.5 : 1 }]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      <Text style={styles.rsvpText}>{loading ? "…" : label}</Text>
    </TouchableOpacity>
  );
}

/** Header for a persistent community/group. */
export function CommunityHeader({ name, subtitle, avatar, onPress }) {
  const { colors } = useTheme();
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={styles.community} onPress={onPress} activeOpacity={0.85}>
      <AvatarDisplay avatar={normAvatar(avatar)} size={48} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.communityName, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        {!!subtitle && (
          <Text style={[styles.communitySub, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {onPress && <Icon name="forward" size={20} color={colors.textTertiary} />}
    </Wrap>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 11, fontWeight: "800" },
  hostBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  hostBadgeText: { fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  name: { fontSize: 15, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 2 },
  status: { fontSize: 13, fontWeight: "700" },
  rsvp: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rsvpText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  community: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  communityName: { fontSize: 18, fontWeight: "800" },
  communitySub: { fontSize: 13, marginTop: 2 },
});
