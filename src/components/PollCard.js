import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { auth } from "../services/firebase";
import {
  subscribePoll,
  subscribeVotes,
  votePoll,
  closePoll,
} from "../services/pollService";

/**
 * Live poll card rendered inside the event chat for a "poll" message.
 */
export default function PollCard({ eventId, pollId, isHost }) {
  const { colors, isDark } = useTheme();
  const [poll, setPoll] = useState(null);
  const [votes, setVotes] = useState([]);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!eventId || !pollId) return;
    const unsubP = subscribePoll(eventId, pollId, setPoll);
    const unsubV = subscribeVotes(eventId, pollId, setVotes);
    return () => {
      unsubP();
      unsubV();
    };
  }, [eventId, pollId]);

  const styles = createStyles(colors, isDark);

  if (!poll) {
    return (
      <View style={styles.card}>
        <Text style={{ color: colors.textSecondary }}>Loading poll…</Text>
      </View>
    );
  }

  const total = votes.length;
  const myVote = votes.find((v) => v.userId === uid)?.optionId;
  const countFor = (optId) => votes.filter((v) => v.optionId === optId).length;

  const handleVote = (optId) => {
    if (poll.closed) return;
    votePoll(eventId, pollId, optId);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.badge}>📊 POLL{poll.closed ? " · CLOSED" : ""}</Text>
        {isHost && !poll.closed && (
          <TouchableOpacity onPress={() => closePoll(eventId, pollId)}>
            <Text style={[styles.close, { color: colors.primary }]}>Close</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.question, { color: colors.text }]}>{poll.question}</Text>

      {poll.options.map((opt) => {
        const c = countFor(opt.id);
        const pct = total > 0 ? Math.round((c / total) * 100) : 0;
        const mine = myVote === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            activeOpacity={poll.closed ? 1 : 0.8}
            onPress={() => handleVote(opt.id)}
            style={styles.optionRow}
          >
            <View style={styles.optionTop}>
              <Text
                style={[
                  styles.optionText,
                  { color: colors.text, fontWeight: mine ? "700" : "500" },
                ]}
              >
                {mine ? "✓ " : ""}
                {opt.text}
              </Text>
              <Text style={[styles.pct, { color: colors.textSecondary }]}>{pct}%</Text>
            </View>
            <View style={[styles.track, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${pct}%`,
                    backgroundColor: mine ? colors.primary : `${colors.primary}66`,
                  },
                ]}
              />
            </View>
          </TouchableOpacity>
        );
      })}

      <Text style={[styles.total, { color: colors.textTertiary }]}>
        {total} vote{total === 1 ? "" : "s"}
        {poll.closed ? " · Final" : myVote ? " · tap to change" : " · tap to vote"}
      </Text>
    </View>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    card: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: `${colors.primary}40`,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.92)",
      padding: 14,
      width: 260,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    badge: { fontSize: 11, fontWeight: "800", color: colors.primary, letterSpacing: 0.5 },
    close: { fontSize: 13, fontWeight: "700" },
    question: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
    optionRow: { marginBottom: 10 },
    optionTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    optionText: { fontSize: 14, flex: 1, marginRight: 8 },
    pct: { fontSize: 13, fontWeight: "600" },
    track: { height: 8, borderRadius: 4, overflow: "hidden" },
    fill: { height: 8, borderRadius: 4 },
    total: { fontSize: 12, marginTop: 4 },
  });
}
