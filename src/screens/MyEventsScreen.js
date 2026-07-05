import React, { useState, useEffect, useCallback } from "react";
import Icon from "../components/Icon";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { formatISODate, formatEventTime } from "../utils/dateUtils";
import {
  filterUpcomingEvents,
  filterPastEvents,
  isEventPast,
} from "../utils/eventFilters";
import { getEventCreatorId } from "../utils/eventHelpers";
import { useFocusEffect } from "@react-navigation/native";
import RatingModal from "../components/RatingModal";
import { getUserRatingForEvent } from "../services/ratingService";

export default function MyEventsScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const [allEvents, setAllEvents] = useState([]);
  const [displayedEvents, setDisplayedEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get initial values from navigation params or use defaults
  const initialTab = route?.params?.initialTab || "joined";
  const initialSubTab = route?.params?.initialSubTab || "upcoming";

  const [activeTab, setActiveTab] = useState(initialTab); // joined | hosting
  const [timeFilter, setTimeFilter] = useState(initialSubTab); // upcoming | past
  const [currentUser, setCurrentUser] = useState(null);

  // Rating state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [ratedEvents, setRatedEvents] = useState({}); // { eventId: true }

  // Update tabs when navigation params change
  useEffect(() => {
    if (route?.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
    if (route?.params?.initialSubTab) {
      setTimeFilter(route.params.initialSubTab);
    }
  }, [route?.params]);

  // Load current user data once on mount
  useEffect(() => {
    loadCurrentUser();
  }, []);

  // Reload events every time screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (currentUser) {
        console.log("📱 MyEventsScreen focused - reloading events...");
        loadMyEvents();
      }
    }, [activeTab, currentUser])
  );

  useEffect(() => {
    applyTimeFilter();
  }, [timeFilter, allEvents]);

  // Check which events have been rated when viewing past joined events
  useEffect(() => {
    if (
      activeTab === "joined" &&
      timeFilter === "past" &&
      displayedEvents.length > 0
    ) {
      checkRatedEvents();
    }
  }, [displayedEvents, activeTab, timeFilter]);

  const loadCurrentUser = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) {
        setCurrentUser(userDoc.data());
      }
    } catch (error) {
      console.error("Error loading current user:", error);
    }
  };

  const checkRatedEvents = async () => {
    const rated = {};
    for (const event of displayedEvents) {
      const existingRating = await getUserRatingForEvent(event.id);
      if (existingRating) {
        rated[event.id] = existingRating.rating;
      }
    }
    setRatedEvents(rated);
  };

  // Sort events by date
  const sortEventsByDate = (eventsArray, ascending = true) => {
    return [...eventsArray].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return ascending ? dateA - dateB : dateB - dateA;
    });
  };

  const loadMyEvents = async () => {
    setLoading(true);
    try {
      let userEvents = [];

      if (activeTab === "hosting") {
        const hostingQuery = query(
          collection(db, "events"),
          where("creatorId", "==", auth.currentUser.uid)
        );
        const snapshot = await getDocs(hostingQuery);
        userEvents = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((event) => event.status !== "cancelled");
        console.log("📅 Hosting events:", userEvents.length);
      } else {
        // Only the events this user attends (server-side), not the whole
        // collection. attendees uses the canonical UID-string format.
        const joinedQuery = query(
          collection(db, "events"),
          where("attendees", "array-contains", auth.currentUser.uid)
        );
        const snapshot = await getDocs(joinedQuery);

        userEvents = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter(
            (event) =>
              event.status !== "cancelled" &&
              getEventCreatorId(event) !== auth.currentUser.uid
          );

        console.log("🎉 Joined events:", userEvents.length);
      }

      setAllEvents(userEvents);
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyTimeFilter = () => {
    if (timeFilter === "upcoming") {
      const upcoming = filterUpcomingEvents(allEvents);
      const sorted = sortEventsByDate(upcoming, true);
      console.log("📅 Upcoming:", sorted.length);
      setDisplayedEvents(sorted);
    } else {
      const past = filterPastEvents(allEvents);
      const sorted = sortEventsByDate(past, false);
      console.log("📦 Past:", sorted.length);
      setDisplayedEvents(sorted);
    }
  };

  const handleRateEvent = (event) => {
    setSelectedEvent(event);
    setShowRatingModal(true);
  };

  const handleRatingSuccess = (rating, comment) => {
    Alert.alert(
      "Thank you! ⭐",
      "Your feedback helps hosts improve their events.",
      [{ text: "OK" }]
    );
    // Update local state to show the rating
    setRatedEvents((prev) => ({ ...prev, [selectedEvent.id]: rating }));
  };

  const canHost = currentUser?.role === "host" || currentUser?.role === "admin";
  // Approved as host but hasn't chosen a type yet → send them to choose,
  // not to re-apply via RequestHost.
  const isApprovedPendingHostType = currentUser?.hostApproved && !canHost;
  const hostActionRoute = canHost
    ? "CreateEvent"
    : isApprovedPendingHostType
    ? "HostTypeSelection"
    : "RequestHost";

  const styles = createStyles(colors);

  const EventCard = ({ event }) => {
    const isPast = isEventPast(event.date);
    const showRateButton = activeTab === "joined" && isPast;
    const existingRating = ratedEvents[event.id];

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() =>
          navigation.navigate("EventDetail", { eventId: event.id })
        }
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.eventGlass,
            {
              backgroundColor: isPast
                ? `${colors.surfaceGlass}CC`
                : colors.surfaceGlass,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.eventHeader}>
            <View style={styles.badgesLeft}>
              <View
                style={[
                  styles.categoryBadge,
                  {
                    backgroundColor: `${colors.primary}26`,
                    borderColor: `${colors.primary}4D`,
                  },
                ]}
              >
                <Text style={[styles.categoryText, { color: colors.primary }]}>
                  {event.category || "Event"}
                </Text>
              </View>
              {event.isRecurring && (
                <View
                  style={[
                    styles.recurringBadge,
                    { backgroundColor: `${colors.primary}22` },
                  ]}
                >
                  <Text
                    style={[styles.recurringText, { color: colors.primary }]}
                  >
                    🔄
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
              {formatISODate(event.date)} •{" "}
              {formatEventTime(event.date, event.time)}
            </Text>
          </View>

          <Text
            style={[styles.eventTitle, { color: colors.text }]}
            numberOfLines={2}
          >
            {event.title || "Untitled Event"}
          </Text>

          <View style={styles.eventMeta}>
            <Icon name="location" size={14} color={colors.textSecondary} />
            <Text
              style={[styles.metaText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {event.location || "Location TBD"}
            </Text>
          </View>

          <View style={styles.attendeesRow}>
            <Text
              style={[styles.attendeesText, { color: colors.textSecondary }]}
            >
              {Array.isArray(event.attendees) ? event.attendees.length : 0}/
              {event.maxPeople || event.maxAttendees || 0} people
            </Text>
            <View style={styles.badgesRow}>
              {event.status === "published" && !isPast && (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>Active</Text>
                </View>
              )}
              {event.price > 0 && (
                <View style={styles.priceBadge}>
                  <Text style={styles.priceBadgeText}>${event.price}</Text>
                </View>
              )}
              {isPast && !showRateButton && (
                <View style={styles.endedBadge}>
                  <Text style={styles.endedBadgeText}>Ended</Text>
                </View>
              )}
            </View>
          </View>

          {/* Rate Button for past joined events */}
          {showRateButton && (
            <View style={styles.rateSection}>
              {existingRating ? (
                <View style={styles.ratedContainer}>
                  <View style={styles.ratedStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Icon name="star"
                        key={star}
                        size={16}
                        color={
                          star <= existingRating
                            ? "#FFD700"
                            : `${colors.text}30`
                        }
                        fill={
                          star <= existingRating ? "#FFD700" : "transparent"
                        }
                      />
                    ))}
                  </View>
                  <Text
                    style={[styles.ratedText, { color: colors.textSecondary }]}
                  >
                    You rated this event
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.rateButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleRateEvent(event);
                  }}
                >
                  <View
                    style={[
                      styles.rateButtonGlass,
                      {
                        backgroundColor: "rgba(255, 215, 0, 0.15)",
                        borderColor: "rgba(255, 215, 0, 0.3)",
                      },
                    ]}
                  >
                    <Icon name="star"
                      size={16}
                      color="#FFD700"
                      fill="#FFD700"
                    />
                    <Text style={styles.rateButtonText}>Rate this event</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Met signal (§2.4): past events roll into matching retention */}
          {showRateButton && (
            <TouchableOpacity
              style={[styles.metRow, { borderColor: colors.border }]}
              onPress={(e) => {
                e.stopPropagation();
                navigation.navigate("PeopleYouMet", { eventId: event.id });
              }}
            >
              <Icon name="community" size={16} color={colors.primary} />
              <Text style={[styles.metText, { color: colors.primary }]}>
                People you met here
              </Text>
              <Icon name="forward" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header — only when pushed (e.g. Manage → hosted events). As the
          Events tab root the AppHeader already provides title + actions. */}
      {route?.name === "MyEvents" && (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            My Events
          </Text>
          <View style={{ width: 28 }} />
        </View>
      )}

      {/* Main Tabs (Joined/Hosting) */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, !canHost && styles.tabFullWidth]}
          onPress={() => {
            setActiveTab("joined");
            setTimeFilter("upcoming");
          }}
        >
          <View
            style={[
              styles.tabGlass,
              {
                backgroundColor:
                  activeTab === "joined"
                    ? `${colors.primary}33`
                    : colors.surfaceGlass,
                borderColor:
                  activeTab === "joined"
                    ? `${colors.primary}66`
                    : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "joined"
                      ? colors.primary
                      : colors.textSecondary,
                },
              ]}
            >
              Joined
            </Text>
          </View>
        </TouchableOpacity>

        {canHost && (
          <TouchableOpacity
            style={styles.tab}
            onPress={() => {
              setActiveTab("hosting");
              setTimeFilter("upcoming");
            }}
          >
            <View
              style={[
                styles.tabGlass,
                {
                  backgroundColor:
                    activeTab === "hosting"
                      ? `${colors.primary}33`
                      : colors.surfaceGlass,
                  borderColor:
                    activeTab === "hosting"
                      ? `${colors.primary}66`
                      : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      activeTab === "hosting"
                        ? colors.primary
                        : colors.textSecondary,
                  },
                ]}
              >
                Hosting
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Time Filter Tabs (Upcoming/Past) */}
      <View style={styles.timeFiltersContainer}>
        <TouchableOpacity
          style={styles.timeFilterTab}
          onPress={() => setTimeFilter("upcoming")}
        >
          <View
            style={[
              styles.timeFilterGlass,
              {
                backgroundColor:
                  timeFilter === "upcoming"
                    ? `${colors.primary}1A`
                    : "transparent",
                borderBottomWidth: 2,
                borderBottomColor:
                  timeFilter === "upcoming" ? colors.primary : "transparent",
              },
            ]}
          >
            <Text
              style={[
                styles.timeFilterText,
                {
                  color:
                    timeFilter === "upcoming"
                      ? colors.primary
                      : colors.textSecondary,
                },
              ]}
            >
              Upcoming
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.timeFilterTab}
          onPress={() => setTimeFilter("past")}
        >
          <View
            style={[
              styles.timeFilterGlass,
              {
                backgroundColor:
                  timeFilter === "past" ? `${colors.primary}1A` : "transparent",
                borderBottomWidth: 2,
                borderBottomColor:
                  timeFilter === "past" ? colors.primary : "transparent",
              },
            ]}
          >
            <Text
              style={[
                styles.timeFilterText,
                {
                  color:
                    timeFilter === "past"
                      ? colors.primary
                      : colors.textSecondary,
                },
              ]}
            >
              Past
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : displayedEvents.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>
            {timeFilter === "past"
              ? "📦"
              : activeTab === "joined"
              ? "🎯"
              : "🌟"}
          </Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {timeFilter === "past"
              ? "No past events"
              : activeTab === "joined"
              ? "No upcoming events joined"
              : "No upcoming events created"}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {timeFilter === "past"
              ? "Events you've attended will appear here"
              : activeTab === "joined"
              ? "Explore events and join your first experience"
              : "Create an event to bring people together"}
          </Text>
          {timeFilter === "upcoming" && (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => {
                if (activeTab === "joined") {
                  navigation.navigate("SearchEvents");
                } else {
                  navigation.navigate(hostActionRoute);
                }
              }}
            >
              <View
                style={[
                  styles.emptyButtonGlass,
                  {
                    backgroundColor: `${colors.primary}33`,
                    borderColor: `${colors.primary}66`,
                  },
                ]}
              >
                <Text
                  style={[styles.emptyButtonText, { color: colors.primary }]}
                >
                  {activeTab === "joined"
                    ? "Explore Events"
                    : canHost
                    ? "Create Event"
                    : "Request Host"}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {displayedEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </ScrollView>
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

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    tabsContainer: {
      flexDirection: "row",
      paddingHorizontal: 24,
      marginBottom: 16,
      gap: 12,
    },
    tab: { flex: 1, borderRadius: 12, overflow: "hidden" },
    tabFullWidth: { flex: 1 },
    tabGlass: { borderWidth: 1, paddingVertical: 12, alignItems: "center" },
    tabText: { fontSize: 15, fontWeight: "600" },
    timeFiltersContainer: {
      flexDirection: "row",
      paddingHorizontal: 24,
      marginBottom: 20,
      gap: 0,
    },
    timeFilterTab: { flex: 1 },
    timeFilterGlass: {
      paddingVertical: 10,
      alignItems: "center",
    },
    timeFilterText: { fontSize: 14, fontWeight: "600" },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    eventCard: { marginBottom: 16, borderRadius: 16, overflow: "hidden" },
    eventGlass: { borderWidth: 1, padding: 16 },
    eventHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    badgesLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    categoryBadge: {
      paddingVertical: 4,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
    },
    categoryText: { fontSize: 11, fontWeight: "600" },
    recurringBadge: {
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 6,
    },
    recurringText: { fontSize: 10 },
    eventDate: { fontSize: 13, fontWeight: "600" },
    eventTitle: {
      fontSize: 17,
      fontWeight: "700",
      marginBottom: 10,
      letterSpacing: -0.3,
    },
    eventMeta: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
      gap: 6,
    },
    metaText: { fontSize: 13, flex: 1 },
    attendeesRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    attendeesText: { fontSize: 13, fontWeight: "600" },
    badgesRow: { flexDirection: "row", gap: 8 },
    statusBadge: {
      backgroundColor: "rgba(166, 255, 150, 0.15)",
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "rgba(166, 255, 150, 0.3)",
    },
    statusText: { fontSize: 11, fontWeight: "600", color: colors.success },
    priceBadge: {
      backgroundColor: "rgba(255, 204, 0, 0.15)",
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "rgba(255, 204, 0, 0.3)",
    },
    priceBadgeText: { fontSize: 11, fontWeight: "700", color: colors.brand },
    endedBadge: {
      backgroundColor: "rgba(255, 159, 10, 0.15)",
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "rgba(255, 159, 10, 0.3)",
    },
    endedBadgeText: { fontSize: 11, fontWeight: "600", color: colors.warning },

    // Rating section styles
    rateSection: {
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: "rgba(255, 255, 255, 0.08)",
    },
    metRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderTopWidth: 1,
      marginTop: 10,
      paddingTop: 10,
    },
    metText: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
    rateButton: {
      borderRadius: 10,
      overflow: "hidden",
    },
    rateButtonGlass: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderWidth: 1,
      gap: 8,
    },
    rateButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#FFD700",
    },
    ratedContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    ratedStars: {
      flexDirection: "row",
      gap: 2,
    },
    ratedText: {
      fontSize: 12,
      fontStyle: "italic",
    },

    emptyState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 40,
    },
    emptyEmoji: { fontSize: 64, marginBottom: 20 },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 10,
      letterSpacing: -0.3,
    },
    emptyText: {
      fontSize: 14,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 28,
    },
    emptyButton: { borderRadius: 12, overflow: "hidden" },
    emptyButtonGlass: {
      borderWidth: 1,
      paddingVertical: 14,
      paddingHorizontal: 32,
    },
    emptyButtonText: { fontSize: 15, fontWeight: "600" },
  });
}
