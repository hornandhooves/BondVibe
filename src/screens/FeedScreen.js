/**
 * FeedScreen — the Wall tab: Smart Wall (AI-ranked events with "why you're
 * seeing this") fused with the social feed (posts from people you follow).
 * AI unavailable / opted out → plain chronological feed, never fake output.
 */
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { collection, getDocs, query, limit, doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import Icon from "../components/Icon";
import GradientBackground from "../components/GradientBackground";
import PostCard from "../components/PostCard";
import AICard, { AIText } from "../components/AICard";
import AILoadingCard from "../components/AILoadingCard";
import WhyPill from "../components/WhyPill";
import { AvatarDisplay } from "../components/AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { getFeed } from "../services/postService";
import { followUser, unfollowUser } from "../services/followService";
import useClaude from "../hooks/useClaude";
import useAiOptIn from "../hooks/useAiOptIn";
import { toggleInterested } from "../services/signalsService";
import WallTabs from "../components/wall/WallTabs";
import DiscoverTab from "../components/wall/DiscoverTab";
import { TYPE, SPACING, RADII, ELEVATION } from "../constants/theme-tokens";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

const WALL_CACHE_TTL_MS = 90 * 60 * 1000; // §10: cache ranking per session

/** Smart Wall header: digest AICard + top ranked event cards with WhyPill. */
function SmartWallHeader({ navigation }) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const { aiOptIn } = useAiOptIn();
  const { data, loading, fallback } = useClaude(
    "smart_wall",
    {},
    { enabled: aiOptIn, cacheKey: "smart_wall", ttlMs: WALL_CACHE_TTL_MS }
  );
  const [events, setEvents] = useState({}); // eventId -> event data
  const [interestedMap, setInterestedMap] = useState({}); // eventId -> uids after toggle

  const top = (data?.feed || []).slice(0, 5);

  useEffect(() => {
    let alive = true;
    (async () => {
      const missing = top.filter((i) => !events[i.eventId]);
      if (missing.length === 0) return;
      const fetched = {};
      await Promise.all(
        missing.map(async (i) => {
          try {
            const snap = await getDoc(doc(db, "events", i.eventId));
            if (snap.exists()) fetched[i.eventId] = snap.data();
          } catch {
            // skip
          }
        })
      );
      if (alive && Object.keys(fetched).length) {
        setEvents((prev) => ({ ...prev, ...fetched }));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!aiOptIn) return null; // plain feed, no AI chrome
  if (loading) return <AILoadingCard style={sw.block} />;
  if (fallback || !data) {
    // Model unavailable → soft note, plain feed below (never fake output).
    return (
      <Text style={[TYPE.caption, sw.fallbackNote, { color: colors.textTertiary }]}>
        {t("wall.aiFallbackNote")}
      </Text>
    );
  }

  return (
    <View style={sw.block}>
      <AICard eyebrow={t("wall.curatedForYou")}>
        <AIText>{data.digest.text}</AIText>
      </AICard>
      {top.map((item) => {
        const ev = events[item.eventId];
        if (!ev) return null;
        const when = ev.date
          ? new Date(ev.date).toLocaleDateString(i18n.language, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })
          : "";
        const interested = (interestedMap[item.eventId] ?? ev.interested ?? []).includes(
          auth.currentUser?.uid
        );
        return (
          <View
            key={item.eventId}
            style={[sw.card, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <WhyPill reason={item.reason} />
            <Text style={[TYPE.title, { color: colors.text }]} numberOfLines={2}>
              {ev.title}
            </Text>
            <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
              {when}
              {ev.city ? ` · ${ev.city}` : ""}
            </Text>
            {/* Signals row (§2.4): Going · Interested — no likes */}
            <View style={sw.signals}>
              <TouchableOpacity
                style={[sw.cta, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate("EventDetail", { eventId: item.eventId })}
                activeOpacity={0.85}
              >
                <Text style={[TYPE.label, sw.ctaText]}>{t("wall.imIn")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  sw.interestBtn,
                  interested
                    ? { backgroundColor: colors.brandSoft, borderColor: colors.primary }
                    : { borderColor: colors.border },
                ]}
                onPress={async () => {
                  const next = await toggleInterested(item.eventId, interested).catch(() => interested);
                  setInterestedMap((prev) => ({
                    ...prev,
                    [item.eventId]: next
                      ? [...(ev.interested || []), auth.currentUser?.uid]
                      : (ev.interested || []).filter((u) => u !== auth.currentUser?.uid),
                  }));
                }}
                activeOpacity={0.8}
              >
                <Icon
                  name="star"
                  size={14}
                  color={interested ? colors.primary : colors.textTertiary}
                />
                <Text
                  style={[TYPE.label, { color: interested ? colors.primary : colors.textSecondary }]}
                >
                  {t("wall.interested")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const sw = StyleSheet.create({
  block: { gap: SPACING.md, marginBottom: SPACING.lg },
  fallbackNote: { textAlign: "center", marginBottom: SPACING.md },
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    padding: SPACING.card,
    gap: SPACING.sm,
  },
  cta: {
    alignSelf: "flex-start",
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  ctaText: { color: "#FFFFFF" },
  signals: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  interestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
});

export default function FeedScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  // Wall v2 (P0): 0 = Para ti · 1 = Siguiendo · 2 = Descubre.
  const [tab, setTab] = useState(0);
  const WALL_TABS = [
    { key: "forYou", label: t("wall.tabs.forYou"), accent: colors.primary },
    { key: "following", label: t("wall.tabs.following"), accent: "#1F8A6E" },
    { key: "discover", label: t("wall.tabs.discover"), accent: colors.primary },
  ];

  const loadSuggestions = useCallback(async () => {
    try {
      const me = auth.currentUser?.uid;
      const snap = await getDocs(
        query(collection(db, "users"), limit(20))
      );
      const candidates = snap.docs
        .filter((d) => d.id !== me)
        .slice(0, 5)
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.fullName || data.name || t("wall.defaultUserName"),
            avatar: data.avatar,
            following: false,
          };
        });
      setSuggestions(candidates);
    } catch {
      // ignore
    }
  }, []);

  const load = useCallback(async () => {
    const fetched = await getFeed();
    setPosts(fetched);
    if (fetched.length === 0) await loadSuggestions();
    setLoading(false);
  }, [loadSuggestions]);

  const toggleFollow = (person) => {
    setSuggestions((prev) =>
      prev.map((p) => (p.id === person.id ? { ...p, following: !p.following } : p))
    );
    if (person.following) unfollowUser(person.id);
    else followUser(person.id);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      {/* Tab root — the AppHeader (✉/🔔) is provided by the tab navigator.
          Contextual "+" = compose (§1.2) · sparkle = Ask Kinlo (§1.6). */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.askPill, { backgroundColor: colors.brandSoft }]}
          onPress={() => navigation.navigate("AskKinlo")}
          hitSlop={hit}
          testID="wall-ask-kinlo"
        >
          <Icon name="ai" size={14} color={colors.primary} />
          <Text style={[styles.askPillText, { color: colors.primary }]}>{t("wall.askKinlo")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate("CreatePost")} hitSlop={hit}>
          <Icon name="add" size={26} color={colors.text} />
        </TouchableOpacity>
      </View>

      <WallTabs tabs={WALL_TABS} active={tab} onChange={setTab} />

      {tab === 2 ? (
        // Descubre — affinity discovery (P1 fills this; P0 shows the honest stub).
        <DiscoverTab navigation={navigation} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PostCard post={item} navigation={navigation} onChanged={load} />
          )}
          // "Para ti" gets the Smart Wall header; "Siguiendo" is the plain
          // chronological feed (getFeed) — identical to today, no AI chrome.
          ListHeaderComponent={tab === 0 ? <SmartWallHeader navigation={navigation} /> : null}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
          }
          ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Icon name="community" size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t("wall.empty.text")}
              </Text>
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate("CreatePost")}
              >
                <Text style={styles.ctaText}>{t("wall.empty.cta")}</Text>
              </TouchableOpacity>

              {suggestions.length > 0 && (
                <View style={styles.suggestSection}>
                  <Text style={[styles.suggestTitle, { color: colors.text }]}>
                    {t("wall.empty.suggestTitle")}
                  </Text>
                  {suggestions.map((p) => (
                    <View
                      key={p.id}
                      style={[styles.suggestRow, { borderColor: colors.border }]}
                    >
                      <TouchableOpacity
                        onPress={() =>
                          navigation.navigate("UserProfile", { userId: p.id })
                        }
                      >
                        <AvatarDisplay avatar={normAvatar(p.avatar)} size={42} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() =>
                          navigation.navigate("UserProfile", { userId: p.id })
                        }
                      >
                        <Text
                          style={[styles.suggestName, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggleFollow(p)}
                        style={[
                          styles.followBtn,
                          p.following
                            ? { borderColor: colors.border }
                            : {
                                backgroundColor: colors.primary,
                                borderColor: colors.primary,
                              },
                        ]}
                      >
                        <Text
                          style={[
                            styles.followText,
                            { color: p.following ? colors.text : "#FFFFFF" },
                          ]}
                        >
                          {p.following ? t("wall.following") : t("wall.follow")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null
          }
        />
      )}
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    askPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    askPillText: { fontSize: 13, fontWeight: "700" },
    list: { paddingHorizontal: 16, paddingBottom: 30, flexGrow: 1 },
    empty: { alignItems: "center", marginTop: 80, paddingHorizontal: 40, gap: 14 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
    cta: { borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    suggestSection: { width: "100%", marginTop: 32, gap: 10 },
    suggestTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
    suggestRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderRadius: 14,
      padding: 12,
    },
    suggestName: { fontSize: 15, fontWeight: "700" },
    followBtn: {
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    followText: { fontSize: 13, fontWeight: "700" },
  });
}
