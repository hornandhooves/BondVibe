/**
 * FeedScreen — posts from people you follow (and yourself). Entry points to
 * compose a post and to direct messages.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { collection, getDocs, query, limit } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import Icon from "../components/Icon";
import GradientBackground from "../components/GradientBackground";
import PostCard from "../components/PostCard";
import { AvatarDisplay } from "../components/AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { getFeed } from "../services/postService";
import { followUser, unfollowUser } from "../services/followService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function FeedScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);

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
            name: data.fullName || data.name || "Kinlo user",
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Feed</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate("DMList")} hitSlop={hit}>
            <Icon name="chat" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate("CreatePost")} hitSlop={hit}>
            <Icon name="add" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PostCard post={item} navigation={navigation} onChanged={load} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Icon name="community" size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Follow people and share your first post to fill your feed.
              </Text>
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate("CreatePost")}
              >
                <Text style={styles.ctaText}>Create a post</Text>
              </TouchableOpacity>

              {suggestions.length > 0 && (
                <View style={styles.suggestSection}>
                  <Text style={[styles.suggestTitle, { color: colors.text }]}>
                    People you might follow
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
                          {p.following ? "Following" : "Follow"}
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
      paddingTop: 60,
      paddingBottom: 12,
    },
    title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
    headerActions: { flexDirection: "row", gap: 20, alignItems: "center" },
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
