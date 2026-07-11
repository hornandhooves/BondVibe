import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { formatISODate, formatEventTime } from "../utils/dateUtils";
import { formatMXN } from "../utils/pricing";
import {
  EVENT_CATEGORIES,
  normalizeCategory,
  getCategoryLabel,
} from "../utils/eventCategories";
import { locationMatchesFilter } from "../utils/locations";
import useCities from "../hooks/useCities";
import { EVENT_LANGUAGES } from "../utils/eventCategories";
import { isEventPast } from "../utils/eventFilters";
import { useFocusEffect } from "@react-navigation/native";
import Icon, { getCategoryIcon } from "../components/Icon";
import DateTimePicker from "@react-native-community/datetimepicker";
import EventMap from "../components/search/EventMap";
import ListMapToggle from "../components/search/ListMapToggle";
import EventFilters, { activeFilterCount } from "../components/search/EventFilters";
import FiltersSheet from "../components/search/FiltersSheet";

const PAGE_SIZE = 20;
const mapEventDocs = (docs) =>
  docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => e.status !== "cancelled")
    // BUG 27: honor the host's "List event publicly" toggle. Only events
    // explicitly opted out (listedPublicly === false) are hidden from
    // discovery; legacy docs without the field stay listed.
    .filter((e) => e.listedPublicly !== false);

export default function SearchEventsScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { cities: LOCATIONS } = useCities({ includeAll: true });
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("list"); // F1: "list" | "map" (default list)
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  // Pagination cursor over the server-side base query.
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Debounced server-side search token (longest word/prefix of the query).
  const [searchToken, setSearchToken] = useState(null);

  // ✅ FIX: Properly handle category from route params
  // route.params?.category comes as label (e.g., "Social", "Sports")
  const getInitialCategory = () => {
    const paramCategory = route.params?.category;
    if (!paramCategory) return "all";

    // Find category by label and return its id
    const found = EVENT_CATEGORIES.find(
      (c) => c.label.toLowerCase() === paramCategory.toLowerCase(),
    );
    return found?.id || "all";
  };

  const [selectedCategory, setSelectedCategory] =
    useState(getInitialCategory());
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState(
    EVENT_LANGUAGES.map((l) => l.id),
  );
  // Date range filter (same day in both = a specific date).
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [datePicker, setDatePicker] = useState(null); // "from" | "to" | null

  // ✅ FIX: Update selected category when route params change
  useEffect(() => {
    const newCategory = getInitialCategory();
    console.log(
      "📂 Route category param:",
      route.params?.category,
      "-> id:",
      newCategory,
    );
    setSelectedCategory(newCategory);
  }, [route.params?.category]);

  // Create categories array with "All" option
  const categoryOptions = [{ id: "all", label: t("searchEvents.allLabel") }, ...EVENT_CATEGORIES];

  // Sort events by date (soonest first)
  const sortEventsByDate = (eventsArray) => {
    return [...eventsArray].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });
  };

  // Server-side base query: upcoming events (or within the chosen date range),
  // ordered by date. Date filtering is server-side here; the remaining filters
  // (category/price/language/location/text) run client-side over loaded pages.
  const baseConstraints = useCallback(() => {
    const dayStart = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const todayStart = dayStart(new Date());
    const lower =
      dateFrom && dayStart(dateFrom) > todayStart
        ? dayStart(dateFrom)
        : todayStart;
    const constraints = [];
    if (searchToken) {
      constraints.push(where("searchKeywords", "array-contains", searchToken));
    }
    constraints.push(where("date", ">=", lower.toISOString()));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      constraints.push(where("date", "<=", end.toISOString()));
    }
    constraints.push(orderBy("date", "asc"));
    return constraints;
  }, [dateFrom, dateTo, searchToken]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "events"), ...baseConstraints(), limit(PAGE_SIZE)),
      );
      setEvents(mapEventDocs(snap.docs));
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  }, [baseConstraints]);

  const loadMore = async () => {
    if (loadingMore || loading || !hasMore || !lastDoc) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "events"),
          ...baseConstraints(),
          startAfter(lastDoc),
          limit(PAGE_SIZE),
        ),
      );
      setEvents((prev) => [...prev, ...mapEventDocs(snap.docs)]);
      setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error loading more events:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Reload first page on focus and whenever the date range changes
  // (loadEvents identity changes with the date bounds).
  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  // Apply client-side filters over the loaded pages.
  useEffect(() => {
    filterEvents();
  }, [
    searchQuery,
    selectedCategory,
    selectedLocation,
    priceFilter,
    languageFilter,
    dateFrom,
    dateTo,
    events,
  ]);

  // Debounce the text query into a server-side search token (longest prefix).
  useEffect(() => {
    const timer = setTimeout(() => {
      const tokens = searchQuery
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 2)
        .sort((a, b) => b.length - a.length);
      setSearchToken(tokens[0] || null);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-load more when an active filter leaves the visible list sparse.
  useEffect(() => {
    if (!loading && !loadingMore && hasMore && filteredEvents.length < 8) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEvents.length, hasMore, loading, loadingMore]);

  const filterEvents = () => {
    let filtered = events;

    // ✅ FIX: Filter by category using id comparison
    if (selectedCategory !== "all") {
      filtered = filtered.filter((event) => {
        const normalizedEventCategory = event.category?.toLowerCase().trim();
        return normalizedEventCategory === selectedCategory;
      });
      console.log(
        `🏷️ Filtering by category: ${selectedCategory}, found: ${filtered.length}`,
      );
    }

    // Price filter
    if (priceFilter === "free") {
      filtered = filtered.filter((e) => !e.price || e.price === 0);
      console.log(`💰 Filtering free events, found: ${filtered.length}`);
    } else if (priceFilter === "paid") {
      filtered = filtered.filter((e) => e.price && e.price > 0);
      console.log(`💰 Filtering paid events, found: ${filtered.length}`);
    }

    // Language filter - skips if all languages are selected, equivalent to "All"
    if (languageFilter.length < EVENT_LANGUAGES.length) {
      filtered = filtered.filter(
        (e) =>
          Array.isArray(e.languages)
            ? e.languages.some((lang) => languageFilter.includes(lang))
            : true, // eventos viejos sin el campo no se excluyen
      );
      console.log(
        `🌐 Filtering by language: ${languageFilter}, found: ${filtered.length}`,
      );
    }

    // Filter by location
    if (selectedLocation !== "all") {
      filtered = filtered.filter((event) =>
        locationMatchesFilter(event.city, selectedLocation),
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(query) ||
          event.location.toLowerCase().includes(query) ||
          (event.category?.toLowerCase() || "").includes(query),
      );
    }

    // Filter by date range (inclusive). Same day in both = a specific date.
    if (dateFrom) {
      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(
        (e) => new Date(e.date).getTime() >= start.getTime(),
      );
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(
        (e) => new Date(e.date).getTime() <= end.getTime(),
      );
    }

    setFilteredEvents(sortEventsByDate(filtered));
  };

  // ✅ FIX: Handle category selection - now uses id directly
  const handleCategoryChange = (categoryId) => {
    console.log("🔄 Category changed to:", categoryId);
    setSelectedCategory(categoryId);
  };

  // Filter props shared by List (inline) and Map (FiltersSheet).
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedLocation("all");
    setSelectedCategory("all");
    setPriceFilter("all");
    setLanguageFilter(EVENT_LANGUAGES.map((l) => l.id));
    setDateFrom(null);
    setDateTo(null);
  };
  const filterProps = {
    searchQuery,
    setSearchQuery,
    selectedLocation,
    setSelectedLocation,
    locations: LOCATIONS,
    selectedCategory,
    onCategoryChange: handleCategoryChange,
    categoryOptions,
    priceFilter,
    setPriceFilter,
    languageFilter,
    setLanguageFilter,
    dateFrom,
    dateTo,
    setDatePicker,
    onClearDates: () => {
      setDateFrom(null);
      setDateTo(null);
    },
  };
  const activeCount = activeFilterCount({
    searchQuery,
    selectedLocation,
    selectedCategory,
    priceFilter,
    languageFilter,
    dateFrom,
    dateTo,
  });

  const styles = createStyles(colors);

  const EventCard = ({ event }) => {
    const isPast = isEventPast(event.date);
    const CategoryIcon = getCategoryIcon(event.category);

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
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
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
                <CategoryIcon
                  size={14}
                  color={colors.primary}
                  strokeWidth={2}
                />
                <Text style={[styles.categoryText, { color: colors.primary }]}>
                  {getCategoryLabel(event.category)}
                </Text>
              </View>
              {event.isRecurring && (
                <View
                  style={[
                    styles.recurringBadge,
                    { backgroundColor: `${colors.primary}22` },
                  ]}
                >
                  <Icon
                    name="repeat"
                    size={12}
                    color={colors.primary}
                    type="ui"
                  />
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
            {event.title}
          </Text>

          <View style={styles.eventMeta}>
            <Icon
              name="location"
              size={14}
              color={colors.textSecondary}
              type="ui"
            />
            <Text
              style={[styles.metaText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {event.location}
            </Text>
          </View>

          <View style={styles.attendeesRow}>
            <View style={styles.attendeesInfo}>
              <Icon
                name="users"
                size={14}
                color={colors.textSecondary}
                type="ui"
              />
              <Text
                style={[styles.attendeesText, { color: colors.textSecondary }]}
              >
                {event.attendees?.length || 0}/
                {event.maxAttendees || event.maxPeople || 0}
              </Text>
            </View>
            <View style={styles.badgesRow}>
              {event.price === 0 && (
                <View style={styles.freeBadge}>
                  <Text style={styles.freeBadgeText}>{t("searchEvents.free_badge")}</Text>
                </View>
              )}
              {event.price > 0 && (
                <View style={styles.priceBadge}>
                  <Text style={styles.priceBadgeText}>{formatMXN(event.price)}</Text>
                </View>
              )}
              {isPast && (
                <View style={styles.endedBadge}>
                  <Text style={styles.endedBadgeText}>{t("searchEvents.ended")}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Get current category label for header
  const getCurrentCategoryLabel = () => {
    if (selectedCategory === "all") return t("searchEvents.headerAll");
    const cat = EVENT_CATEGORIES.find((c) => c.id === selectedCategory);
    return cat?.label || t("myEvents.event");
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={28} color={colors.text} type="ui" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {selectedCategory !== "all"
            ? getCurrentCategoryLabel()
            : t("searchEvents.headerAll")}
        </Text>
        <ListMapToggle value={viewMode} onChange={setViewMode} />
      </View>

      {viewMode === "map" ? (
        <EventMap
          events={filteredEvents}
          navigation={navigation}
          currentUid={auth.currentUser?.uid}
          activeFilterCount={activeCount}
          onOpenFilters={() => setFiltersSheetOpen(true)}
        />
      ) : (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={400}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - 400
          ) {
            loadMore();
          }
        }}
      >
        {/* Filters (shared with the Map-mode FiltersSheet) */}
        <EventFilters {...filterProps} />

        {/* Results Header */}
        <View style={styles.resultsHeader}>
          <Text style={[styles.resultsTitle, { color: colors.text }]}>
            {t("searchEvents.eventsFound", { count: filteredEvents.length })}
          </Text>
          <Text
            style={[styles.resultsSubtitle, { color: colors.textTertiary }]}
          >
            {t("searchEvents.sortedByDate")}
          </Text>
        </View>

        {/* Events List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon
              name="search"
              size={64}
              color={colors.textTertiary}
              type="ui"
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {t("searchEvents.noEventsFound")}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t("searchEvents.adjustFilters")}
            </Text>
          </View>
        ) : (
          <>
            {filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
            {loadingMore && (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
          </>
        )}
      </ScrollView>
      )}

      {/* Filters sheet (Map mode) — the SAME controls as List. */}
      <FiltersSheet
        visible={filtersSheetOpen}
        onClose={() => setFiltersSheetOpen(false)}
        count={activeCount}
        onReset={resetFilters}
      >
        <EventFilters {...filterProps} />
      </FiltersSheet>

      {/* Date pickers at screen level so they work from the list AND the sheet. */}
      {datePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={(datePicker === "from" ? dateFrom : dateTo) || new Date()}
          mode="date"
          display="default"
          onChange={(event, selected) => {
            setDatePicker(null);
            if (event.type === "set" && selected) {
              if (datePicker === "from") setDateFrom(selected);
              else setDateTo(selected);
            }
          }}
        />
      )}
      {Platform.OS === "ios" && (
        <Modal
          visible={!!datePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setDatePicker(null)}
        >
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerModal, { backgroundColor: isDark ? "#1a1a2e" : "#ffffff" }]}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setDatePicker(null)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                    {t("searchEvents.cancel")}
                  </Text>
                </TouchableOpacity>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {datePicker === "from" ? t("searchEvents.from") : t("searchEvents.to")}
                </Text>
                <TouchableOpacity onPress={() => setDatePicker(null)}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("searchEvents.done")}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={(datePicker === "from" ? dateFrom : dateTo) || new Date()}
                mode="date"
                display="spinner"
                textColor={colors.text}
                themeVariant={isDark ? "dark" : "light"}
                onChange={(_e, selected) => {
                  if (selected) {
                    if (datePicker === "from") setDateFrom(selected);
                    else setDateTo(selected);
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      )}
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
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3, flex: 1, marginLeft: 12 },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 20,
      gap: 12,
    },
    searchInput: { flex: 1, fontSize: 15 },
    resultsHeader: { marginBottom: 20 },
    resultsTitle: {
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.3,
      marginBottom: 4,
    },
    resultsSubtitle: {
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    loadingContainer: { paddingVertical: 60, alignItems: "center" },
    footerLoader: { paddingVertical: 20, alignItems: "center" },
    pickerOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    pickerModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
    pickerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(127,127,127,0.3)",
    },
    eventCard: { marginBottom: 16, borderRadius: 20, overflow: "hidden" },
    eventGlass: { borderWidth: 1, padding: 16, borderRadius: 20 },
    eventHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    badgesLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
    categoryBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
    categoryText: { fontSize: 11, fontWeight: "600" },
    recurringBadge: {
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 6,
    },
    eventDate: { fontSize: 12, fontWeight: "600" },
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
    attendeesInfo: { flexDirection: "row", alignItems: "center", gap: 6 },
    attendeesText: { fontSize: 13, fontWeight: "600" },
    badgesRow: { flexDirection: "row", gap: 8 },
    freeBadge: {
      backgroundColor: "rgba(166, 255, 150, 0.15)",
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "rgba(166, 255, 150, 0.3)",
    },
    freeBadgeText: { fontSize: 11, fontWeight: "600", color: colors.success },
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
    emptyState: { paddingVertical: 60, alignItems: "center", gap: 12 },
    emptyTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    emptyText: { fontSize: 14, textAlign: "center" },
    filtersRow: {
      flexDirection: "row",
      marginBottom: 8,
      gap: 12,
    },
    filterDropdown: {
      flex: 1,
    },
    dateFilterLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
    dateFilterBtn: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    clearDates: { alignSelf: "flex-start", paddingVertical: 4, marginBottom: 8 },
  });
}
