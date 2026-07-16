/**
 * PostCard — one feed post: author, text, images, like + comment actions, and
 * an overflow menu (delete own / block author). Used by the feed and detail.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import Icon from "./Icon";
import MentionText from "./MentionText";
import { useTranslation } from "react-i18next";
import { AvatarDisplay } from "./AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { auth } from "../services/firebase";
import {
  hasLiked,
  likePost,
  unlikePost,
  deletePost,
  recordPostEvent,
  getPostStats,
} from "../services/postService";
import { blockUser } from "../services/blockService";
import { funnyTag } from "../constants/matchTags";
import { MATCH_TYPE_COLORS } from "../services/matchingService";
import { useSubscriptions } from "../hooks/useEntitlement";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

function timeAgo(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : ts ? new Date(ts).getTime() : 0;
  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Author's headline funny tag (Wall v2) — Kinlo icon + label in its category
 *  color. Renders nothing for legacy posts without a tag (backcompat). */
function FunnyTagChip({ tagId, t }) {
  const tag = tagId ? funnyTag(tagId) : null;
  if (!tag) return null;
  const c = MATCH_TYPE_COLORS[tag.type] || MATCH_TYPE_COLORS.brand || { fg: "#7C3AED", bg: "#EDE4FC" };
  return (
    <View style={[chipStyles.chip, { backgroundColor: c.bg }]}>
      <Icon name={tag.icon} size={11} color={c.fg} />
      <Text style={[chipStyles.text, { color: c.fg }]} numberOfLines={1}>
        {t(`matchmaking.funnyTag.${tag.id}`)}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 150,
  },
  text: { fontSize: 10, fontWeight: "700" },
});

export default function PostCard({ post, navigation, onChanged }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isPro } = useSubscriptions();
  const me = auth.currentUser?.uid;
  const isOwner = post.authorId === me;
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    hasLiked(post.id).then(setLiked);
  }, [post.id]);

  // Wall v2 (P2): host posts count impressions; the owner (Pro) sees the strip.
  useEffect(() => {
    if (!post.isHostPost) return;
    if (!isOwner) recordPostEvent(post.id, "view");
    if (isOwner && isPro) getPostStats(post.id).then(setStats);
  }, [post.id, post.isHostPost, isOwner, isPro]);

  const onCta = async () => {
    const cta = post.cta;
    if (!cta?.type) return;
    recordPostEvent(post.id, "ctaClick");
    if (cta.type === "event") navigation?.navigate("EventDetail", { eventId: cta.refId });
    else if (cta.type === "service") navigation?.navigate("ServiceDetail", { serviceId: cta.refId });
    else if (cta.type === "community") navigation?.navigate("CommunityWall", { communityId: cta.refId });
  };

  const toggleLike = async () => {
    if (liked) {
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
      await unlikePost(post.id);
    } else {
      setLiked(true);
      setLikeCount((c) => c + 1);
      await likePost(post.id);
    }
  };

  const menu = () => {
    const opts = [];
    if (post.authorId === me) {
      opts.push({
        text: t("postCard.deletePost"),
        style: "destructive",
        onPress: async () => {
          await deletePost(post.id);
          onChanged?.();
        },
      });
    } else {
      opts.push({
        text: t("postCard.blockUser"),
        style: "destructive",
        onPress: async () => {
          await blockUser(post.authorId);
          onChanged?.();
        },
      });
      opts.push({
        text: t("postCard.report"),
        onPress: () =>
          navigation?.navigate("Report", { targetUserId: post.authorId }),
      });
    }
    opts.push({ text: t("postCard.cancel"), style: "cancel" });
    Alert.alert(post.authorName || t("postCard.postFallback"), null, opts);
  };

  const styles = createStyles(colors);
  return (
    <View style={[styles.card, post.isHostPost && styles.hostCard]}>
      {post.isHostPost && (
        <View style={styles.hostRow}>
          <View style={styles.hostBadge}>
            <Text style={styles.hostBadgeText}>{t("wall.hostPost.badge")}</Text>
          </View>
          {!!post.communityName && (
            <Text style={[styles.hostComm, { color: colors.textSecondary }]} numberOfLines={1}>
              {post.communityName}
            </Text>
          )}
        </View>
      )}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            navigation?.navigate("UserProfile", { userId: post.authorId })
          }
          activeOpacity={0.8}
        >
          <AvatarDisplay avatar={normAvatar(post.authorAvatar)} size={40} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, marginLeft: 10 }}
          onPress={() =>
            navigation?.navigate("UserProfile", { userId: post.authorId })
          }
          activeOpacity={0.8}
        >
          <View style={styles.nameRow}>
            <Text style={[styles.author, { color: colors.text }]} numberOfLines={1}>
              {post.authorName}
            </Text>
            <FunnyTagChip tagId={post.authorFunnyTag} t={t} />
          </View>
          <Text style={[styles.time, { color: colors.textTertiary }]}>
            {/* Community context (Wall v2) — where this was posted, if any. */}
            {post.communityName ? `${post.communityName} · ` : ""}
            {timeAgo(post.createdAt)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={menu} hitSlop={hit}>
          <Icon name="more" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {post.type === "recap" && (
        <View style={styles.recapRow}>
          <Icon name="ai" size={12} color={colors.primary} />
          <Text style={[styles.recapEyebrow, { color: colors.primary }]}>
            {t("postCard.eventRecap")}
            {post.eventTitle ? ` · ${post.eventTitle.toUpperCase()}` : ""}
          </Text>
          {(post.attendeeIds || []).includes(me) && (
            <View style={[styles.thereBadge, { backgroundColor: "#E1F5EC" }]}>
              <Text style={styles.thereText}>{t("postCard.youWereThere")}</Text>
            </View>
          )}
        </View>
      )}
      {!!post.text && (
        <MentionText text={post.text} style={[styles.text, { color: colors.text }]} navigation={navigation} />
      )}
      <PostMedia post={post} styles={styles} />

      {/* Host CTA (P2) — routes to the real reservation (event / service). */}
      {post.cta?.type && post.cta?.refId && (
        <TouchableOpacity style={styles.ctaCard} onPress={onCta} activeOpacity={0.88}>
          <View style={styles.ctaThumb}>
            <Icon
              name={post.cta.type === "service" ? "services" : post.cta.type === "community" ? "community" : "calendar"}
              size={20}
              color="#1F8A6E"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.ctaTitle, { color: colors.text }]} numberOfLines={1}>
              {post.cta.label || t(`wall.hostPost.ctaTitle.${post.cta.type}`)}
            </Text>
            {!!post.cta.subtitle && (
              <Text style={[styles.ctaSub, { color: colors.textSecondary }]} numberOfLines={1}>
                {post.cta.subtitle}
              </Text>
            )}
          </View>
          <View style={styles.ctaBtn}>
            <Text style={styles.ctaBtnText}>{t("wall.hostPost.reserve")}</Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={toggleLike} hitSlop={hit}>
          <Icon
            name="heart"
            size={22}
            color={liked ? colors.primary : colors.textSecondary}
            fill={liked ? colors.primary : "none"}
          />
          <Text style={[styles.actionText, { color: colors.textSecondary }]}>
            {likeCount}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.action}
          onPress={() => navigation?.navigate("PostDetail", { postId: post.id })}
          hitSlop={hit}
        >
          <Icon name="message" size={21} color={colors.textSecondary} />
          <Text style={[styles.actionText, { color: colors.textSecondary }]}>
            {post.commentCount || 0}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Reach stats (P2, Pro) — owner-only strip. */}
      {isOwner && post.isHostPost && isPro && stats && (
        <View style={styles.statsStrip}>
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>{t("wall.pro.badge")}</Text>
          </View>
          <StatCell label={t("wall.pro.views")} value={stats.views || 0} />
          <StatCell label={t("wall.pro.taps")} value={stats.ctaClicks || 0} />
          <StatCell
            label={t("wall.pro.ctr")}
            value={stats.views ? `${Math.round(((stats.ctaClicks || 0) / stats.views) * 100)}%` : "—"}
          />
        </View>
      )}
    </View>
  );
}

/** One metric cell in the Pro reach strip. */
function StatCell({ label, value }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={statCellStyles.value}>{value}</Text>
      <Text style={statCellStyles.label}>{label}</Text>
    </View>
  );
}

const statCellStyles = StyleSheet.create({
  value: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 16, color: "#FFFFFF", letterSpacing: -0.5 },
  label: { fontSize: 10.5, color: "#C792EA", marginTop: 2 },
});

/** Post media (Wall v2): reads mediaUrls with a fallback to the legacy images
 *  array. A carousel (2+) shows the first two side by side (FIDELITY §5). Video
 *  poster shows its thumbnail here; the player lands in P3. */
function PostMedia({ post, styles }) {
  const media = Array.isArray(post.mediaUrls) && post.mediaUrls.length
    ? post.mediaUrls
    : (Array.isArray(post.images) ? post.images : []);
  if (media.length === 0) return null;
  if (media.length >= 2 && post.mediaType !== "video") {
    return (
      <View style={styles.carousel}>
        <Image source={{ uri: media[0] }} style={styles.carouselItem} />
        <Image source={{ uri: media[1] }} style={styles.carouselItem} />
      </View>
    );
  }
  return <Image source={{ uri: media[0] }} style={styles.image} />;
}

const hit = { top: 8, bottom: 8, left: 8, right: 8 };

function createStyles(colors) {
  return StyleSheet.create({
    recapRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 6,
    },
    recapEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, flexShrink: 1 },
    thereBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    thereText: { fontSize: 10, fontWeight: "700", color: "#1F8A6E" },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      marginBottom: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    hostCard: { borderTopWidth: 3, borderTopColor: "#7C3AED" },
    hostRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    hostBadge: { backgroundColor: "#7C3AED", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    hostBadgeText: { fontSize: 9.5, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.5 },
    hostComm: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
    ctaCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      backgroundColor: "#F7F5FB", borderRadius: 14, padding: 12, marginBottom: 10,
    },
    ctaThumb: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#E1F5EC", alignItems: "center", justifyContent: "center" },
    ctaTitle: { fontSize: 14, fontWeight: "700" },
    ctaSub: { fontSize: 12, marginTop: 2 },
    ctaBtn: { backgroundColor: "#1F8A6E", borderRadius: 19, paddingHorizontal: 16, paddingVertical: 9 },
    ctaBtnText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
    statsStrip: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#160F22", borderRadius: 14, padding: 12, marginTop: 12,
    },
    proBadge: { backgroundColor: "#7C3AED", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    proBadgeText: { fontSize: 9, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.5 },
    header: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    author: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
    time: { fontSize: 12, marginTop: 1 },
    text: { fontSize: 15, lineHeight: 21, marginBottom: 10 },
    image: { width: "100%", height: 240, borderRadius: 12, marginBottom: 10 },
    carousel: { flexDirection: "row", gap: 6, marginBottom: 10 },
    carouselItem: { flex: 1, height: 200, borderRadius: 12 },
    actions: { flexDirection: "row", gap: 22, marginTop: 2 },
    action: { flexDirection: "row", alignItems: "center", gap: 6 },
    actionText: { fontSize: 14, fontWeight: "600" },
  });
}
