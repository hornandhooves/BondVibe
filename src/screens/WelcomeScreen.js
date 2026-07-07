import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from "react-i18next";
import GradientBackground from "../components/GradientBackground";
import BondVibeLogo from "../components/BondVibeLogo";
import BondMark from "../components/BondMark";
import Icon from "../components/Icon";
import LanguagePill from "../components/LanguagePill";

export default function WelcomeScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Language pill — top-right, pre-filled from device locale */}
      <View style={styles.topBar}>
        <LanguagePill />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Logo/Hero */}
        <View style={styles.heroSection}>
          <View style={styles.heroLogo}>
            <BondVibeLogo size={96} variant="withBackground" />
          </View>
          <Text style={[styles.appName, { color: colors.text }]}>Kinlo</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            {t("welcome.tagline")}
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <View style={styles.feature}>
            <View style={styles.featureIconTile}>
              <Icon name="users" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.featureText, { color: colors.text }]}>
              {t("welcome.groupEvents")}
            </Text>
          </View>
          <View style={styles.feature}>
            <View style={styles.featureIconTile}>
              <BondMark size={22} />
            </View>
            <Text style={[styles.featureText, { color: colors.text }]}>
              {t("welcome.personalityMatching")}
            </Text>
          </View>
          <View style={styles.feature}>
            <View style={styles.featureIconTile}>
              <Icon name="privacy" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.featureText, { color: colors.text }]}>
              {t("welcome.safeAndInclusive")}
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Signup')}
        >
          <View style={[styles.primaryGlass, {
            backgroundColor: `${colors.primary}33`,
            borderColor: `${colors.primary}66`
          }]}>
            <Text style={[styles.primaryButtonText, { color: colors.primary }]}>
              {t("welcome.getStarted")}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Login')}
        >
          <View style={[styles.secondaryGlass, {
            backgroundColor: colors.surfaceGlass,
            borderColor: colors.border
          }]}>
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              {t("welcome.haveAccount")}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    topBar: {
      flexDirection: "row",
      justifyContent: "flex-end",
      paddingHorizontal: 20,
      paddingTop: 60,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    heroSection: {
      alignItems: 'center',
      marginBottom: 60,
    },
    heroLogo: {
      marginBottom: 24,
    },
    appName: {
      fontSize: 48,
      fontWeight: '700',
      marginBottom: 12,
      letterSpacing: -1,
    },
    tagline: {
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 24,
    },
    featuresSection: {
      gap: 20,
    },
    feature: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    featureIconTile: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureText: {
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    actions: {
      paddingHorizontal: 32,
      paddingBottom: 50,
      gap: 12,
    },
    primaryButton: {
      borderRadius: 16,
      overflow: 'hidden',
    },
    primaryGlass: {
      borderWidth: 1,
      paddingVertical: 18,
      alignItems: 'center',
    },
    primaryButtonText: {
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    secondaryButton: {
      borderRadius: 16,
      overflow: 'hidden',
    },
    secondaryGlass: {
      borderWidth: 1,
      paddingVertical: 18,
      alignItems: 'center',
    },
    secondaryButtonText: {
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
  });
}
