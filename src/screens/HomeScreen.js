import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { useMode } from "../contexts/ModeContext";
import { LinearGradient } from "expo-linear-gradient";
import { BRAND, ELEVATION } from "../constants/theme-tokens";
import { useFocusEffect } from "@react-navigation/native";
import { EVENT_CATEGORIES } from "../utils/eventCategories";
import Icon, { getCategoryIcon } from "../components/Icon";
import RatingModal from "../components/RatingModal";
import { getPendingRatings } from "../services/ratingService";
import { getFeaturedEvents } from "../services/promotionService";
import GradientBackground from "../components/GradientBackground";
import { BVCard } from "../components/BoldPop";
import FeaturedCarousel from "../components/FeaturedCarousel";

export default function HomeScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { isHosting } = useMode();
  const [user, setUser] = useState(null);
  const [pendingHostRequests, setPendingHostRequests] = useState(0);

  // Rating state
  const [pendingRatingEvents, setPendingRatingEvents] = useState([]);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Featured (promoted) events
  const [featuredEvents, setFeaturedEvents] = useState([]);

  useEffect(() => {
    loadUser();
    loadFeatured();
  }, []);

  const loadFeatured = async () => {
    try {
      const events = await getFeaturedEvents(10);
      setFeaturedEvents(events);
    } catch (e) {
      console.error("Error loading featured events:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user?.role === "admin") {
        loadPendingHostRequests();
      }
      loadPendingRatings();
      loadUser();
    }, [user?.role]),
  );

  const loadUser = async () => {
    if (!auth.currentUser) {
      console.log("⏳ loadUser called but no currentUser yet, skipping");
      return;
    }
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUser(userData);
        if (userData.role === "admin") {
          loadPendingHostRequests();
        }
      }
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const loadPendingHostRequests = async () => {
    try {
      const requestsQuery = query(
        collection(db, "hostRequests"),
        where("status", "==", "pending"),
      );
      const snapshot = await getDocs(requestsQuery);
      setPendingHostRequests(snapshot.size);
    } catch (error) {
      console.error("Error loading host requests:", error);
    }
  };

  const loadPendingRatings = async () => {
    try {
      const events = await getPendingRatings();
      setPendingRatingEvents(events);
    } catch (error) {
      console.error("Error loading pending ratings:", error);
    }
  };

  const handleRateEvent = (event) => {
    setSelectedEvent(event);
    setShowRatingModal(true);
  };

  const handleRatingSuccess = () => {
    setPendingRatingEvents((prev) =>
      prev.filter((e) => e.id !== selectedEvent.id),
    );
    setShowRatingModal(false);
    setSelectedEvent(null);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const getUserDisplayName = () => {
    if (!user) return "Friend";
    return user.fullName || user.name || "Friend";
  };

  const isAdmin = user?.role === "admin";
  const isHost = user?.role === "host";
  const canCreateEvents = isAdmin || isHost;

  const styles = createStyles(colors, isDark);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Tab root — AppHeader (toggle/✉/🔔) is provided by the tab navigator;
          Profile is now a tab, so the avatar shortcut is gone. */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>
            {getGreeting()}
          </Text>
          <Text style={[styles.name, { color: colors.text }]}>
            {getUserDisplayName()}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Weekly Digest banner (§2.2 / ai_features/14) */}
        <TouchableOpacity
          style={styles.digestBanner}
          onPress={() => navigation.navigate("YourWeek")}
          activeOpacity={0.85}
          testID="home-digest"
        >
          <Icon name="ai" size={16} color="#C792EA" />
          <Text style={styles.digestText} numberOfLines={1}>
            Your week, curated by Kinlo AI
          </Text>
          <Icon name="forward" size={16} color="#C792EA" />
        </TouchableOpacity>

        {/* Search entry (§2.2) */}
        <TouchableOpacity
          style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate("SearchEvents")}
          activeOpacity={0.8}
          testID="home-search"
        >
          <Icon name="search" size={18} color={colors.textTertiary} />
          <Text style={[styles.searchPlaceholder, { color: colors.textTertiary }]}>
            Search events
          </Text>
        </TouchableOpacity>

        {/* Pending Ratings Section */}
        {pendingRatingEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              RATE YOUR EXPERIENCES
            </Text>
            {pendingRatingEvents.map((event) => {
              const eventDate = event.date ? new Date(event.date) : null;
              const dateStr = eventDate
                ? eventDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "Date unknown";
              return (
                <TouchableOpacity
                  key={event.id}
                  style={styles.ratingCard}
                  onPress={() => handleRateEvent(event)}
                  activeOpacity={0.8}
                >
                  <BVCard
                    shadowColor="#FFD700"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 16,
                      backgroundColor: isDark
                        ? "rgba(255, 215, 0, 0.10)"
                        : "rgba(255, 215, 0, 0.14)",
                    }}
                  >
                    <View
                      style={[
                        styles.iconCircle,
                        { backgroundColor: "rgba(255, 215, 0, 0.15)" },
                      ]}
                    >
                      <Icon name="star" size={22} color="#FFD700" fill="#FFD700" />
                    </View>
                    <View style={styles.cardContent}>
                      <Text
                        style={[styles.cardTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {event.title}
                      </Text>
                      <Text
                        style={[
                          styles.cardSubtitle,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {dateStr}
                      </Text>
                    </View>
                    <Icon name="forward" size={18} color="#FFD700" />
                  </BVCard>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Zero state (§2.2): no featured events near the user yet */}
        {featuredEvents.length === 0 && (
          <View style={styles.zeroState}>
            <Icon name="discover" size={36} color={colors.textTertiary} />
            <Text style={[styles.zeroTitle, { color: colors.text }]}>
              No featured events yet
            </Text>
            <Text style={[styles.zeroText, { color: colors.textSecondary }]}>
              Be the first to host something your community will love.
            </Text>
            <TouchableOpacity
              style={[styles.zeroCta, { backgroundColor: colors.primary }]}
              onPress={() =>
                canCreateEvents
                  ? navigation.navigate("CreateEvent")
                  : navigation.navigate("RequestHost")
              }
              activeOpacity={0.85}
            >
              <Text style={styles.zeroCtaText}>Host one</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Featured — auto-advancing carousel (Fix 6) */}
        {featuredEvents.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitleInline, { color: colors.textTertiary }]}>
                FEATURED
              </Text>
            </View>
            <View style={styles.carouselWrap}>
              <FeaturedCarousel
                events={featuredEvents}
                onPressEvent={(ev) =>
                  navigation.navigate("EventDetail", { eventId: ev.id })
                }
              />
            </View>
          </View>
        )}

        {/* Admin Dashboard Card */}
        {isAdmin && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.adminCard}
              onPress={() => navigation.navigate("AdminDashboard")}
              activeOpacity={0.8}
            >
              <BVCard
                shadow={false}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 16,
                  backgroundColor: isDark
                    ? "rgba(255, 215, 0, 0.12)"
                    : "rgba(255, 215, 0, 0.16)",
                }}
              >
                <View style={styles.adminIconContainer}>
                  <Icon name="pro" size={36} color="#FFD700" />
                  {pendingHostRequests > 0 && (
                    <View
                      style={[
                        styles.adminBadge,
                        { backgroundColor: colors.accent },
                      ]}
                    >
                      <Text style={styles.badgeText}>
                        {pendingHostRequests}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.adminText}>
                  <Text style={styles.adminTitle}>Admin Dashboard</Text>
                  <Text
                    style={[
                      styles.adminSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {pendingHostRequests > 0
                      ? `${pendingHostRequests} pending request${
                          pendingHostRequests > 1 ? "s" : ""
                        }`
                      : "Manage host requests and events"}
                  </Text>
                </View>
                <Icon name="forward" size={24} color="#FFD700" />
              </BVCard>
            </TouchableOpacity>
          </View>
        )}

        {/* Browse by Category */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitleInline, { color: colors.textTertiary }]}>
              BROWSE BY COMMUNITY
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("SearchEvents")}
            >
              <Text style={[styles.seeAll, { color: colors.primary }]}>
                See all
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesScroll}
          >
            {EVENT_CATEGORIES.map((category) => {
              const CategoryIcon = getCategoryIcon(category.id);
              return (
                <TouchableOpacity
                  key={category.id}
                  style={styles.categoryCard}
                  onPress={() =>
                    navigation.navigate("SearchEvents", {
                      category: category.label,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <BVCard style={{ alignItems: "center", padding: 16 }}>
                    <View
                      style={[
                        styles.categoryIconCircle,
                        {
                          backgroundColor: isDark
                            ? `${colors.primary}20`
                            : `${colors.primary}15`,
                        },
                      ]}
                    >
                      <CategoryIcon
                        size={28}
                        color={colors.primary}
                        strokeWidth={1.8}
                      />
                    </View>
                    <Text style={[styles.categoryName, { color: colors.text }]}>
                      {category.label}
                    </Text>
                  </BVCard>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Contextual Create — Host Mode only (§Fix 2): the single allowed
          shortcut; attendees don't create events. */}
      {isHosting && canCreateEvents && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate("CreateEvent")}
          activeOpacity={0.85}
          testID="home-create-fab"
        >
          <LinearGradient
            colors={BRAND.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.fabInner, ELEVATION.floatingBrand]}
          >
            <Icon name="add" size={26} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Rating Modal */}
      <RatingModal
        visible={showRatingModal}
        onClose={() => {
          setShowRatingModal(false);
          setSelectedEvent(null);
        }}
        onSuccess={handleRatingSuccess}
        event={selectedEvent}
      />
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 4,
      paddingBottom: 20,
    },
    greeting: { fontSize: 14, marginBottom: 4 },
    name: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
    digestBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "#2A1E3D",
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 24,
      marginBottom: 12,
    },
    digestText: { flex: 1, color: "#e6ddf2", fontSize: 14, fontWeight: "600" },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 24,
      marginBottom: 20,
    },
    searchPlaceholder: { fontSize: 14.5 },
    fab: { position: "absolute", right: 20, bottom: 24 },
    fabInner: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    carouselWrap: { paddingHorizontal: 24 },
    zeroState: {
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 40,
      paddingVertical: 28,
    },
    zeroTitle: { fontSize: 16, fontWeight: "700" },
    zeroText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
    zeroCta: {
      borderRadius: 999,
      paddingHorizontal: 24,
      paddingVertical: 10,
      marginTop: 6,
    },
    zeroCtaText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
    section: { marginBottom: 28 },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "700",
      paddingHorizontal: 24,
      marginBottom: 14,
      letterSpacing: 0.8,
    },
    sectionTitleInline: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    seeAll: { fontSize: 14, fontWeight: "600" },

    // Shared card styles
    cardGlass: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
    },
    cardContent: { flex: 1 },
    cardTitle: {
      fontSize: 15,
      fontWeight: "600",
      marginBottom: 2,
      letterSpacing: -0.2,
    },
    cardSubtitle: { fontSize: 13 },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },

    // Rating card
    ratingCard: {
      marginHorizontal: 24,
      marginBottom: 10,
    },

    // Quick Actions
    quickActionCard: {
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 24,
      alignItems: "center",
    },

    // Admin Card
    adminCard: {
      marginHorizontal: 24,
    },
    adminIconContainer: { position: "relative", marginRight: 16 },
    adminBadge: {
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
    adminText: { flex: 1 },
    adminTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 4,
      color: "#FFD700",
      letterSpacing: -0.3,
    },
    adminSubtitle: { fontSize: 13, lineHeight: 18 },

    // Categories
    categoriesScroll: { paddingHorizontal: 24, gap: 12 },
    categoryCard: {
      width: 100,
    },
    categoryCardInner: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      alignItems: "center",
    },
    categoryIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 10,
    },
    categoryName: {
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: -0.1,
      textAlign: "center",
    },
  });
}
