import React, { useState, useEffect, useCallback, useRef } from "react";
import { getGreetingKey } from "../utils/greeting";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { useMode } from "../contexts/ModeContext";
import { LinearGradient } from "expo-linear-gradient";
import { BRAND, ELEVATION } from "../constants/theme-tokens";
import { useFocusEffect } from "@react-navigation/native";
import BirthdayReminders from "../components/BirthdayReminders";
import FeaturedEventsRow from "../components/FeaturedEventsRow";
import { EVENT_CATEGORIES } from "../utils/eventCategories";
import Icon, { getCategoryIcon } from "../components/Icon";
import RatingModal from "../components/RatingModal";
import { getPendingRatings } from "../services/ratingService";
import GradientBackground from "../components/GradientBackground";
import { BVCard } from "../components/BoldPop";

// Home order: greeting → digest → search → Featured Events → Featured Services
// (KIN-185, always empty until that ticket wires it) → Rate experiences →
// Browse by community (+ host-mode Create FAB). KIN-184: Featured Events/
// Services replace the old organic "Events near you"/"Services near you"
// carousels (EventsRow/MarketplaceRow, no longer used here — see git history
// if reviving them). Each bar pushes the next one up and renders nothing
// when it has no content, so there's never a fixed gap for an absent
// section. Each carousel still owns its own loading/empty/error state (no
// cross-leaking). Admin Dashboard lives in Profile now.
export default function HomeScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const { isHosting } = useMode();
  const [user, setUser] = useState(null);

  // Rating nudge (rate past experiences)
  const [pendingRatingEvents, setPendingRatingEvents] = useState([]);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // KIN-150: pull-to-refresh — each carousel owns its own data/state, so
  // refreshing them from here goes through the imperative `reload()` each
  // exposes via ref, not by lifting their state up.
  const [refreshing, setRefreshing] = useState(false);
  const featuredEventsRowRef = useRef(null);

  // KIN-184: the organic "Events near you" / "Services near you" carousels
  // (EventsRow/MarketplaceRow) are replaced by up to three horizontal bars —
  // Featured Events, Featured Services, Browse by Community — that push up
  // when a bar above has nothing to show. This ticket builds the Events
  // side only; Featured Services (KIN-185) isn't built here — the slot
  // below is deliberately left so KIN-185 doesn't have to touch this
  // layout again, just populate setFeaturedServices from its own service.
  const [featuredServices] = useState([]);

  const loadUser = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) setUser(userDoc.data());
    } catch (error) {
      console.error("Error loading user:", error);
    }
  }, []);

  const loadPendingRatings = useCallback(async () => {
    try {
      setPendingRatingEvents(await getPendingRatings());
    } catch (error) {
      console.error("Error loading pending ratings:", error);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);
  useFocusEffect(
    useCallback(() => {
      loadUser();
      loadPendingRatings();
    }, [loadUser, loadPendingRatings]),
  );

  // KIN-150: manual escape hatch — bypasses each carousel's TTL and forces an
  // immediate refetch. Waits for every reload to actually finish (not just
  // fire) before dropping the spinner, so pull-to-refresh doesn't lie about
  // being done while a fetch is still in flight.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadUser(),
        loadPendingRatings(),
        featuredEventsRowRef.current?.reload(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadUser, loadPendingRatings]);

  const handleRateEvent = (event) => {
    setSelectedEvent(event);
    setShowRatingModal(true);
  };
  const handleRatingSuccess = () => {
    setPendingRatingEvents((prev) => prev.filter((e) => e.id !== selectedEvent.id));
    setShowRatingModal(false);
    setSelectedEvent(null);
  };

  const getGreeting = () => t(getGreetingKey(new Date().getHours()));
  const getUserDisplayName = () => {
    if (!user) return t("home.defaultName");
    return user.fullName || user.name || t("home.defaultName");
  };

  const isAdmin = user?.role === "admin";
  const isHost = user?.role === "host";
  const canCreateEvents = isAdmin || isHost;
  // KIN-184: same field precedence as the public user projection
  // (src/services/userService.js) — city, falling back to location.
  const userCity = user?.city || user?.location || undefined;

  const styles = createStyles(colors, isDark);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Tab root — AppHeader (toggle/✉/🔔) is provided by the tab navigator. */}
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
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
            {t("home.digestBanner")}
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
            {t("home.searchPlaceholder")}
          </Text>
        </TouchableOpacity>

        {/* Birthday reminders (social gifting Board 2a) — renders nothing if none */}
        <BirthdayReminders navigation={navigation} />

        {/* Featured Events (KIN-184) — paid placement, city-filtered; renders
            nothing when there's none. Gated on `user` so the city filter is
            never applied a beat late (city comes off the user doc). */}
        {user && <FeaturedEventsRow ref={featuredEventsRowRef} navigation={navigation} city={userCity} />}

        {/* Featured Services slot (KIN-185) — reserved so that ticket doesn't
            need to touch this layout; always empty until KIN-185 wires
            setFeaturedServices from its own service. */}
        {featuredServices.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitleInline, { color: colors.textTertiary }]}>
              {t("home.featuredServices.title")}
            </Text>
          </View>
        )}

        {/* Rate experiences — nudge to rate past events */}
        {pendingRatingEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              {t("home.rateExperiences")}
            </Text>
            {pendingRatingEvents.map((event) => {
              const eventDate = event.date ? new Date(event.date) : null;
              const dateStr = eventDate
                ? eventDate.toLocaleDateString(i18n.language, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : t("home.dateUnknown");
              return (
                <TouchableOpacity
                  key={event.id}
                  style={styles.ratingCard}
                  onPress={() => handleRateEvent(event)}
                  activeOpacity={0.8}
                >
                  <BVCard
                    shadow={false}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 16,
                      backgroundColor: isDark
                        ? "rgba(255, 215, 0, 0.10)"
                        : "rgba(255, 215, 0, 0.14)",
                      borderColor: "rgba(255, 215, 0, 0.4)",
                    }}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: "rgba(255, 215, 0, 0.15)" }]}>
                      <Icon name="star" size={22} color="#FFD700" fill="#FFD700" />
                    </View>
                    <View style={styles.cardContent}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {event.title}
                      </Text>
                      <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
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

        {/* Browse by Community */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitleInline, { color: colors.textTertiary }]}>
              {t("home.browseByCommunity")}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate("SearchEvents")}>
              <Text style={[styles.seeAll, { color: colors.primary }]}>
                {t("home.seeAll")}
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
                    navigation.navigate("SearchEvents", { category: category.label })
                  }
                  activeOpacity={0.7}
                >
                  <BVCard style={{ alignItems: "center", padding: 16 }}>
                    <View
                      style={[
                        styles.categoryIconCircle,
                        { backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}15` },
                      ]}
                    >
                      <CategoryIcon size={28} color={colors.primary} strokeWidth={1.8} />
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

    // Sections (rate experiences + browse by community)
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
    sectionTitleInline: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
    seeAll: { fontSize: 14, fontWeight: "600" },
    cardContent: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: "600", marginBottom: 2, letterSpacing: -0.2 },
    cardSubtitle: { fontSize: 13 },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    ratingCard: { marginHorizontal: 24, marginBottom: 10 },
    categoriesScroll: { paddingHorizontal: 24, gap: 12 },
    categoryCard: { width: 100 },
    categoryIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 10,
    },
    categoryName: { fontSize: 12, fontWeight: "600", letterSpacing: -0.1, textAlign: "center" },
  });
}
