import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { useFocusEffect } from "@react-navigation/native";
import { EVENT_CATEGORIES } from "../utils/eventCategories";
import Icon, { getCategoryIcon } from "../components/Icon";
import RatingModal from "../components/RatingModal";
import { getPendingRatings } from "../services/ratingService";
import { getFeaturedEvents } from "../services/promotionService";
import { AvatarDisplay } from "../components/AvatarPicker";
import GradientBackground from "../components/GradientBackground";
import { BVCard } from "../components/BoldPop";

export default function HomeScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
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

  useEffect(() => {
    if (!auth.currentUser) return;

    const notifQuery = query(
      collection(db, "notifications"),
      where("userId", "==", auth.currentUser.uid),
      where("read", "==", false),
    );

    const unsubscribe = onSnapshot(
      notifQuery,
      (snapshot) => {
        let totalCount = 0;
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.type === "event_messages" && data.unreadCount) {
            totalCount += data.unreadCount;
          } else {
            totalCount += 1;
          }
        });
        setUnreadNotifications(totalCount);
      },
      (error) => {
        console.error("Error in notifications listener:", error);
      },
    );

    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

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

  const getUserAvatar = () => {
    if (!user) return { type: "emoji", value: "😊" };

    if (user.avatar && typeof user.avatar === "object") {
      return user.avatar;
    }

    if (user.avatar && typeof user.avatar === "string") {
      return { type: "emoji", value: user.avatar };
    }

    return { type: "emoji", value: user.emoji || "😊" };
  };

  const isAdmin = user?.role === "admin";
  const isHost = user?.role === "host";
  const canCreateEvents = isAdmin || isHost;
  // Approved as host but hasn't chosen a type yet → prompt them to choose,
  // not to re-apply for hosting.
  const isApprovedPendingHostType = user?.hostApproved && !canCreateEvents;

  const styles = createStyles(colors, isDark);

  const hostQuickAction = canCreateEvents
    ? {
        id: "create",
        label: "Create",
        icon: "ai",
        screen: "CreateEvent",
        badge: 0,
      }
    : isApprovedPendingHostType
    ? {
        id: "choosehost",
        label: "Choose Type",
        icon: "ai",
        screen: "HostTypeSelection",
        badge: 0,
      }
    : {
        id: "behost",
        label: "Be a Host",
        icon: "tent",
        screen: "RequestHost",
        badge: 0,
      };

  const quickActions = [
    {
      id: "explore",
      label: "Explore",
      icon: "search",
      screen: "SearchEvents",
      badge: 0,
    },
    {
      id: "feed",
      label: "Feed",
      icon: "community",
      screen: "Feed",
      badge: 0,
    },
    {
      id: "myevents",
      label: "My Events",
      icon: "calendar",
      screen: "MyEvents",
      badge: 0,
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: "bell",
      screen: "Notifications",
      badge: unreadNotifications,
    },
    {
      id: "rentals",
      label: "Get around",
      icon: "bike",
      screen: "RentalHub",
      badge: 0,
    },
    hostQuickAction,
  ];

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>
            {getGreeting()}
          </Text>
          <Text style={[styles.name, { color: colors.text }]}>
            {getUserDisplayName()}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate("Profile")}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: `${colors.primary}26`,
                borderColor: `${colors.primary}66`,
              },
            ]}
          >
            <AvatarDisplay avatar={getUserAvatar()} size={44} />
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
            QUICK ACTIONS
          </Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action) => {
              return (
                <TouchableOpacity
                  key={action.id}
                  style={styles.quickAction}
                  onPress={() => navigation.navigate(action.screen)}
                  activeOpacity={0.7}
                >
                  <BVCard
                    style={{ alignItems: "center", paddingVertical: 22, width: "100%" }}
                  >
                    <View style={styles.quickActionIconContainer}>
                      <View
                        style={[
                          styles.iconCircleLarge,
                          {
                            backgroundColor: isDark
                              ? `${colors.primary}20`
                              : `${colors.primary}15`,
                          },
                        ]}
                      >
                        <Icon name={action.icon} size={28} color={colors.primary} />
                      </View>
                      {action.badge > 0 && (
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: colors.accent },
                          ]}
                        >
                          <Text style={styles.badgeText}>
                            {action.badge > 99 ? "99+" : action.badge}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[styles.quickActionText, { color: colors.text }]}
                    >
                      {action.label}
                    </Text>
                  </BVCard>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Featured Events */}
        {featuredEvents.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitleInline, { color: colors.textTertiary }]}>
                FEATURED
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
            >
              {featuredEvents.map((ev) => {
                const img = Array.isArray(ev.images) ? ev.images[0] : null;
                return (
                  <TouchableOpacity
                    key={ev.id}
                    activeOpacity={0.85}
                    onPress={() =>
                      navigation.navigate("EventDetail", { eventId: ev.id })
                    }
                    style={[
                      styles.featuredCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.borderStrong,
                      },
                    ]}
                  >
                    {img ? (
                      <Image source={{ uri: img }} style={styles.featuredImage} />
                    ) : (
                      <View
                        style={[
                          styles.featuredImage,
                          { backgroundColor: `${colors.primary}26`, alignItems: "center", justifyContent: "center" },
                        ]}
                      >
                        <Icon name="ai" size={28} color={colors.primary} />
                      </View>
                    )}
                    <View style={styles.featuredBadge}>
                      <Text style={styles.featuredBadgeText}>Featured</Text>
                    </View>
                    <View style={{ padding: 12 }}>
                      <Text
                        style={[styles.featuredTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {ev.title || "Event"}
                      </Text>
                      <Text
                        style={[styles.featuredMeta, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {ev.location || ev.city || ""}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
      paddingTop: 60,
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
    iconCircleLarge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: "center",
      alignItems: "center",
    },

    // Rating card
    ratingCard: {
      marginHorizontal: 24,
      marginBottom: 10,
    },

    // Quick Actions
    quickActionsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 24,
      gap: 12,
    },
    quickAction: {
      width: "48%",
    },
    quickActionCard: {
      borderWidth: 1,
      borderRadius: 16,
      paddingVertical: 24,
      alignItems: "center",
    },
    quickActionIconContainer: { position: "relative", marginBottom: 12 },
    badge: {
      position: "absolute",
      top: -4,
      right: -8,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 6,
    },
    badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
    quickActionText: { fontSize: 14, fontWeight: "600", letterSpacing: -0.1 },

    // Admin Card
    featuredCard: {
      width: 240,
      borderRadius: 20,
      borderWidth: 1,
      overflow: "hidden",
    },
    featuredImage: { width: "100%", height: 120 },
    featuredBadge: {
      position: "absolute",
      top: 10,
      left: 10,
      backgroundColor: "rgba(0,0,0,0.55)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    featuredBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
    featuredTitle: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
    featuredMeta: { fontSize: 12, marginTop: 3 },
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
