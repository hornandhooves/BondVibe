import React, { useState, useEffect } from "react";
import Icon from "./Icon";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { getPendingRatings } from "../services/ratingService";

export default function PendingRatingsCard({ navigation, onRatePress }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [pendingEvents, setPendingEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingRatings();
  }, []);

  const loadPendingRatings = async () => {
    setLoading(true);
    try {
      const events = await getPendingRatings();
      setPendingEvents(events);
    } catch (error) {
      console.error("Error loading pending ratings:", error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh when component is focused
  const refresh = () => {
    loadPendingRatings();
  };

  // Don't show if no pending ratings
  if (loading || pendingEvents.length === 0) return null;

  const firstEvent = pendingEvents[0];
  const remainingCount = pendingEvents.length - 1;

  const handlePress = () => {
    if (onRatePress) {
      onRatePress(firstEvent);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.cardGlass,
            {
              backgroundColor: "rgba(255, 215, 0, 0.12)",
              borderColor: "rgba(255, 215, 0, 0.25)",
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Icon name="star"
                size={28}
                color="#FFD700"
                fill="#FFD700"
              />
            </View>
            {pendingEvents.length > 1 && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={styles.badgeText}>{pendingEvents.length}</Text>
              </View>
            )}
          </View>

          <View style={styles.content}>
            <Text style={[styles.title, { color: "#FFD700" }]}>
              {t("pendingRatingsCard.title")}
            </Text>
            <Text
              style={[styles.subtitle, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {firstEvent.title}
              {remainingCount > 0 &&
                ` ${t("pendingRatingsCard.more", { count: remainingCount })}`}
            </Text>
          </View>

          <Icon name="forward" size={22} color="#FFD700" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

// Export refresh function for external use
PendingRatingsCard.refresh = null;

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
  },
  cardGlass: {
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    position: "relative",
    marginRight: 14,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
});
