import Icon from "../components/Icon";
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { checkInFromScan, subscribeCheckins } from "../services/checkinService";

export default function CheckInScannerScreen({ route, navigation }) {
  const { eventId: paramEventId, eventTitle: paramEventTitle } = route.params || {};
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState(null); // { ok, msg }
  const [count, setCount] = useState(0);
  // Opened standalone (from Manage) there's no event context, so the scan can't
  // be matched — pick a target event first (BUG 15), then scan the working path.
  const [target, setTarget] = useState(paramEventId ? { id: paramEventId, title: paramEventTitle } : null);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(!paramEventId);
  const styles = createStyles(colors);
  const eventId = target?.id;
  const eventTitle = target?.title;

  const loadHostEvents = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      const snap = await getDocs(query(collection(db, "events"), where("creatorId", "==", uid)));
      const now = Date.now();
      const rows = snap.docs
        .map((d) => ({ id: d.id, title: d.data().title || "Event", date: d.data().date }))
        .filter((e) => !e.date || new Date(e.date).getTime() >= now - 12 * 3600000)
        .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
      setEvents(rows);
    } catch (e) {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => { if (!target) loadHostEvents(); }, [target, loadHostEvents]);

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
        ? {
            ok: true,
            msg: r.already
              ? t("checkInScanner.alreadyCheckedIn", { name: r.name })
              : t("checkInScanner.justCheckedIn", { name: r.name }),
          }
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
        {t("checkInScanner.headerTitle", { count })}
      </Text>
      <View style={{ width: 28 }} />
    </View>
  );

  // No event chosen yet → pick which event to check people into (BUG 15).
  if (!target) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        {Header}
        <View style={{ flex: 1, paddingHorizontal: 24 }}>
          <Text style={[styles.pickTitle, { color: colors.text }]}>{t("checkInScanner.pickEventTitle")}</Text>
          <Text style={[styles.pickSub, { color: colors.textSecondary }]}>{t("checkInScanner.pickEventSub")}</Text>
          {loadingEvents ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : events.length === 0 ? (
            <Text style={[styles.pickSub, { color: colors.textTertiary, marginTop: 20 }]}>{t("checkInScanner.noEvents")}</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              {events.map((e) => (
                <TouchableOpacity key={e.id} style={[styles.eventRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setTarget({ id: e.id, title: e.title })}>
                  <Icon name="calendar" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={1}>{e.title}</Text>
                    {!!e.date && <Text style={[styles.eventDate, { color: colors.textTertiary }]}>{new Date(e.date).toLocaleString()}</Text>}
                  </View>
                  <Icon name="forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </GradientBackground>
    );
  }

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
            {t("checkInScanner.permTitle")}
          </Text>
          <Text style={[styles.permText, { color: colors.textSecondary }]}>
            {t("checkInScanner.permText")}
          </Text>
          <TouchableOpacity
            style={[styles.permBtn, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.permBtnText}>{t("checkInScanner.allowCamera")}</Text>
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
          {t("checkInScanner.hint")}
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
    pickTitle: { fontSize: 20, fontWeight: "700", marginTop: 8 },
    pickSub: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 16 },
    eventRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 10,
    },
    eventName: { fontSize: 15, fontWeight: "600" },
    eventDate: { fontSize: 12, marginTop: 2 },
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
