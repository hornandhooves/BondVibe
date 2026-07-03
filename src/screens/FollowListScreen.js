/**
 * FollowListScreen — shows the list of followers or following for a user.
 * Route params: { userId, type: "followers" | "following" }
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
import { getFollowers, getFollowing, followUser, unfollowUser, isFollowing } from "../services/followService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function FollowListScreen({ route, navigation }) {
  const { userId, type } = route.params || {};
  const { colors, isDark } = useTheme();
  const me = auth.currentUser?.uid;

  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uids =
        type === "followers"
          ? await getFollowers(userId)
          : await getFollowing(userId);

      const myFollowing = new Set(await getFollowing(me));

      const resolved = await Promise.all(
        uids.map(async (uid) => {
          const snap = await getDoc(doc(db, "users", uid));
          const d = snap.exists() ? snap.data() : {};
          return {
            id: uid,
            name: d.fullName || d.name || "User",
            avatar: d.avatar,
            location: d.location,
            following: myFollowing.has(uid),
          };
        })
      );
      setPeople(resolved);
    } catch (e) {
      console.error("❌ FollowListScreen load:", e);
    } finally {
      setLoading(false);
    }
  }, [userId, type, me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (person) => {
    if (person.id === me) return;
    setPeople((prev) =>
      prev.map((p) =>
        p.id === person.id ? { ...p, following: !p.following } : p
      )
    );
    if (person.following) await unfollowUser(person.id);
    else await followUser(person.id);
  };

  const styles = createStyles(colors, isDark);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {type === "followers" ? "Followers" : "Following"}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
              onPress={() => navigation.navigate("UserProfile", { userId: item.id })}
              activeOpacity={0.8}
            >
              <AvatarDisplay avatar={normAvatar(item.avatar)} size={44} />
              <View style={styles.info}>
                <Text style={[styles.name, { color: colors.text }]}>
                  {item.name}
                </Text>
                {!!item.location && (
                  <Text style={[styles.location, { color: colors.textSecondary }]}>
                    {item.location}
                  </Text>
                )}
              </View>
              {item.id !== me && (
                <TouchableOpacity
                  style={[
                    styles.followBtn,
                    {
                      backgroundColor: item.following ? colors.surface : colors.primary,
                      borderColor: item.following ? colors.borderStrong : colors.primary,
                    },
                  ]}
                  onPress={() => toggle(item)}
                >
                  <Text
                    style={[
                      styles.followBtnText,
                      { color: item.following ? colors.text : colors.onPrimary || "#fff" },
                    ]}
                  >
                    {item.following ? "Following" : "Follow"}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textTertiary }]}>
              {type === "followers" ? "No followers yet." : "Not following anyone yet."}
            </Text>
          }
        />
      )}
    </GradientBackground>
  );
}

const hit = { top: 8, bottom: 8, left: 8, right: 8 };

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 18, fontWeight: "700" },
    loader: { flex: 1, justifyContent: "center", alignItems: "center" },
    list: { padding: 20, gap: 10 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 2,
      borderRadius: 18,
      padding: 14,
      gap: 12,
    },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: "600" },
    location: { fontSize: 12, marginTop: 2 },
    followBtn: {
      borderWidth: 2,
      borderRadius: 10,
      paddingVertical: 7,
      paddingHorizontal: 14,
    },
    followBtnText: { fontSize: 13, fontWeight: "700" },
    empty: { textAlign: "center", marginTop: 40, fontSize: 14 },
  });
}
