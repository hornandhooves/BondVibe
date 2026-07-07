import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import GradientBackground from "../components/GradientBackground";

export default function EmailVerificationScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <GradientBackground>
      <Text style={[styles.text, { color: colors.text }]}>{t("auth.emailVerification.title")}</Text>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 20, fontWeight: '700' },
});
