/**
 * AppHeader — persistent chrome on all 5 tab roots (§1.2/§1.3):
 * title · [Attending|Hosting] segmented toggle (hosts/admins only) ·
 * ✉ Messages · 🔔 Notifications. Safe-area aware (works on iOS notch and
 * Android status bar — no magic paddingTop numbers).
 *
 * Mounted by the tab navigator (`header` option), so individual tab-root
 * screens no longer render their own top bars.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import { useTheme } from "../contexts/ThemeContext";
import { useMode } from "../contexts/ModeContext";
import useUserRole from "../hooks/useUserRole";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";

export default function AppHeader({ title, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useMode();
  const { isHost } = useUserRole();

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + SPACING.sm, backgroundColor: "transparent" },
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
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("Notifications")}
          hitSlop={hit}
          testID="header-notifications"
        >
          <Icon name="bell" size={23} color={colors.text} />
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
});
