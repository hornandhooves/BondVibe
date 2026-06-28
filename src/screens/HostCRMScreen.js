import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Share,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { usePremium } from "../hooks/usePremium";
import { getHostCRM, nudgeAttendee, crmToCSV } from "../services/crmService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

const SEGMENTS = [
  { id: "risk", label: "En riesgo" },
  { id: "recurring", label: "Recurrentes" },
  { id: "all", label: "Todos" },
];

export default function HostCRMScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { isPremium, loading: premiumLoading } = usePremium();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState("risk");
  const [hostName, setHostName] = useState("tu anfitrión");
  const [sent, setSent] = useState({});
  const styles = createStyles(colors, isDark);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const uid = auth.currentUser?.uid;
        const [list, me] = await Promise.all([
          getHostCRM(),
          uid ? getDoc(doc(db, "users", uid)) : Promise.resolve(null),
        ]);
        setRows(list);
        if (me?.exists()) setHostName(me.data().fullName || me.data().name || hostName);
        setLoading(false);
      })();
    }, [])
  );

  const filtered = rows.filter((r) =>
    segment === "all" ? true : segment === "risk" ? r.atRisk : r.recurring
  );
  const riskCount = rows.filter((r) => r.atRisk).length;

  const act = async (row, kind) => {
    await nudgeAttendee(row.id, hostName, kind);
    setSent((s) => ({ ...s, [row.id]: true }));
  };

  const exportCSV = async () => {
    if (rows.length === 0) return;
    try {
      await Share.share({ message: crmToCSV(rows) });
    } catch (e) {
      // cancelled
    }
  };

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={[styles.back, { color: colors.text }]}>←</Text>
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Asistentes</Text>
      <TouchableOpacity onPress={exportCSV}>
        <Text style={{ color: colors.primary, fontWeight: "700" }}>Export</Text>
      </TouchableOpacity>
    </View>
  );

  if (!premiumLoading && !isPremium) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        {Header}
        <View style={styles.center}>
          <Text style={[styles.upsellTitle, { color: colors.text }]}>CRM es Pro ✨</Text>
          <Text style={[styles.upsellText, { color: colors.textSecondary }]}>
            Conoce a tus asistentes recurrentes y reactiva a quienes se alejan.
          </Text>
          <TouchableOpacity
            style={[styles.upsellBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("BondVibePro")}
          >
            <Text style={styles.upsellBtnText}>Conocer BondVibe Pro</Text>
          </TouchableOpacity>
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      {Header}

      <View style={styles.segments}>
        {SEGMENTS.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => setSegment(s.id)}
            style={[
              styles.segment,
              {
                backgroundColor: segment === s.id ? colors.primary : colors.surface,
                borderColor: segment === s.id ? colors.primary : colors.borderStrong,
              },
            ]}
          >
            <Text
              style={{
                color: segment === s.id ? colors.onPrimary : colors.text,
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              {s.label}
              {s.id === "risk" && riskCount > 0 ? ` (${riskCount})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {segment === "risk"
                ? "Nadie en riesgo ahora mismo 🎉"
                : "Aún no hay asistentes en este segmento."}
            </Text>
          ) : (
            filtered.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <AvatarDisplay avatar={normAvatar(r.avatar)} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {r.eventsCount} evento{r.eventsCount === 1 ? "" : "s"}
                      {r.lastDate ? ` · último ${r.lastDate.toLocaleDateString()}` : ""}
                    </Text>
                  </View>
                </View>

                {(r.flags.inactive || r.flags.membershipExpiring) && (
                  <View style={styles.flags}>
                    {r.flags.inactive && (
                      <View style={[styles.flag, { backgroundColor: "#FF9F0A22", borderColor: "#FF9F0A" }]}>
                        <Text style={[styles.flagText, { color: "#FF9F0A" }]}>Rompió su racha</Text>
                      </View>
                    )}
                    {r.flags.membershipExpiring && (
                      <View style={[styles.flag, { backgroundColor: "#E0413A22", borderColor: "#E0413A" }]}>
                        <Text style={[styles.flagText, { color: "#E0413A" }]}>Membresía por vencer</Text>
                      </View>
                    )}
                  </View>
                )}

                {sent[r.id] ? (
                  <Text style={[styles.sentMsg, { color: colors.success }]}>Mensaje enviado ✓</Text>
                ) : (
                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.action, { borderColor: colors.borderStrong }]} onPress={() => act(r, "reminder")}>
                      <Text style={[styles.actionText, { color: colors.text }]}>Recordatorio</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.action, { borderColor: colors.borderStrong }]} onPress={() => act(r, "checkin")}>
                      <Text style={[styles.actionText, { color: colors.text }]}>¿Cómo estás?</Text>
                    </TouchableOpacity>
                    {r.flags.membershipExpiring && (
                      <TouchableOpacity style={[styles.action, { borderColor: colors.primary, backgroundColor: `${colors.primary}14` }]} onPress={() => act(r, "renew")}>
                        <Text style={[styles.actionText, { color: colors.primary }]}>Renovar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.9)";
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    back: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
    upsellTitle: { fontSize: 22, fontWeight: "800" },
    upsellText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    upsellBtn: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 26, marginTop: 8 },
    upsellBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    segments: { flexDirection: "row", gap: 8, paddingHorizontal: 24, marginBottom: 8 },
    segment: { borderWidth: 2, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    empty: { fontSize: 14, textAlign: "center", marginTop: 40, lineHeight: 20 },
    card: {
      borderWidth: 2,
      borderColor: colors.borderStrong,
      backgroundColor: cardBg,
      borderRadius: 18,
      padding: 14,
      marginBottom: 12,
    },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    name: { fontSize: 15, fontWeight: "700" },
    meta: { fontSize: 13, marginTop: 2 },
    flags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    flag: { borderWidth: 1, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
    flagText: { fontSize: 12, fontWeight: "700" },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    action: { borderWidth: 2, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
    actionText: { fontSize: 13, fontWeight: "700" },
    sentMsg: { fontSize: 13, fontWeight: "700", marginTop: 12 },
  });
}
