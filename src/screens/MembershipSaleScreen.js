import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ticket, Calendar, Clock, DollarSign } from "lucide-react-native";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

const fmtDate = (ts) => {
  const ms = ts?.toMillis ? ts.toMillis() : ts ? new Date(ts).getTime() : 0;
  return ms ? new Date(ms).toLocaleDateString() : "—";
};

export default function MembershipSaleScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { membershipId, userId, buyerName, amountCentavos } = route.params || {};
  const [membership, setMembership] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (membershipId) {
          const m = await getDoc(doc(db, "memberships", membershipId));
          if (m.exists()) setMembership({ id: m.id, ...m.data() });
        }
        if (userId) {
          const u = await getDoc(doc(db, "users", userId));
          if (u.exists()) setBuyer(u.data());
        }
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [membershipId, userId]);

  const styles = createStyles(colors, isDark);
  const name = buyer?.fullName || buyer?.name || buyerName || "Member";
  const m = membership || {};
  const isCredits = m.type === "credits";
  const amount = typeof amountCentavos === "number" ? amountCentavos / 100 : null;

  const Row = ({ icon: Icon, label, value }) => (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}1F` }]}>
        <Icon size={18} color={colors.primary} strokeWidth={2} />
      </View>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Membership sold</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.buyer}>
            <AvatarDisplay avatar={normAvatar(buyer?.avatar)} size={64} />
            <Text style={[styles.buyerName, { color: colors.text }]}>{name}</Text>
            <Text style={[styles.plan, { color: colors.primary }]}>
              {m.planName || "Membership"}
            </Text>
          </View>

          <Row
            icon={Ticket}
            label="Type"
            value={isCredits ? "Class credits" : "Unlimited"}
          />
          {isCredits && (
            <Row
              icon={Ticket}
              label="Credits"
              value={`${m.creditsRemaining ?? m.creditsTotal ?? 0} of ${m.creditsTotal ?? 0} left`}
            />
          )}
          {amount != null && (
            <Row icon={DollarSign} label="Paid" value={`$${amount.toFixed(2)} MXN`} />
          )}
          <Row icon={Calendar} label="Purchased" value={fmtDate(m.purchasedAt)} />
          <Row icon={Clock} label="Expires" value={fmtDate(m.expiresAt)} />
          <Row
            icon={Ticket}
            label="Status"
            value={(m.status || "active").toUpperCase()}
          />

          <TouchableOpacity
            style={[styles.cta, { borderColor: colors.border }]}
            onPress={() => navigation.navigate("HostAnalytics")}
          >
            <Text style={[styles.ctaText, { color: colors.text }]}>
              View analytics
            </Text>
          </TouchableOpacity>
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
    headerTitle: { fontSize: 18, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    buyer: { alignItems: "center", marginVertical: 20, gap: 8 },
    buyerName: { fontSize: 22, fontWeight: "800" },
    plan: { fontSize: 15, fontWeight: "700" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 14,
      backgroundColor: cardBg,
      padding: 14,
      marginBottom: 10,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    rowLabel: { fontSize: 14, flex: 1 },
    rowValue: { fontSize: 15, fontWeight: "700" },
    cta: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 16,
      alignItems: "center",
      marginTop: 16,
    },
    ctaText: { fontSize: 15, fontWeight: "700" },
  });
}
