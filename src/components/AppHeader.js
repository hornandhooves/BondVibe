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
import { useTheme } from "../contexts/ThemeContext";
import { useMode } from "../contexts/ModeContext";
import useUserRole from "../hooks/useUserRole";
import { useInboxBadges } from "../hooks/useInboxBadge";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";

export default function AppHeader({ title, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useMode();
  const { isHost } = useUserRole();
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

      {isHost && (
        <View style={[styles.toggle, { backgroundColor: colors.sunken, borderColor: colors.border }]}>
          {["attending", "hosting"].map((m) => {
            const active = mode === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={[styles.toggleSeg, active && { backgroundColor: colors.surface }]}
                testID={`mode-${m}`}
              >
                <Text
                  style={[
                    TYPE.caption,
                    styles.toggleText,
                    { color: active ? colors.primary : colors.textTertiary },
                  ]}
                >
                  {m === "attending" ? t("navigation.attending") : t("navigation.hosting")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

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
  toggle: {
    flexDirection: "row",
    borderRadius: RADII.pill,
    borderWidth: 1,
    padding: 2,
  },
  toggleSeg: {
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
  },
  toggleText: { fontSize: 12 },
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
