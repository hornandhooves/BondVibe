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
import { useTranslation } from "react-i18next";
import Icon from "../components/Icon";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { formatDate } from "../utils/formatDate";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

const fmtDate = (ts) => {
  const ms = ts?.toMillis ? ts.toMillis() : ts ? new Date(ts).getTime() : 0;
  return ms ? formatDate(ms) : "—";
};

export default function MembershipSaleScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
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
  const name = buyer?.fullName || buyer?.name || buyerName || t("membershipSale.defaultMemberName");
  const m = membership || {};
  const amount = typeof amountCentavos === "number" ? amountCentavos / 100 : null;

  const Row = ({ icon, label, value }) => (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}1F` }]}>
        <Icon name={icon} size={18} color={colors.primary} />
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
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("membershipSale.title")}</Text>
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
              {m.planName || t("membershipSale.defaultPlanName")}
            </Text>
          </View>

          <Row
            icon="ticket"
            label={t("membershipSale.type")}
            value={t("membershipSale.classCredits")}
          />
          <Row
            icon="ticket"
            label={t("membershipSale.credits")}
            value={t("membershipSale.creditsLeft", { remaining: m.creditsRemaining ?? m.creditsTotal ?? 0, total: m.creditsTotal ?? 0 })}
          />
          {amount != null && (
            <Row icon="dollar" label={t("membershipSale.paid")} value={`$${amount.toFixed(2)} MXN`} />
          )}
          <Row icon="calendar" label={t("membershipSale.purchased")} value={fmtDate(m.purchasedAt)} />
          <Row icon="clock" label={t("membershipSale.expires")} value={fmtDate(m.expiresAt)} />
          <Row
            icon="ticket"
            label={t("membershipSale.status")}
            value={(m.status || "active").toUpperCase()}
          />

          <TouchableOpacity
            style={[styles.cta, { borderColor: colors.border }]}
            onPress={() => navigation.navigate("HostAnalytics")}
          >
            <Text style={[styles.ctaText, { color: colors.text }]}>
              {t("membershipSale.viewAnalytics")}
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
