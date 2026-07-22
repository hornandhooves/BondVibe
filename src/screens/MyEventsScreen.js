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
import { useTranslation } from "react-i18next";
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
import { formatMXN } from "../utils/pricing";
import {
  filterUpcomingEvents,
  filterPastEvents,
  isEventPast,
} from "../utils/eventFilters";
import { getEventCreatorId } from "../utils/eventHelpers";
import { useFocusEffect } from "@react-navigation/native";
import RatingModal from "../components/RatingModal";
import { getUserRatingForEvent } from "../services/ratingService";
import { getMyRosterEvents } from "../services/rosterService";
import {
  getUserMemberships,
  getMembershipState,
} from "../services/membershipService";
import * as ImagePicker from "expo-image-picker";
import { hasMyCheckin, shareRecapPhoto } from "../services/recapService";
import FeaturedCarousel from "../components/FeaturedCarousel";
import { getFeaturedEvents } from "../services/promotionService";

export default function MyEventsScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [allEvents, setAllEvents] = useState([]);
  const [displayedEvents, setDisplayedEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // T4a: single-axis Attending root — no more Joined/Hosting sub-tabs (hosting is
  // its own EventsTab root, ManageScreen). Only Upcoming/Past remains.
  const initialSubTab = route?.params?.initialSubTab || "upcoming";

  const [timeFilter, setTimeFilter] = useState(initialSubTab); // upcoming | past
  const [currentUser, setCurrentUser] = useState(null);
  const [popularEvents, setPopularEvents] = useState([]);

  // Rating state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [ratedEvents, setRatedEvents] = useState({}); // { eventId: true }
  const [checkedInEvents, setCheckedInEvents] = useState({}); // { eventId: true }
  const [activeMembershipCount, setActiveMembershipCount] = useState(0);

  // Update time filter when navigation params change
  useEffect(() => {
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
    }, [currentUser])
  );

  // Popular events for the Discover carousel (F1) — featured/public upcoming.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const feat = await getFeaturedEvents(10);
          setPopularEvents(
            (feat || []).filter((e) => getEventCreatorId(e) !== auth.currentUser?.uid),
          );
        } catch (e) {
          setPopularEvents([]);
        }
      })();
    }, [])
  );

  // Keep the attendee's membership summary fresh (credits/passes live here now,
  // moved out of Profile). Cheap single query, refreshed on focus.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const mems = await getUserMemberships();
          setActiveMembershipCount(
            mems.filter((m) => getMembershipState(m) === "active").length
          );
        } catch (e) {
          // ignore — the entry still links to the full screen
        }
      })();
    }, [])
  );

  useEffect(() => {
    applyTimeFilter();
  }, [timeFilter, allEvents]);

  // Check which events have been rated when viewing past events
  useEffect(() => {
    if (timeFilter === "past" && displayedEvents.length > 0) {
      checkRatedEvents();
    }
  }, [displayedEvents, timeFilter]);

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
    const checkedIn = {};
    for (const event of displayedEvents) {
      const [existingRating, wasCheckedIn] = await Promise.all([
        getUserRatingForEvent(event.id),
        hasMyCheckin(event.id),
      ]);
      if (existingRating) {
        rated[event.id] = existingRating.rating;
      }
      if (wasCheckedIn) {
        checkedIn[event.id] = true;
      }
    }
    setRatedEvents(rated);
    setCheckedInEvents(checkedIn);
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
      // ROSTER (fix/privacy-event-roster): the events this user attends now come
      // from their gated roster docs (collectionGroup), not the array.
      const userEventDocs = await getMyRosterEvents();

      const userEvents = userEventDocs
        .map((event) => ({ ...event }))
        .filter(
          (event) =>
            event.status !== "cancelled" &&
            getEventCreatorId(event) !== auth.currentUser.uid
        );

      console.log("🎉 Joined events:", userEvents.length);
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
      t("myEvents.thankYouTitle"),
      t("myEvents.thankYouMsg"),
      [{ text: t("myEvents.ok") }]
    );
    // Update local state to show the rating
    setRatedEvents((prev) => ({ ...prev, [selectedEvent.id]: rating }));
  };

  // Recap moments (§10): checked-in attendees share a photo — uploading is
  // the consent (shared with everyone who attended).
  const handleShareMoment = async (event) => {
    const checkedIn = await hasMyCheckin(event.id);
    if (!checkedIn) {
      Alert.alert(
        t("myEvents.checkInRequiredTitle"),
        t("myEvents.checkInRequiredMsg")
      );
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    try {
      await shareRecapPhoto(event.id, result.assets[0].uri);
      Alert.alert(
        t("myEvents.momentSharedTitle"),
        t("myEvents.momentSharedMsg")
      );
    } catch (e) {
      Alert.alert(t("myEvents.couldntShareTitle"), e.message || t("myEvents.couldntShareMsg"));
    }
  };

  const styles = createStyles(colors);

  const EventCard = ({ event }) => {
    const isPast = isEventPast(event.date);
    const showRateButton = isPast && !!checkedInEvents[event.id];
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
                  {event.category || t("myEvents.event")}
                </Text>
              </View>
              {event.isRecurring && (
                <View
                  style={[
                    styles.recurringBadge,
                    { backgroundColor: `${colors.primary}22` },
                  ]}
                >
                  <Icon name="repeat" size={10} color={colors.primary} />
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
            {event.title || t("myEvents.untitledEvent")}
          </Text>

          <View style={styles.eventMeta}>
            <Icon name="location" size={14} color={colors.textSecondary} />
            <Text
              style={[styles.metaText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {/* F2: gated → area (never the venue); legacy → location. */}
              {event.area || event.approxCoords
                ? event.area || t("eventLocation.approxArea")
                : event.location || t("myEvents.locationTBD")}
            </Text>
            {(event.area || event.approxCoords) && (
              <Icon name="lock" size={11} color={colors.textTertiary} style={{ marginLeft: 4 }} />
            )}
          </View>

          <View style={styles.attendeesRow}>
            <Text
              style={[styles.attendeesText, { color: colors.textSecondary }]}
            >
              {t("myEvents.peopleCount", {
                count: event.participantCount || 0,
                max: event.maxPeople || event.maxAttendees || 0,
              })}
            </Text>
            <View style={styles.badgesRow}>
              {event.status === "published" && !isPast && (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{t("myEvents.active")}</Text>
                </View>
              )}
              {event.price > 0 && (
                <View style={styles.priceBadge}>
                  <Text style={styles.priceBadgeText}>{formatMXN(event.price)}</Text>
                </View>
              )}
              {isPast && !showRateButton && (
                <View style={styles.endedBadge}>
                  <Text style={styles.endedBadgeText}>{t("myEvents.ended")}</Text>
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
                    {t("myEvents.youRated")}
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
                    <Text style={styles.rateButtonText}>{t("myEvents.rateThisEvent")}</Text>
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
                {t("myEvents.peopleYouMetHere")}
              </Text>
              <Icon name="forward" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}

          {/* Recap moment (§10): share a photo into the event recap */}
          {showRateButton && (
            <TouchableOpacity
              style={[styles.metRow, { borderColor: colors.border }]}
              onPress={(e) => {
                e.stopPropagation();
                handleShareMoment(event);
              }}
            >
              <Icon name="camera" size={16} color={colors.primary} />
              <Text style={[styles.metText, { color: colors.primary }]}>
                {t("myEvents.shareAMoment")}
              </Text>
              <Text style={[styles.metHint, { color: colors.textTertiary }]}>
                {t("myEvents.seenByAttendees")}
              </Text>
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
            {t("myEvents.headerTitle")}
          </Text>
          <View style={{ width: 28 }} />
        </View>
      )}

      {/* T4a: fixed Discover bar → search (F1). */}
      <TouchableOpacity
        style={[styles.discoverBar, { backgroundColor: colors.primary }]}
        onPress={() => navigation.navigate("SearchEvents")}
        activeOpacity={0.9}
        testID="discover-bar"
      >
        <Icon name="search" size={18} color={colors.onPrimary || "#fff"} />
        <Text style={[styles.discoverText, { color: colors.onPrimary || "#fff" }]}>
          {t("myEvents.discoverNearYou")}
        </Text>
        <Icon name="forward" size={18} color={colors.onPrimary || "#fff"} />
      </TouchableOpacity>

      {/* T4a: image-forward "Popular" carousel (F1). */}
      {popularEvents.length > 0 && (
        <View style={styles.popularSection}>
          <Text style={[styles.popularLabel, { color: colors.text }]}>{t("myEvents.popular")}</Text>
          <FeaturedCarousel
            events={popularEvents}
            onPressEvent={(ev) => navigation.navigate("EventDetail", { eventId: ev.id })}
          />
        </View>
      )}

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
              {t("myEvents.upcoming")}
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
              {t("myEvents.past")}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* My Memberships — credits & passes the attendee holds (moved here from
          Profile so they live alongside the events they're used for). */}
      <TouchableOpacity
          style={[
            styles.membershipsEntry,
            { borderColor: colors.border, backgroundColor: colors.surfaceGlass },
          ]}
          onPress={() => navigation.navigate("MyMemberships")}
          activeOpacity={0.85}
          testID="my-memberships-entry"
        >
          <View style={[styles.membershipsIcon, { backgroundColor: colors.brandSoft }]}>
            <Icon name="ticket" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.membershipsTitle, { color: colors.text }]}>
              {t("myEvents.memberships.title")}
            </Text>
            <Text style={[styles.membershipsSub, { color: colors.textSecondary }]}>
              {activeMembershipCount > 0
                ? t("myEvents.memberships.activeCount", { count: activeMembershipCount })
                : t("myEvents.memberships.subtitle")}
            </Text>
          </View>
          <Icon name="forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : displayedEvents.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyArt}>
            <Icon name={timeFilter === "past" ? "archive" : "ticket"} size={36} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {timeFilter === "past" ? t("myEvents.empty.noPast") : t("myEvents.empty.noUpcomingJoined")}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {timeFilter === "past" ? t("myEvents.empty.pastText") : t("myEvents.empty.joinedText")}
          </Text>
          {timeFilter === "upcoming" && (
            <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate("SearchEvents")}>
              <View
                style={[
                  styles.emptyButtonGlass,
                  { backgroundColor: `${colors.primary}33`, borderColor: `${colors.primary}66` },
                ]}
              >
                <Text style={[styles.emptyButtonText, { color: colors.primary }]}>
                  {t("myEvents.empty.exploreEvents")}
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
    discoverBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 24,
      marginBottom: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
    },
    discoverText: { flex: 1, fontSize: 15, fontWeight: "700" },
    popularSection: { marginBottom: 12 },
    popularLabel: { fontSize: 15, fontWeight: "800", paddingHorizontal: 24, marginBottom: 10, letterSpacing: -0.2 },
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
    membershipsEntry: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: 24,
      marginBottom: 16,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
    },
    membershipsIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    membershipsTitle: { fontSize: 15, fontWeight: "700" },
    membershipsSub: { fontSize: 13, marginTop: 2 },
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
      alignItems: "center",
      justifyContent: "center",
    },
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
    metHint: { fontSize: 11 },
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
    emptyArt: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
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
