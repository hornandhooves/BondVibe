import Icon from "../components/Icon";
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { checkInFromScan, subscribeCheckins } from "../services/checkinService";

export default function CheckInScannerScreen({ route, navigation }) {
  const { eventId, eventTitle } = route.params || {};
  const { colors, isDark } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState(null); // { ok, msg }
  const [count, setCount] = useState(0);
  const styles = createStyles(colors);

  useEffect(() => {
    if (!eventId) return;
    const unsub = subscribeCheckins(eventId, (list) => setCount(list.length));
    return () => unsub();
  }, [eventId]);

  const onScanned = async ({ data }) => {
    if (!scanning) return;
    setScanning(false);
    const r = await checkInFromScan(eventId, data);
    setResult(
      r.success
        ? { ok: true, msg: r.already ? `${r.name} already checked in` : `${r.name} checked in` }
        : { ok: false, msg: r.error }
    );
    setTimeout(() => {
      setResult(null);
      setScanning(true);
    }, 2200);
  };

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Icon name="back" size={26} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
        Check-in · {count}
      </Text>
      <View style={{ width: 28 }} />
    </View>
  );

  if (!permission) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        {Header}
      </GradientBackground>
    );
  }

  if (!permission.granted) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        {Header}
        <View style={styles.center}>
          <Text style={[styles.permTitle, { color: colors.text }]}>
            We need the camera
          </Text>
          <Text style={[styles.permText, { color: colors.textSecondary }]}>
            To scan your attendees' QR codes and check them in.
          </Text>
          <TouchableOpacity
            style={[styles.permBtn, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.permBtnText}>Allow camera</Text>
          </TouchableOpacity>
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <StatusBar style="light" />
      {Header}
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanning ? onScanned : undefined}
        />
        <View style={styles.reticle} pointerEvents="none" />
        <Text style={styles.hint}>
          Point at your attendee's QR code
        </Text>
        {eventTitle ? <Text style={styles.eventLabel}>{eventTitle}</Text> : null}
        {result && (
          <View
            style={[
              styles.resultBanner,
              { backgroundColor: result.ok ? colors.success : colors.error },
            ]}
          >
            <Text style={styles.resultText}>{result.msg}</Text>
          </View>
        )}
      </View>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
    permTitle: { fontSize: 20, fontWeight: "700" },
    permText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    permBtn: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8 },
    permBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    cameraWrap: {
      flex: 1,
      margin: 20,
      borderRadius: 24,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    reticle: {
      width: 220,
      height: 220,
      borderWidth: 3,
      borderColor: "#FFFFFF",
      borderRadius: 24,
      backgroundColor: "transparent",
    },
    hint: {
      position: "absolute",
      bottom: 70,
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "600",
      textAlign: "center",
      paddingHorizontal: 24,
    },
    eventLabel: {
      position: "absolute",
      top: 20,
      color: "rgba(255,255,255,0.9)",
      fontSize: 13,
      fontWeight: "600",
    },
    resultBanner: {
      position: "absolute",
      bottom: 110,
      paddingHorizontal: 22,
      paddingVertical: 14,
      borderRadius: 16,
      maxWidth: "85%",
    },
    resultText: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" },
  });
}
