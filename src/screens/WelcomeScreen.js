import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../contexts/ThemeContext';
import GradientBackground from "../components/GradientBackground";

export default function WelcomeScreen({ navigation }) {
  const { colors, isDark } = useTheme();

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      
      {/* Content */}
      <View style={styles.content}>
        {/* Logo/Hero */}
        <View style={styles.heroSection}>
          <Text style={styles.heroEmoji}>🎉</Text>
          <Text style={[styles.appName, { color: colors.text }]}>Kinlo</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            Connect through shared experiences
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>👥</Text>
            <Text style={[styles.featureText, { color: colors.text }]}>
              Group Events
            </Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>✨</Text>
            <Text style={[styles.featureText, { color: colors.text }]}>
              Personality Matching
            </Text>
          </View>
          <View style={styles.feature}>
            <Text style={styles.featureIcon}>🔒</Text>
            <Text style={[styles.featureText, { color: colors.text }]}>
              Safe & Inclusive
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
              Get Started
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
              I have an account
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
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    heroSection: {
      alignItems: 'center',
      marginBottom: 60,
    },
    heroEmoji: {
      fontSize: 80,
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
    featureIcon: {
      fontSize: 32,
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
