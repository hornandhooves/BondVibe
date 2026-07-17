import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { doc, updateDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import Icon from "../components/Icon";

/**
 * "Your community is live" — where a free host lands, immediately.
 *
 * This screen replaces a wait. Hosting used to switch on only after an admin got
 * around to approving, with nothing shown in between, so the moment of highest
 * intent was spent on an invisible queue. Free hosting is now instant, and this
 * is the momentum: three things worth doing in the next minute, not a receipt.
 *
 * Each quick win routes to a screen that already exists — nothing here is a
 * placeholder, because a dead link would undo the point of it.
 */
export default function HostLiveScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [leaving, setLeaving] = useState(false);

  /**
   * Mark the welcome as seen so the router stops sending them back here, then
   * continue. Deliberately fire-and-forget on failure: this is a UI bookmark,
   * and the worst case is seeing a welcome screen twice — never a blocked host.
   * It's a top-level field, not hostConfig, because hostConfig is server-owned
   * now (the rules reject client writes to it).
   */
  const go = async (routeName, params) => {
    if (leaving) return;
    setLeaving(true);
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        hostWelcomeSeen: true,
      });
    } catch (e) {
      console.warn("hostWelcomeSeen not saved:", e?.message);
    }
    if (routeName) navigation.replace(routeName, params);
    else navigation.replace("MainTabs", { screen: "HomeTab" });
  };

  const wins = [
    {
      key: "createEvent",
      icon: "plus",
      onPress: () => go("CreateEvent"),
    },
    {
      key: "invite",
      icon: "users",
      onPress: () => go("HostGroups"),
    },
    {
      key: "personalize",
      icon: "settings",
      // The profile hub — there's no dedicated edit screen, and ProfileSetup is
      // the onboarding one. Better a real destination than an invented route.
      onPress: () => go("Profile"),
    },
  ];

  const s = createStyles(colors);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.mark, { backgroundColor: colors.successBg }]}>
          <Icon name="check" size={34} color={colors.success} />
        </View>

        <Text style={[s.title, { color: colors.text }]}>{t("hostLive.title")}</Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          {t("hostLive.subtitle")}
        </Text>

        <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
          {t("hostLive.getStarted")}
        </Text>

        {wins.map((w) => (
          <TouchableOpacity
            key={w.key}
            onPress={w.onPress}
            disabled={leaving}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={[
              s.row,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: leaving ? 0.6 : 1,
              },
            ]}
          >
            <View style={[s.rowIcon, { backgroundColor: colors.brandSoft }]}>
              <Icon name={w.icon} size={20} color={colors.primary} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowTitle, { color: colors.text }]}>
                {t(`hostLive.${w.key}Title`)}
              </Text>
              <Text style={[s.rowSub, { color: colors.textSecondary }]}>
                {t(`hostLive.${w.key}Sub`)}
              </Text>
            </View>
            <Icon name="forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          onPress={() => go(null)}
          disabled={leaving}
          style={s.skip}
          activeOpacity={0.7}
        >
          <Text style={[s.skipText, { color: colors.textSecondary }]}>
            {t("hostLive.explore")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20 },
    mark: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    title: {
      fontFamily: FONTS.display,
      fontSize: 28,
      letterSpacing: -0.7,
      textAlign: "center",
      marginBottom: 10,
    },
    subtitle: {
      fontFamily: FONTS.body,
      fontSize: 14.5,
      lineHeight: 21,
      textAlign: "center",
      marginBottom: 32,
      paddingHorizontal: 10,
    },
    sectionLabel: {
      fontFamily: FONTS.bodyBold,
      fontSize: 11.5,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      marginBottom: 12,
    },
    // Flat cards: 1px border, no shadow (design system §3).
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: { flex: 1 },
    rowTitle: { fontFamily: FONTS.display, fontSize: 15.5, letterSpacing: -0.2 },
    rowSub: { fontFamily: FONTS.body, fontSize: 12.5, marginTop: 2 },
    skip: { alignItems: "center", paddingVertical: 22 },
    skipText: { fontFamily: FONTS.bodySemibold, fontSize: 14 },
  });
}
