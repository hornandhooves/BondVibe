/**
 * AppHeader — persistent chrome on all 5 tab roots (§1.2/§1.3):
 * title · [Attending|Hosting] segmented toggle (hosts/admins only) ·
 * ✉ Messages (one icon; Notifications live inside Messages — BUG 13) with a
 * combined unread badge. Safe-area aware (works on iOS notch and Android
 * status bar — no magic paddingTop numbers).
 *
 * Mounted by the tab navigator (`header` option), so individual tab-root
 * screens no longer render their own top bars.
 */
import React, { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import { AvatarDisplay } from "./AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { useMode } from "../contexts/ModeContext";
import useUserRole from "../hooks/useUserRole";
import { useBusiness } from "../contexts/BusinessContext";
import { useInboxBadges } from "../hooks/useInboxBadge";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";

export default function AppHeader({ title, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { mode } = useMode();
  const { isHost, avatar, fullName } = useUserRole();
  // BUG 32.5: accepted staff of a business (non-host) can also enter the hosting
  // view — a business membership is a first-class way in, riding the owner's Pro.
  const { businesses } = useBusiness();
  const canHostView = isHost || businesses.length > 0;
  // One inbox icon (BUG 13): unread chats + notifications, combined.
  const { total: unread } = useInboxBadges();
  // Drive the native app-icon badge from the live unread total (spec 12, Fix B).
  useEffect(() => {
    Notifications.setBadgeCountAsync(unread).catch(() => {});
  }, [unread]);

  return (
    <View
      style={[
        styles.wrap,
        // Theme the safe-area/status-bar strip too (BUG 18) — a transparent
        // header revealed a white bar under the status bar in dark mode.
        { paddingTop: insets.top + SPACING.sm, backgroundColor: colors.background },
      ]}
    >
      <Text style={[TYPE.titleLg, styles.title, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>

      {/* T3: non-interactive mode tag (the toggle now lives in Profile). Shown
          only for host-capable users; a pure attendee is always "attending". */}
      {canHostView && (() => {
        const tint = mode === "hosting" ? colors.primary : colors.success;
        return (
          <View style={[styles.tag, { backgroundColor: tint + "1A" }]} testID={`mode-tag-${mode}`}>
            <View style={[styles.tagDot, { backgroundColor: tint }]} />
            <Text style={[TYPE.caption, styles.tagText, { color: tint }]}>
              {mode === "hosting" ? t("navigation.hosting") : t("navigation.attending")}
            </Text>
          </View>
        );
      })()}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => navigation.navigate("Inbox")}
          hitSlop={hit}
          testID="header-messages"
        >
          <Icon name="message" size={23} color={colors.text} />
          {unread > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.error, borderColor: colors.background }]}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Profile moved out of the tab bar (T1): its avatar lives here. */}
        <TouchableOpacity
          onPress={() => navigation.navigate("Profile")}
          hitSlop={hit}
          testID="header-profile"
        >
          <AvatarDisplay avatar={avatar} size={30} name={fullName} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.screen,
    paddingBottom: SPACING.sm,
  },
  title: { flex: 1 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
  },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
  tagText: { fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", gap: SPACING.lg },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
});
