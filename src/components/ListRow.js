/**
 * ListRow — the grouped-settings row (§3.6): 36px lead icon tile (brandSoft),
 * title + optional subtitle, right slot (chevron by default), hairline divider.
 * Height ≈56. Used in Settings, Manage, Inbox, memberships.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Icon from "./Icon";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";

export default function ListRow({
  icon,
  iconColor,
  title,
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
          <View style={[styles.iconTile, { backgroundColor: colors.brandSoft }]}>
            <Icon name={icon} size={18} color={iconColor || colors.primary} />
          </View>
        ) : null}
        <View style={styles.textWrap}>
          <Text style={[TYPE.bodySemibold, { color: titleColor }]} numberOfLines={1}>
            {title}
          </Text>
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
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
});
