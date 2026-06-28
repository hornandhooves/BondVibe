import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import {
  Users,
  Ticket,
  CalendarCheck,
  Clock,
  Star,
  Sparkles,
} from "lucide-react-native";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { auth } from "../services/firebase";
import {
  getHostAnalytics,
  formatPlanPrice,
  getMembershipExpiryDate,
} from "../services/membershipService";
import {
  getHostRatings,
  getHostFeedbackInsights,
} from "../services/ratingService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function HostAnalyticsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [data, setData] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiVisible, setAiVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    const uid = auth.currentUser?.uid;
    const [result, hostReviews] = await Promise.all([
      getHostAnalytics(),
      uid ? getHostRatings(uid) : Promise.resolve([]),
    ]);
    setData(result);
    setReviews(hostReviews);
    setLoading(false);
  };

  // Star distribution (5★ → 1★) from the loaded reviews.
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));
  const withComments = reviews.filter((r) => (r.comment || "").trim());

  const handleAiInsights = async () => {
    setAiLoading(true);
    const r = await getHostFeedbackInsights();
    setAiLoading(false);
    if (r.success && r.enough) {
      setAiInsights(r.insights);
      setAiVisible(true);
    } else if (r.success && r.enough === false) {
      Alert.alert(
        "Not enough feedback yet",
        "You need at least 3 reviews with written comments to generate AI recommendations."
      );
    } else if (
      (r.code || "").includes("permission-denied") ||
      r.error === "premium_required"
    ) {
      Alert.alert(
        "Premium feature ✨",
        "AI recommendations are part of BondVibe Pro. Upgrade to get coaching on how to improve your events, based on your real reviews."
      );
    } else {
      Alert.alert("Couldn't generate", r.error || "Please try again later.");
    }
  };

  const styles = createStyles(colors, isDark);

  const StatCard = ({ icon: Icon, label, value, accent }) => (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${accent}1F` }]}>
        <Icon size={20} color={accent} strokeWidth={2} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Analytics</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !data ? (
        <View style={styles.loading}>
          <Text style={{ color: colors.textSecondary }}>
            Couldn't load analytics.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            REVENUE
          </Text>
          <View style={styles.revenueCard}>
            <Text style={[styles.revenueValue, { color: colors.text }]}>
              {formatPlanPrice(data.revenueTotalCentavos)}
            </Text>
            <Text style={[styles.revenueLabel, { color: colors.textSecondary }]}>
              Total received · {formatPlanPrice(data.revenueMonthCentavos)} this month
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
            MEMBERS
          </Text>
          <View style={styles.statsGrid}>
            <StatCard
              icon={Users}
              label="Active members"
              value={data.activeMembers}
              accent="#34C759"
            />
            <StatCard
              icon={Ticket}
              label="Memberships sold"
              value={data.membershipsSold}
              accent={colors.primary}
            />
            <StatCard
              icon={CalendarCheck}
              label="Classes attended"
              value={data.classesAttended}
              accent="#0A84FF"
            />
            <StatCard
              icon={Clock}
              label="Expiring (7 days)"
              value={data.expiringSoonCount}
              accent="#FF9F0A"
            />
            <StatCard
              icon={Star}
              label={
                data.hostTotalRatings > 0
                  ? `Rating (${data.hostTotalRatings})`
                  : "Rating"
              }
              value={
                data.hostTotalRatings > 0
                  ? data.hostAverageRating.toFixed(1)
                  : "—"
              }
              accent="#FFD700"
            />
          </View>

          {/* Reviews */}
          <View style={styles.reviewsHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary, marginTop: 0 }]}>
              REVIEWS ({reviews.length})
            </Text>
            <TouchableOpacity
              style={[
                styles.aiBtn,
                { backgroundColor: `${colors.primary}1F`, borderColor: `${colors.primary}55` },
              ]}
              onPress={handleAiInsights}
              disabled={aiLoading}
              activeOpacity={0.85}
            >
              {aiLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Sparkles size={15} color={colors.primary} strokeWidth={2} />
              )}
              <Text style={[styles.aiBtnText, { color: colors.primary }]}>
                {aiLoading ? "Analyzing…" : "AI tips"}
              </Text>
            </TouchableOpacity>
          </View>

          {reviews.length === 0 ? (
            <Text style={[styles.emptyReviews, { color: colors.textSecondary }]}>
              No reviews yet. They'll appear here after your events.
            </Text>
          ) : (
            <>
              <View style={styles.distCard}>
                {distribution.map(({ star, count }) => {
                  const pct = reviews.length ? (count / reviews.length) * 100 : 0;
                  return (
                    <View key={star} style={styles.distRow}>
                      <Text style={[styles.distStar, { color: colors.textSecondary }]}>
                        {star}★
                      </Text>
                      <View
                        style={[
                          styles.distTrack,
                          { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" },
                        ]}
                      >
                        <View style={[styles.distFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={[styles.distCount, { color: colors.textTertiary }]}>
                        {count}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {withComments.slice(0, 20).map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.reviewCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate("RatingDetail", { ratingId: r.id })
                  }
                >
                  <View style={styles.reviewHead}>
                    <AvatarDisplay avatar={normAvatar(r.userAvatar)} size={28} />
                    <Text style={[styles.reviewName, { color: colors.text }]} numberOfLines={1}>
                      {r.userName || "Someone"}
                    </Text>
                    <Text style={styles.reviewStars}>
                      {"★".repeat(Math.round(r.rating))}
                    </Text>
                  </View>
                  <Text style={[styles.reviewComment, { color: colors.textSecondary }]} numberOfLines={3}>
                    {r.comment}
                  </Text>
                  {!!r.eventTitle && (
                    <Text style={[styles.reviewEvent, { color: colors.textTertiary }]} numberOfLines={1}>
                      {r.eventTitle}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}

          {data.expiringSoon.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
                EXPIRING SOON
              </Text>
              {data.expiringSoon.map((m) => {
                const exp = getMembershipExpiryDate(m);
                return (
                  <View key={m.id} style={styles.expRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.expName, { color: colors.text }]} numberOfLines={1}>
                        {m.planName}
                      </Text>
                      <Text style={[styles.expMeta, { color: colors.textSecondary }]}>
                        {m.type === "credits"
                          ? `${m.creditsRemaining || 0} left · `
                          : ""}
                        expires {exp ? exp.toLocaleDateString() : "—"}
                      </Text>
                    </View>
                    <Clock size={16} color="#FF9F0A" strokeWidth={2} />
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* AI recommendations */}
      <Modal visible={aiVisible} transparent animationType="slide">
        <View style={styles.aiOverlay}>
          <View style={[styles.aiCard, { backgroundColor: colors.background }]}>
            <View style={styles.aiCardHead}>
              <Sparkles size={20} color={colors.primary} strokeWidth={2} />
              <Text style={[styles.aiTitle, { color: colors.text }]}>
                AI recommendations
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {!!aiInsights?.summary && (
                <Text style={[styles.aiSummary, { color: colors.textSecondary }]}>
                  {aiInsights.summary}
                </Text>
              )}
              {!!aiInsights?.sentiment && (
                <View style={{ marginTop: 14 }}>
                  <Text style={[styles.aiListTitle, { color: colors.text }]}>😊 Sentimiento</Text>
                  <Text style={[styles.aiListItem, { color: colors.textSecondary }]}>
                    {aiInsights.sentiment}
                  </Text>
                </View>
              )}
              {!!aiInsights?.trend && (
                <View style={{ marginTop: 14 }}>
                  <Text style={[styles.aiListTitle, { color: colors.text }]}>📈 Tendencia</Text>
                  <Text style={[styles.aiListItem, { color: colors.textSecondary }]}>
                    {aiInsights.trend}
                  </Text>
                </View>
              )}
              <AiList title="✅ Fortalezas" items={aiInsights?.strengths} colors={colors} styles={styles} />
              <AiList title="🛠 A mejorar" items={aiInsights?.improvements} colors={colors} styles={styles} />
              <AiList title="🎯 Próximo evento" items={aiInsights?.nextEvent || aiInsights?.suggestions} colors={colors} styles={styles} />
            </ScrollView>
            <TouchableOpacity
              style={[styles.aiClose, { backgroundColor: colors.primary }]}
              onPress={() => setAiVisible(false)}
            >
              <Text style={styles.aiCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function AiList({ title, items, colors, styles }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[styles.aiListTitle, { color: colors.text }]}>{title}</Text>
      {items.map((item, idx) => (
        <Text key={idx} style={[styles.aiListItem, { color: colors.textSecondary }]}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

function createStyles(colors, isDark) {
  const cardBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)";
  const cardBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    back: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
      marginBottom: 10,
      marginTop: 8,
    },
    revenueCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 20,
      marginBottom: 16,
    },
    revenueValue: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
    revenueLabel: { fontSize: 13, marginTop: 6 },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    statCard: {
      width: "48%",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 16,
      marginBottom: 12,
    },
    statIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    statValue: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
    statLabel: { fontSize: 12, marginTop: 2 },
    expRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 14,
      marginBottom: 10,
    },
    expName: { fontSize: 15, fontWeight: "700" },
    expMeta: { fontSize: 12, marginTop: 2 },

    reviewsHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 8,
    },
    aiBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginBottom: 10,
    },
    aiBtnText: { fontSize: 13, fontWeight: "700" },
    emptyReviews: { fontSize: 13, marginBottom: 16 },
    distCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 16,
      marginBottom: 14,
      gap: 8,
    },
    distRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    distStar: { width: 28, fontSize: 13, fontWeight: "600" },
    distTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
    distFill: { height: 8, borderRadius: 4, backgroundColor: "#FFD700" },
    distCount: { width: 24, fontSize: 12, textAlign: "right" },
    reviewCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: cardBorder,
      backgroundColor: cardBg,
      padding: 14,
      marginBottom: 10,
    },
    reviewHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
    reviewName: { flex: 1, fontSize: 14, fontWeight: "700" },
    reviewStars: { fontSize: 13, color: "#FFD700" },
    reviewComment: { fontSize: 14, lineHeight: 19 },
    reviewEvent: { fontSize: 12, marginTop: 6 },

    aiOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    aiCard: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 36,
    },
    aiCardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    aiTitle: { fontSize: 20, fontWeight: "700" },
    aiSummary: { fontSize: 15, lineHeight: 21 },
    aiListTitle: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
    aiListItem: { fontSize: 14, lineHeight: 20, marginBottom: 3 },
    aiClose: {
      marginTop: 18,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    aiCloseText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  });
}
