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
import { hasLiked, likePost, unlikePost, deletePost } from "../services/postService";
import { blockUser } from "../services/blockService";

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

export default function PostCard({ post, navigation, onChanged }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const me = auth.currentUser?.uid;
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);

  useEffect(() => {
    hasLiked(post.id).then(setLiked);
  }, [post.id]);

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
    <View style={styles.card}>
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
          <Text style={[styles.author, { color: colors.text }]}>{post.authorName}</Text>
          <Text style={[styles.time, { color: colors.textTertiary }]}>
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
      {Array.isArray(post.images) && post.images.length > 0 && (
        <Image source={{ uri: post.images[0] }} style={styles.image} />
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
    </View>
  );
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
    header: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    author: { fontSize: 15, fontWeight: "700" },
    time: { fontSize: 12, marginTop: 1 },
    text: { fontSize: 15, lineHeight: 21, marginBottom: 10 },
    image: { width: "100%", height: 240, borderRadius: 12, marginBottom: 10 },
    actions: { flexDirection: "row", gap: 22, marginTop: 2 },
    action: { flexDirection: "row", alignItems: "center", gap: 6 },
    actionText: { fontSize: 14, fontWeight: "600" },
  });
}
