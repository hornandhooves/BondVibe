import Icon from "../components/Icon";
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
import { doc, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { getHostMembersDetail } from "../services/hostInsightsService";
import { getMembershipState } from "../utils/membershipUtils";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;
const fmtDate = (ts) => {
  const ms = ts?.toMillis ? ts.toMillis() : ts ? new Date(ts).getTime() : 0;
  return ms ? new Date(ms).toLocaleDateString() : "—";
};

const CONFIG = {
  members: {
    title: "Active members",
    tip: "Active members are your recurring revenue and the core of your community. Keep them engaged with updates and new events.",
  },
  memberships: {
    title: "Memberships sold",
    tip: "Every sale is a commitment. Thank buyers and invite them to their first class to build loyalty.",
  },
  attended: {
    title: "Classes attended",
    tip: "Attendance is engagement. Members who attend renew more — celebrate regulars.",
  },
  expiring: {
    title: "Expiring soon",
    tip: "These memberships expire within 7 days. A message or renewal offer NOW protects this revenue.",
  },
};

export default function AnalyticsDetailScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const metric = route.params?.metric || "members";
  const cfg = CONFIG[metric] || CONFIG.members;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { memberships, redemptions } = await getHostMembersDetail();
        let list = [];
        if (metric === "attended") {
          list = redemptions.map((r) => ({
            userId: r.userId,
            title: r.eventTitle || "Class",
            sub: fmtDate(r.redeemedAt || r.createdAt),
          }));
        } else {
          let ms = memberships;
          if (metric === "members") ms = memberships.filter((m) => getMembershipState(m) === "active");
          if (metric === "expiring") {
            const soon = Date.now() + 7 * 86400000;
            ms = memberships.filter((m) => {
              const e = m.expiresAt?.toMillis ? m.expiresAt.toMillis() : 0;
              return getMembershipState(m) === "active" && e && e <= soon;
            });
          }
          list = ms.map((m) => ({
            userId: m.userId,
            title: m.planName || "Membership",
            sub:
              m.type === "credits"
                ? `${m.creditsRemaining ?? 0} credits · exp ${fmtDate(m.expiresAt)}`
                : `Unlimited · exp ${fmtDate(m.expiresAt)}`,
          }));
        }
        // resolve names/avatars
        const ids = [...new Set(list.map((r) => r.userId).filter(Boolean))];
        const users = {};
        await Promise.all(
          ids.map(async (id) => {
            const u = await getDoc(doc(db, "users", id));
            const d = u.exists() ? u.data() : {};
            users[id] = { name: d.fullName || d.name || "Member", avatar: d.avatar };
          })
        );
        setRows(list.map((r) => ({ ...r, ...(users[r.userId] || { name: "Member" }) })));
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [metric]);

  const styles = createStyles(colors, isDark);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{cfg.title}</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.tip, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}33` }]}>
            <Icon name="info" size={14} color={colors.primary} style={styles.tipIcon} />
            <Text style={[styles.tipText, { color: colors.text }]}>{cfg.tip}</Text>
          </View>
          <Text style={[styles.count, { color: colors.textSecondary }]}>
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </Text>
          {rows.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>Nothing here yet.</Text>
          ) : (
            rows.map((r, i) => (
              <View key={`${r.userId}-${i}`} style={[styles.row, { borderColor: colors.border }]}>
                <AvatarDisplay avatar={normAvatar(r.avatar)} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {r.title} · {r.sub}
                  </Text>
                </View>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
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
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    tip: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      flexDirection: "row",
      gap: 8,
    },
    tipIcon: { marginTop: 3 },
    tipText: { fontSize: 14, lineHeight: 20, flex: 1 },
    count: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 10 },
    muted: { fontSize: 13 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    name: { fontSize: 15, fontWeight: "700" },
    sub: { fontSize: 13, marginTop: 2 },
  });
}
