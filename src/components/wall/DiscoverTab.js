/**
 * Wall v2 · Descubre (P0 shell). The affinity-ranked discovery (people /
 * communities / events via computeAffinity + the freemium blur) lands in P1;
 * for now this is an HONEST placeholder — never fake suggestions.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../Icon";

export default function DiscoverTab() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Icon name="community" size={30} color="#7C3AED" />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{t("wall.discover.soonTitle")}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{t("wall.discover.soonBody")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  icon: {
    width: 68, height: 68, borderRadius: 22, backgroundColor: "#EDE4FC",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  title: { fontFamily: FONTS.display, fontSize: 19, textAlign: "center" },
  body: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
});
