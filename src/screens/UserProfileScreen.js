/**
 * UserProfileScreen — public view of any user's profile.
 * Shows avatar, name, location, followers/following counts,
 * a Follow/Unfollow button, and their posts.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { AvatarDisplay } from "../components/AvatarPicker";
import { AvatarFrame } from "../components/CategoryIcon";
import PostCard from "../components/PostCard";
import {
  followUser,
  unfollowUser,
  isFollowing,
  getFollowers,
  getFollowing,
} from "../services/followService";
import { getUserPosts } from "../services/postService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function UserProfileScreen({ route, navigation }) {
  const { userId } = route.params || {};
  const { colors, isDark } = useTheme();
  const me = auth.currentUser?.uid;
  const isOwnProfile = userId === me;

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [following, setFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [userSnap, followerIds, followingIds, userPosts, followingMe] =
        await Promise.all([
          getDoc(doc(db, "users", userId)),
          getFollowers(userId),
          getFollowing(userId),
          getUserPosts(userId),
          isOwnProfile ? Promise.resolve(false) : isFollowing(userId),
        ]);
      if (userSnap.exists()) setProfile(userSnap.data());
      setFollowersCount(followerIds.length);
      setFollowingCount(followingIds.length);
      setPosts(userPosts);
      setFollowing(followingMe);
    } catch (e) {
      console.error("❌ UserProfileScreen load:", e);
    } finally {
      setLoading(false);
    }
  }, [userId, isOwnProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleFollow = async () => {
    const next = !following;
    setFollowing(next);
    setFollowersCount((c) => c + (next ? 1 : -1));
    if (next) await followUser(userId);
    else await unfollowUser(userId);
  };

  const styles = createStyles(colors, isDark);

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <View style={{ width: 28 }} />
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PostCard post={item} navigation={navigation} onChanged={load} />
        )}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {/* Avatar + name */}
            <View style={styles.profileHeader}>
              <AvatarFrame size={96}>
                <AvatarDisplay avatar={normAvatar(profile?.avatar)} size={80} />
              </AvatarFrame>
              <Text style={[styles.name, { color: colors.text }]}>
                {profile?.fullName || "User"}
              </Text>
              {!!profile?.location && (
                <Text style={[styles.location, { color: colors.textSecondary }]}>
                  {profile.location}
                </Text>
              )}
              {!!profile?.bio && (
                <Text style={[styles.bio, { color: colors.textSecondary }]}>
                  {profile.bio}
                </Text>
              )}
            </View>

            {/* Followers / Following counts */}
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.stat}
                onPress={() =>
                  navigation.navigate("FollowList", { userId, type: "followers" })
                }
              >
                <Text style={[styles.statNumber, { color: colors.text }]}>
                  {followersCount}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Followers
                </Text>
              </TouchableOpacity>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={styles.stat}
                onPress={() =>
                  navigation.navigate("FollowList", { userId, type: "following" })
                }
              >
                <Text style={[styles.statNumber, { color: colors.text }]}>
                  {followingCount}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Following
                </Text>
              </TouchableOpacity>
            </View>

            {/* Follow button (hidden on own profile) */}
            {!isOwnProfile && (
              <TouchableOpacity
                style={[
                  styles.followBtn,
                  {
                    backgroundColor: following
                      ? colors.surface
                      : colors.primary,
                    borderColor: following ? colors.borderStrong : colors.primary,
                  },
                ]}
                onPress={toggleFollow}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.followBtnText,
                    { color: following ? colors.text : colors.onPrimary || "#fff" },
                  ]}
                >
                  {following ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.postsLabel, { color: colors.textSecondary }]}>
              Posts
            </Text>
          </>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textTertiary }]}>
            No posts yet.
          </Text>
        }
      />
    </GradientBackground>
  );
}

const hit = { top: 8, bottom: 8, left: 8, right: 8 };

function createStyles(colors, isDark) {
  return StyleSheet.create({
    loader: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 18, fontWeight: "700" },
    list: { paddingHorizontal: 20, paddingBottom: 40 },
    profileHeader: { alignItems: "center", marginBottom: 20, marginTop: 4 },
    name: { fontSize: 22, fontWeight: "700", marginTop: 12, letterSpacing: -0.3 },
    location: { fontSize: 13, marginTop: 4 },
    bio: { fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: "center" },
    statsRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
      gap: 0,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    stat: { flex: 1, alignItems: "center" },
    statNumber: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
    statLabel: { fontSize: 12, marginTop: 2 },
    statDivider: { width: 1, height: 32, marginHorizontal: 12 },
    followBtn: {
      borderWidth: 2,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
      marginBottom: 20,
    },
    followBtnText: { fontSize: 15, fontWeight: "700" },
    postsLabel: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
    empty: { textAlign: "center", marginTop: 20, fontSize: 14 },
  });
}
