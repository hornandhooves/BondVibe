import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { getAttendeeIds } from "../utils/eventHelpers";
import { getFollowing, followUser, unfollowUser } from "../services/followService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function ConnectScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { eventId } = route.params || {};
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = auth.currentUser?.uid;
        const evSnap = await getDoc(doc(db, "events", eventId));
        if (!evSnap.exists()) return;
        const e = evSnap.data();
        const hostId = e.creatorId || e.createdBy || e.hostId;
        const ids = getAttendeeIds(e.attendees).filter(
          (id) => id !== me && id !== hostId
        );
        const following = new Set(await getFollowing());
        const users = await Promise.all(
          ids.map(async (id) => {
            const u = await getDoc(doc(db, "users", id));
            const d = u.exists() ? u.data() : {};
            return {
              id,
              name: d.fullName || d.name || "Attendee",
              avatar: d.avatar,
              location: d.location,
              following: following.has(id),
            };
          })
        );
        setPeople(users);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  const toggle = async (person) => {
    setPeople((prev) =>
      prev.map((p) => (p.id === person.id ? { ...p, following: !p.following } : p))
    );
    if (person.following) await unfollowUser(person.id);
    else await followUser(person.id);
  };

  const styles = createStyles(colors, isDark);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Connect</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Follow the people you met — stay in the loop for their next events.
          </Text>
          {people.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>
              No one else to connect with here yet.
            </Text>
          ) : (
            people.map((p) => (
              <View key={p.id} style={[styles.row, { borderColor: colors.border }]}>
                <AvatarDisplay avatar={normAvatar(p.avatar)} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {!!p.location && (
                    <Text style={[styles.loc, { color: colors.textTertiary }]} numberOfLines={1}>
                      {p.location}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => toggle(p)}
                  style={[
                    styles.followBtn,
                    p.following
                      ? { borderColor: colors.border }
                      : { backgroundColor: colors.primary, borderColor: colors.primary },
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
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors, isDark) {
  const border = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    back: { fontSize: 28 },
    headerTitle: { fontSize: 18, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
    muted: { fontSize: 13 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
    },
    name: { fontSize: 15, fontWeight: "700" },
    loc: { fontSize: 12, marginTop: 2 },
    followBtn: {
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    followText: { fontSize: 13, fontWeight: "700" },
  });
}
