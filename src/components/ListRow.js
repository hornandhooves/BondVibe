/**
 * ListRow — the grouped-settings row (§3.6): 36px lead icon tile (brandSoft),
 * title + optional subtitle, right slot (chevron by default), hairline divider.
 * Height ≈56. Used in Settings, Manage, Inbox, memberships.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Icon from "./Icon";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII, FONTS } from "../constants/theme-tokens";

export default function ListRow({
  icon,
  iconColor,
  iconBg, // optional tile background (defaults to brandSoft)
  title,
  titleBadge, // optional small chip after the title (e.g. NEW / CRM)
  subtitle,
  onPress,
  right, // custom right slot; default = chevron
  showChevron = true,
  divider = true,
  destructive = false,
  disabled = false,
  testID,
}) {
  const { colors } = useTheme();
  const titleColor = destructive ? colors.error : colors.text;

  return (
    <View testID={testID}>
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        disabled={disabled || !onPress}
        activeOpacity={0.7}
      >
        {icon ? (
          <View style={[styles.iconTile, { backgroundColor: iconBg || colors.brandSoft }]}>
            <Icon name={icon} size={18} color={iconColor || colors.primary} />
          </View>
        ) : null}
        <View style={styles.textWrap}>
          <View style={styles.titleRow}>
            <Text style={[TYPE.bodySemibold, { color: titleColor }]} numberOfLines={1}>
              {title}
            </Text>
            {titleBadge ? (
              <View style={[styles.badge, { backgroundColor: `${colors.primary}1A` }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{titleBadge}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text style={[TYPE.caption, { color: colors.textTertiary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right !== undefined
          ? right
          : showChevron && onPress && (
              <Icon name="forward" size={18} color={colors.textTertiary} />
            )}
      </TouchableOpacity>
      {divider && (
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    minHeight: 56,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: RADII.tile - 2,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: { flex: 1, gap: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  badgeText: { fontFamily: FONTS.bodyExtra, fontSize: 10, letterSpacing: 0.3, textTransform: "uppercase" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
});
