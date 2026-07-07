/**
 * PaywallSheet — bottom sheet paywall (§3.6): hero, benefit checklist, price
 * row, primary CTA, "Maybe later". Variants: 'pro' | 'plus'.
 * P0 ships the reusable shell; ProUpsell/PlusPaywall adopt it during P2 polish.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import ProBadge from "./ProBadge";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII, BRAND, ELEVATION } from "../constants/theme-tokens";

export default function PaywallSheet({
  visible,
  variant = "pro", // 'pro' | 'plus'
  title,
  subtitle,
  benefits = [], // string[]
  priceLine,
  ctaLabel,
  onContinue,
  onClose,
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const productName = variant === "plus" ? "Kinlo Plus" : "Kinlo Pro";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <ScrollView bounces={false} contentContainerStyle={styles.content}>
            <ProBadge tier={variant} />
            <Text style={[TYPE.display, { color: colors.text }]}>
              {title || productName}
            </Text>
            {subtitle ? (
              <Text style={[TYPE.body, { color: colors.textSecondary }]}>{subtitle}</Text>
            ) : null}

            <View style={styles.benefits}>
              {benefits.map((b) => (
                <View key={b} style={styles.benefitRow}>
                  <Icon name="check" size={16} color={colors.success} />
                  <Text style={[TYPE.body, styles.benefitText, { color: colors.text }]}>
                    {b}
                  </Text>
                </View>
              ))}
            </View>

            {priceLine ? (
              <Text style={[TYPE.title, { color: colors.text }]}>{priceLine}</Text>
            ) : null}

            <TouchableOpacity onPress={onContinue} activeOpacity={0.85}>
              <LinearGradient
                colors={BRAND.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.cta, ELEVATION.floatingBrand]}
              >
                <Text style={[TYPE.label, styles.ctaText]}>
                  {ctaLabel || t("paywallSheet.continueWith", { productName })}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={styles.later}>
              <Text style={[TYPE.label, { color: colors.textTertiary }]}>{t("paywallSheet.maybeLater")}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  backdropTouch: { flex: 1 },
  sheet: {
    borderTopLeftRadius: RADII.sheet,
    borderTopRightRadius: RADII.sheet,
    maxHeight: "85%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: RADII.pill,
    marginTop: SPACING.sm,
  },
  content: { padding: SPACING.xxl, gap: SPACING.md },
  benefits: { gap: SPACING.sm, marginVertical: SPACING.sm },
  benefitRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  benefitText: { flex: 1 },
  cta: {
    height: 54,
    borderRadius: RADII.button,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: "#FFFFFF", fontSize: 16 },
  later: { alignItems: "center", paddingVertical: SPACING.sm },
});
