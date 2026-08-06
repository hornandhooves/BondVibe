import React from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from "react-i18next";
import { FONTS, WORDMARK_FONT } from '../constants/theme-tokens';

// PIXEL-FIDELITY SPEC: coral sampled from the Kinlo mark's terracotta petal
// (assets/kinlo-logo-icon.png) — not a theme token, this screen is a fixed
// photo hero and doesn't adapt to light/dark theme.
const CORAL = '#C86D4A';
// 07/Buttons spec: Pressed = a darker shade of the default fill (~20% darker),
// same pattern as the design system's dark-green primary button.
const CORAL_PRESSED = '#A0573B';

export default function WelcomeScreen({ navigation }) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ImageBackground
        source={require('../../assets/welcome-page-ui-mobile.png')}
        style={styles.background}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(8,6,5,0.05)', 'rgba(8,6,5,0.35)', 'rgba(6,5,4,0.94)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.content}>
          {/* Hero mark */}
          <View style={styles.heroSection}>
            <Image
              source={require('../../assets/kinlo-logo-icon-white.png')}
              style={styles.logoMark}
              resizeMode="contain"
            />
            <Text style={styles.wordmark}>KINLO</Text>
          </View>

          {/* Copy + actions */}
          <View style={styles.bottomSection}>
            <Text style={styles.headline}>{t("welcome.headline")}</Text>
            <Text style={styles.subtitle}>{t("welcome.subtitle")}</Text>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
              onPress={() => navigation.navigate('Signup')}
            >
              <Text style={styles.primaryButtonText}>{t("welcome.getStarted")}</Text>
            </Pressable>

            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
              style={styles.loginRow}
            >
              <Text style={styles.loginText}>
                {t("welcome.haveAccountPrompt")}{' '}
                <Text style={styles.loginLink}>{t("welcome.login")}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 140,
  },
  logoMark: {
    width: 88,
    height: 88,
    marginBottom: 16,
  },
  wordmark: {
    fontFamily: WORDMARK_FONT,
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: 6,
    // RN's <Text> has no native stroke — approximated with a soft dark halo
    // in place of the spec's 1pt stroke, for legibility over the photo.
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1,
  },
  bottomSection: {
    // Mobile Grid spec: 390×844 screen, margin 16px.
    paddingHorizontal: 16,
    paddingBottom: 50,
  },
  headline: {
    fontFamily: FONTS.heroSerif,
    fontSize: 30,
    lineHeight: 36,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: FONTS.heroSans,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.78)',
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: CORAL,
    // 07/Buttons spec, LG size (primary CTA): height 48, radius 12 — the
    // per-component button chart, more specific than the general Corner
    // Radius overview (which lists a generic Button:16).
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonPressed: {
    backgroundColor: CORAL_PRESSED,
  },
  primaryButtonText: {
    fontFamily: FONTS.heroSansBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  loginRow: {
    alignItems: 'center',
    marginTop: 18,
  },
  loginText: {
    fontFamily: FONTS.heroSans,
    fontSize: 12,
    color: 'rgba(255,255,255,0.78)',
  },
  loginLink: {
    fontFamily: FONTS.heroSansBold,
    color: '#FFFFFF',
  },
});
