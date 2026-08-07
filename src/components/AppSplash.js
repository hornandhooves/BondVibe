import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import { WARMTH, AURORA, FONTS, WORDMARK_FONT } from "../constants/theme-tokens";

/**
 * JS-rendered loading screen shown while fonts (and other startup work) load
 * — replaces the old flat-purple splash. Mounted by App.js in place of the
 * `if (!fontsLoaded) return null` gate, so it renders before ThemeProvider
 * exists yet; it reads the system color scheme directly instead.
 *
 * The native (pre-JS) splash frame is still a static image — this component
 * is what makes the logo actually pulse, which a native splash can't do.
 */
export default function AppSplash() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? AURORA : WARMTH;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.08,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.88,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale, opacity]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.Image
        source={require("../../assets/kinlo-logo-icon.png")}
        style={[styles.logo, { transform: [{ scale }], opacity }]}
        resizeMode="contain"
      />
      <Text style={[styles.wordmark, { color: colors.text }]}>KINLO</Text>
      <Text style={[styles.tagline, { color: colors.textSecondary }]}>
        {t("welcome.tagline")}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 20,
  },
  wordmark: {
    fontFamily: WORDMARK_FONT,
    fontSize: 26,
    letterSpacing: 2,
    marginBottom: 6,
  },
  tagline: {
    fontFamily: FONTS.body,
    fontSize: 14,
  },
});
