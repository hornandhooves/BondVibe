/**
 * E4 — Kinlo Plus activated. Success screen after upgrading. Returns to matching.
 */
import React from "react";
import Icon from "../../components/Icon";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { PrimaryButton } from "./matchUi";

export default function PlusActivatedScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <Icon name="successCircle" size={72} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>{t("matching.plusActivated.title")}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t("matching.plusActivated.subtitle")}
        </Text>
      </View>
      <View style={styles.footer}>
        <PrimaryButton label={t("matching.plusActivated.backToMatching")} onPress={() => navigation.popToTop()} />
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
    title: { fontSize: 26, fontWeight: "800", marginTop: 20, letterSpacing: -0.3 },
    subtitle: { fontSize: 15, textAlign: "center", lineHeight: 22, marginTop: 12 },
    footer: { paddingHorizontal: 24, paddingBottom: 28 },
  });
}
