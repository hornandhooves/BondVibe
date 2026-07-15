import Icon from "../components/Icon";
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { getMyFleet } from "../services/rentalService";
import { formatCentavos } from "../utils/pricing";
import useUserRole from "../hooks/useUserRole";
import { isApprovedHost } from "../utils/hostGate";
import BecomeHostGate from "../components/BecomeHostGate";

export default function MyFleetScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { role, hostApproved, loading: roleLoading } = useUserRole();
  const approved = isApprovedHost({ role, hostApproved });
  const STATUS_META = {
    available: { label: t("rentals.status.available"), color: "#34C759" },
    rented: { label: t("rentals.status.rented"), color: "#B45309" },
    maintenance: { label: t("rentals.status.maintenance"), color: "#8a8f9c" },
  };
  const [fleet, setFleet] = useState([]);
  const [payoutsReady, setPayoutsReady] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [list, userSnap] = await Promise.all([
      getMyFleet(),
      auth.currentUser ? getDoc(doc(db, "users", auth.currentUser.uid)) : Promise.resolve(null),
    ]);
    setFleet(list);
    const sc = userSnap && userSnap.exists() ? userSnap.data().stripeConnect : null;
    setPayoutsReady(!!(sc && (sc.chargesEnabled || sc.payoutsEnabled)));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const styles = createStyles(colors, isDark);

  // P0 unified-host gate: publishing/managing a fleet requires an approved host.
  // An event-approved host passes straight through (isApprovedHost). The server
  // firestore.rules enforce the same on vehicle create — this is the UX layer.
  if (!roleLoading && !approved) {
    return (
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        <BecomeHostGate
          navigation={navigation}
          onBack={() => navigation.goBack()}
          title={t("rentals.host.becomeTitle")}
          body={t("rentals.host.becomeBody")}
          ctaLabel={t("rentals.host.becomeCta")}
          note={t("rentals.host.alreadyHost")}
        />
      </>
    );
  }

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("rentals.fleet.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading || roleLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {t("rentals.fleet.intro")}
          </Text>

          {!payoutsReady && (
            <TouchableOpacity
              style={[styles.payoutCard, { borderColor: colors.warning }]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("StripeConnect")}
            >
              <Icon name="alert" size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.payoutTitle, { color: colors.text }]}>{t("rentals.fleet.setUpPayouts")}</Text>
                <Text style={[styles.payoutText, { color: colors.textSecondary }]}>
                  {t("rentals.fleet.setUpPayoutsText")}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.publishBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("PublishVehicle", {})}
          >
            <Text style={styles.publishTxt}>{t("rentals.fleet.publishVehicle")}</Text>
          </TouchableOpacity>

          {fleet.length > 0 && (
            <TouchableOpacity
              style={[styles.bookingsBtn, { borderColor: colors.border }]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("VehicleBookings")}
            >
              <Text style={[styles.bookingsTxt, { color: colors.text }]}>
                {t("rentals.fleet.viewBookings")}
              </Text>
            </TouchableOpacity>
          )}

          {fleet.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyArt}>
                <Icon name="bike" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("rentals.fleet.emptyTitle")}</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t("rentals.fleet.emptyText")}
              </Text>
            </View>
          ) : (
            fleet.map((v) => {
              const meta = STATUS_META[v.status] || STATUS_META.available;
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.card, { borderColor: colors.border }]}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate("PublishVehicle", { vehicleId: v.id })}
                >
                  <View style={styles.thumb}>
                    {v.photos[0] ? (
                      <Image source={{ uri: v.photos[0] }} style={styles.thumbImg} />
                    ) : (
                      <Text style={[styles.thumbPlaceholder, { color: colors.textTertiary }]}>{t("rentals.fleet.noPhoto")}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{v.title}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                      {v.pricePerDayCentavos ? `${formatCentavos(v.pricePerDayCentavos)} ${t("rentals.common.perDay")}` : t("rentals.common.free")}
                    </Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: `${meta.color}22`, borderColor: `${meta.color}55` }]}>
                    <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12,
    },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingTop: 8 },
    intro: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
    payoutCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 16,
    },
    payoutTitle: { fontSize: 15, fontWeight: "800" },
    payoutText: { fontSize: 12, marginTop: 2, lineHeight: 16 },
    publishBtn: { borderRadius: 26, paddingVertical: 15, alignItems: "center", marginBottom: 12 },
    publishTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
    bookingsBtn: { borderRadius: 26, borderWidth: 1, paddingVertical: 14, alignItems: "center", marginBottom: 20 },
    bookingsTxt: { fontSize: 15, fontWeight: "700" },
    card: {
      flexDirection: "row", alignItems: "center", gap: 14,
      borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12,
    },
    thumb: {
      width: 52, height: 52, borderRadius: 10, overflow: "hidden",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
      alignItems: "center", justifyContent: "center",
    },
    thumbImg: { width: 52, height: 52 },
    thumbPlaceholder: { fontSize: 9, fontWeight: "600" },
    title: { fontSize: 16, fontWeight: "800" },
    meta: { fontSize: 13, marginTop: 2 },
    pill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
    pillText: { fontSize: 11, fontWeight: "800" },
    empty: { alignItems: "center", paddingTop: 40, paddingHorizontal: 30 },
    emptyArt: {
      width: 64,
      height: 64,
      borderRadius: 18,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  });
}
