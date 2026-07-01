import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { Star, ChevronDown, ChevronUp } from "lucide-react-native";
import { getEventRatings } from "../services/ratingService";
import { AvatarDisplay } from "./AvatarPicker";

// Accept legacy string avatars and {type,value} objects; AvatarDisplay needs
// an object (or null), so wrap plain strings as an emoji avatar.
const normalizeAvatar = (a) => {
  if (!a) return null;
  if (typeof a === "string") return { type: "emoji", value: a };
  return a;
};

export default function EventRatings({ eventId, isHost }) {
  const { colors } = useTheme();
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadRatings();
  }, [eventId]);

  const loadRatings = async () => {
    setLoading(true);
    try {
      const eventRatings = await getEventRatings(eventId);
      setRatings(eventRatings);
    } catch (error) {
      console.error("Error loading ratings:", error);
    } finally {
      setLoading(false);
    }
  };

  // Visible to everyone (trust signal for attendees). `isHost` retained for
  // callers but no longer gates visibility.
  void isHost;

  // Don't show if no ratings
  if (!loading && ratings.length === 0) return null;

  const averageRating =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
      : 0;

  const displayedRatings = expanded ? ratings : ratings.slice(0, 3);

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const renderStars = (rating) => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={14}
            color={star <= rating ? "#FFD700" : `${colors.text}30`}
            fill={star <= rating ? "#FFD700" : "transparent"}
            strokeWidth={1.5}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.ratingsGlass,
          {
            backgroundColor: colors.surfaceGlass,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Header with Summary */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Ratings & Feedback
            </Text>
            {!loading && ratings.length > 0 && (
              <View style={styles.summaryRow}>
                <View style={styles.averageContainer}>
                  <Star
                    size={20}
                    color="#FFD700"
                    fill="#FFD700"
                    strokeWidth={1.5}
                  />
                  <Text style={[styles.averageText, { color: colors.text }]}>
                    {averageRating.toFixed(1)}
                  </Text>
                </View>
                <Text
                  style={[styles.countText, { color: colors.textSecondary }]}
                >
                  ({ratings.length}{" "}
                  {ratings.length === 1 ? "review" : "reviews"})
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        {/* Ratings List */}
        {!loading && ratings.length > 0 && (
          <View style={styles.ratingsList}>
            {displayedRatings.map((ratingItem, index) => (
              <View
                key={ratingItem.id}
                style={[
                  styles.ratingCard,
                  index < displayedRatings.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={styles.ratingHeader}>
                  <View style={styles.userInfo}>
                    <AvatarDisplay
                      avatar={normalizeAvatar(ratingItem.userAvatar)}
                      size={36}
                    />
                    <View>
                      <Text style={[styles.userName, { color: colors.text }]}>
                        {ratingItem.userName || "Anonymous"}
                      </Text>
                      <Text
                        style={[
                          styles.ratingDate,
                          { color: colors.textTertiary },
                        ]}
                      >
                        {formatDate(ratingItem.createdAt)}
                      </Text>
                    </View>
                  </View>
                  {renderStars(ratingItem.rating)}
                </View>
                {ratingItem.comment && (
                  <Text
                    style={[
                      styles.ratingComment,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {ratingItem.comment}
                  </Text>
                )}
              </View>
            ))}

            {/* Show More/Less Button */}
            {ratings.length > 3 && (
              <TouchableOpacity
                style={styles.showMoreButton}
                onPress={() => setExpanded(!expanded)}
              >
                <Text style={[styles.showMoreText, { color: colors.primary }]}>
                  {expanded
                    ? "Show less"
                    : `Show all ${ratings.length} reviews`}
                </Text>
                {expanded ? (
                  <ChevronUp size={18} color={colors.primary} strokeWidth={2} />
                ) : (
                  <ChevronDown
                    size={18}
                    color={colors.primary}
                    strokeWidth={2}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Empty State */}
        {!loading && ratings.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>⭐</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No ratings yet
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  ratingsGlass: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  averageContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  averageText: {
    fontSize: 18,
    fontWeight: "700",
  },
  countText: {
    fontSize: 14,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  ratingsList: {
    gap: 0,
  },
  ratingCard: {
    paddingVertical: 14,
  },
  ratingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEmoji: {
    fontSize: 18,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
  },
  ratingDate: {
    fontSize: 12,
    marginTop: 2,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
  },
  ratingComment: {
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 46, // Align with name
  },
  showMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 14,
    gap: 4,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 16,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
  },
});
