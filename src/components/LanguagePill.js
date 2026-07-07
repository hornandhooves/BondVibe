/**
 * LanguagePill — compact globe pill showing the current language; tapping it
 * opens the LanguageSelector. Placed on Welcome + the auth header so a user can
 * switch before creating an account (kinlo_build/04_I18N_SPEC.md).
 */
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import Icon from "./Icon";
import LanguageSelector from "./LanguageSelector";
import { nativeName } from "../i18n/languages";

export default function LanguagePill({ style }) {
  const { colors } = useTheme();
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const styles = createStyles(colors);

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, style]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Icon name="globe" size={16} color={colors.textSecondary} type="ui" />
        <Text style={styles.label} numberOfLines={1}>
          {nativeName(i18n.language)}
        </Text>
        <Icon name="down" size={14} color={colors.textSecondary} type="ui" />
      </TouchableOpacity>
      <LanguageSelector visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      backgroundColor: colors.surfaceGlass,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    label: { fontSize: 14, fontWeight: "600", color: colors.text, maxWidth: 120 },
  });
}
