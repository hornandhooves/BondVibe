import Icon from "../components/Icon";
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
import { db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { subscribePoll, subscribeVotes } from "../services/pollService";
import { getAttendeeIds } from "../utils/eventHelpers";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function PollVotesScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { parent, pollId } = route.params || {};
  const [poll, setPoll] = useState(null);
  const [votes, setVotes] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!parent || !pollId) return;
    const unsubP = subscribePoll(parent, pollId, setPoll);
    const unsubV = subscribeVotes(parent, pollId, setVotes);
    (async () => {
      try {
        const [coll, id] = parent;
        let ids = [];
        if (coll === "hostGroups") {
          const g = await getDoc(doc(db, "hostGroups", id));
          if (g.exists()) {
            const d = g.data();
            ids = Array.from(new Set([...(d.memberIds || []), d.hostId].filter(Boolean)));
          }
        } else if (coll === "events") {
          const e = await getDoc(doc(db, "events", id));
          if (e.exists()) {
            const d = e.data();
            ids = Array.from(
              new Set([...getAttendeeIds(d.attendees), d.creatorId].filter(Boolean))
            );
          }
        }
        const users = await Promise.all(
          ids.map(async (uid) => {
            const u = await getDoc(doc(db, "users", uid));
            const d = u.exists() ? u.data() : {};
            return { id: uid, name: d.fullName || d.name || "Member", avatar: d.avatar };
          })
        );
        setMembers(users);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      unsubP();
      unsubV();
    };
  }, [parent?.join("/"), pollId]);

  const styles = createStyles(colors, isDark);
  const voteByUser = {};
  votes.forEach((v) => (voteByUser[v.userId] = v.optionId));
  const votersFor = (optId) => members.filter((m) => voteByUser[m.id] === optId);
  const notVoted = members.filter((m) => !voteByUser[m.id]);

  const Row = ({ m }) => (
    <View style={styles.voterRow}>
      <AvatarDisplay avatar={normAvatar(m.avatar)} size={30} />
      <Text style={[styles.voterName, { color: colors.text }]} numberOfLines={1}>
        {m.name}
      </Text>
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Poll results</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading || !poll ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : poll.anonymous ? (
        <View style={styles.loading}>
          <Text style={[styles.anon, { color: colors.textSecondary }]}>
            <Icon name="hide" size={14} color={colors.textSecondary} /> This
            poll is anonymous — individual votes are hidden.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.question, { color: colors.text }]}>{poll.question}</Text>
          {poll.options.map((opt) => {
            const voters = votersFor(opt.id);
            return (
              <View key={opt.id} style={[styles.optCard, { borderColor: colors.border }]}>
                <Text style={[styles.optTitle, { color: colors.text }]}>
                  {opt.text} · {voters.length}
                </Text>
                {voters.length === 0 ? (
                  <Text style={[styles.muted, { color: colors.textTertiary }]}>No votes</Text>
                ) : (
                  voters.map((m) => <Row key={m.id} m={m} />)
                )}
              </View>
            );
          })}

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            NOT VOTED YET ({notVoted.length})
          </Text>
          {notVoted.length === 0 ? (
            <Text style={[styles.muted, { color: colors.textTertiary }]}>Everyone voted</Text>
          ) : (
            notVoted.map((m) => <Row key={m.id} m={m} />)
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
    headerTitle: { fontSize: 18, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
    anon: { fontSize: 15, textAlign: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    question: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
    optCard: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
    },
    optTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
    voterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
    voterName: { fontSize: 14, fontWeight: "500", flex: 1 },
    muted: { fontSize: 13 },
    sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 8, marginBottom: 8 },
  });
}
