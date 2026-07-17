/**
 * FeaturedCarousel — Home "Featured" as an auto-advancing carousel (Fix 6):
 * 2 compact cards per page (image block ~60px), advances every 3s with a
 * smooth slide, wraps to the first page, dots + manual swipe, pauses on
 * user interaction (resumes after ~5s idle) and while the screen is
 * unfocused. Images are real photos or the branded-initial fallback —
 * never an emoji (Fix 1).
 */
import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII, BRAND, ELEVATION } from "../constants/theme-tokens";
import { formatDate } from "../utils/formatDate";

const ADVANCE_MS = 3000;
const RESUME_AFTER_MS = 5000;

const initialsOf = (title) =>
  (title || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "K";

function CompactCard({ event, width, onPress }) {
  const { colors } = useTheme();
  const img = Array.isArray(event.images) ? event.images[0] : null;
  const when = event.date
    ? formatDate(new Date(event.date), { month: "short", day: "numeric" })
    : "";
  return (
    <TouchableOpacity
      style={[
        styles.card,
        ELEVATION.card,
        { width, backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {img ? (
        <Image source={{ uri: img }} style={styles.cardImage} />
      ) : (
        <LinearGradient
          colors={BRAND.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.cardImage, styles.cardFallback]}
        >
          <Text style={styles.fallbackInitials}>{initialsOf(event.title)}</Text>
        </LinearGradient>
      )}
      <View style={styles.cardBody}>
        <Text style={[TYPE.label, { color: colors.text }]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {when}
          {event.city ? ` · ${event.city}` : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function FeaturedCarousel({ events, onPressEvent }) {
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const { width: screenWidth } = useWindowDimensions();
  const listRef = useRef(null);
  const [page, setPage] = useState(0);
  const pausedUntil = useRef(0);

  const pageWidth = screenWidth - SPACING.screen * 2 - 8; // section padding
  const cardWidth = (pageWidth - SPACING.sm) / 2;

  // Two cards per page.
  const pages = useMemo(() => {
    const out = [];
    for (let i = 0; i < events.length; i += 2) out.push(events.slice(i, i + 2));
    return out;
  }, [events]);

  const goTo = useCallback(
    (idx) => {
      listRef.current?.scrollToOffset({ offset: idx * pageWidth, animated: true });
      setPage(idx);
    },
    [pageWidth]
  );

  // Auto-advance: every 3s, unless recently touched or unfocused.
  useEffect(() => {
    if (!isFocused || pages.length <= 1) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setPage((current) => {
        const next = (current + 1) % pages.length;
        listRef.current?.scrollToOffset({ offset: next * pageWidth, animated: true });
        return next;
      });
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [isFocused, pages.length, pageWidth]);

  const pause = () => {
    pausedUntil.current = Date.now() + RESUME_AFTER_MS;
  };

  if (!pages.length) return null;

  return (
    <View>
      <FlatList
        ref={listRef}
        data={pages}
        horizontal
        pagingEnabled
        snapToInterval={pageWidth}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => `page-${i}`}
        onScrollBeginDrag={pause}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
          setPage(Math.max(0, Math.min(pages.length - 1, idx)));
        }}
        getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
        renderItem={({ item: pair }) => (
          <View style={[styles.page, { width: pageWidth }]}>
            {pair.map((ev) => (
              <CompactCard
                key={ev.id}
                event={ev}
                width={cardWidth}
                onPress={() => {
                  pause();
                  onPressEvent(ev);
                }}
              />
            ))}
          </View>
        )}
      />
      {pages.length > 1 && (
        <View style={styles.dots}>
          {pages.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                pause();
                goTo(i);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <View
                style={[
                  styles.dot,
                  i === page
                    ? { backgroundColor: colors.primary, width: 18 }
                    : { backgroundColor: colors.border },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexDirection: "row", gap: SPACING.sm },
  card: {
    borderRadius: RADII.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardImage: { width: "100%", height: 60 },
  cardFallback: { alignItems: "center", justifyContent: "center" },
  fallbackInitials: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  cardBody: { padding: SPACING.md, gap: 2 },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: SPACING.md,
  },
  dot: { width: 6, height: 6, borderRadius: 999 },
});
