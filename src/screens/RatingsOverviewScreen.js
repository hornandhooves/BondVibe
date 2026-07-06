import Icon from "../components/Icon";
import StarRow from "../components/StarRow";
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
import { auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { getHostRatings } from "../services/ratingService";
import { getHostRatingsByEvent, extractKeywords } from "../services/hostInsightsService";

export default function RatingsOverviewScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [reviews, setReviews] = useState([]);
  const [byEvent, setByEvent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      const [r, e] = await Promise.all([
        uid ? getHostRatings(uid) : Promise.resolve([]),
        getHostRatingsByEvent(uid),
      ]);
      setReviews(r);
      setByEvent(e);
      setLoading(false);
    })();
  }, []);

  const styles = createStyles(colors, isDark);
  const withComments = reviews.filter((r) => (r.comment || "").trim());
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length
    : 0;
  const dist = [5, 4, 3, 2, 1].map((s) => ({
    star: s,
    count: reviews.filter((r) => Math.round(r.rating) === s).length,
  }));
  const keywords = extractKeywords(withComments.map((r) => r.comment));

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Ratings & reviews</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.hero, { borderColor: `${colors.primary}40`, backgroundColor: `${colors.primary}12` }]}>
            <View style={styles.heroValueRow}>
              <Text style={[styles.heroValue, { color: colors.text }]}>
                {avg.toFixed(1)}
              </Text>
              <Icon name="star" size={24} color={colors.warning} fill={colors.warning} />
            </View>
            <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
              {reviews.length} review{reviews.length === 1 ? "" : "s"}
            </Text>
          </View>

          {dist.map((d) => (
            <View key={d.star} style={styles.distRow}>
              <View style={styles.distStarRow}>
                <Text style={[styles.distStar, { color: colors.textSecondary }]}>{d.star}</Text>
                <Icon name="star" size={10} color={colors.textSecondary} fill={colors.textSecondary} />
              </View>
              <View style={[styles.distTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.distFill,
                    {
                      width: `${reviews.length ? (d.count / reviews.length) * 100 : 0}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.distCount, { color: colors.textSecondary }]}>{d.count}</Text>
            </View>
          ))}

          {keywords.length > 0 && (
            <>
              <Text style={[styles.section, { color: colors.textSecondary }]}>
                WHAT PEOPLE MENTION
              </Text>
              <View style={styles.chips}>
                {keywords.map((k) => (
                  <View key={k.word} style={[styles.chip, { backgroundColor: `${colors.primary}18` }]}>
                    <Text style={[styles.chipText, { color: colors.primary }]}>
                      {k.word} · {k.count}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={[styles.section, { color: colors.textSecondary }]}>RATING BY EVENT</Text>
          {byEvent.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>No ratings yet.</Text>
          ) : (
            byEvent.map((e) => (
              <View key={e.eventId} style={[styles.eventRow, { borderColor: colors.border }]}>
                <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>
                  {e.title}
                </Text>
                <View style={styles.eventValRow}>
                  <Text style={[styles.eventVal, { color: colors.primary }]}>
                    {e.avg.toFixed(1)}
                  </Text>
                  <Icon name="star" size={12} color={colors.primary} fill={colors.primary} />
                  <Text style={[styles.eventVal, { color: colors.primary }]}>· {e.count}</Text>
                </View>
              </View>
            ))
          )}

          <Text style={[styles.section, { color: colors.textSecondary }]}>REVIEWS</Text>
          {reviews.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>No reviews yet.</Text>
          ) : (
            reviews.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.reviewRow, { borderColor: colors.border }]}
                onPress={() => navigation.navigate("RatingDetail", { ratingId: r.id })}
              >
                <StarRow rating={r.rating || 0} size={14} style={styles.reviewStars} />
                {!!(r.comment || "").trim() && (
                  <Text style={[styles.reviewComment, { color: colors.text }]} numberOfLines={2}>
                    {r.comment}
                  </Text>
                )}
                <Text style={[styles.reviewMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                  {r.eventTitle || "Event"}
                </Text>
              </TouchableOpacity>
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
    hero: { borderWidth: 1, borderRadius: 18, padding: 20, marginBottom: 16, alignItems: "center" },
    heroValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    heroValue: { fontSize: 34, fontWeight: "800" },
    heroLabel: { fontSize: 14, marginTop: 4 },
    distRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
    distStarRow: { width: 28, flexDirection: "row", alignItems: "center", gap: 2 },
    distStar: { fontSize: 12 },
    distTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
    distFill: { height: 8, borderRadius: 4 },
    distCount: { width: 24, fontSize: 12, textAlign: "right" },
    section: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 20, marginBottom: 10 },
    muted: { fontSize: 13 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
    chipText: { fontSize: 13, fontWeight: "700" },
    eventRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      gap: 10,
    },
    eventTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
    eventValRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    eventVal: { fontSize: 14, fontWeight: "800" },
    reviewRow: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
    reviewStars: { marginBottom: 4 },
    reviewComment: { fontSize: 14, marginBottom: 4 },
    reviewMeta: { fontSize: 12 },
  });
}
