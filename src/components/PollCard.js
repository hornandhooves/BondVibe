import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
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
export default function PollCard({ parent, pollId, isHost }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [poll, setPoll] = useState(null);
  const [votes, setVotes] = useState([]);
  const uid = auth.currentUser?.uid;
  const parentKey = (parent || []).join("/");

  useEffect(() => {
    if (!parent || !pollId) return;
    const unsubP = subscribePoll(parent, pollId, setPoll);
    const unsubV = subscribeVotes(parent, pollId, setVotes);
    return () => {
      unsubP();
      unsubV();
    };
  }, [parentKey, pollId]);

  const styles = createStyles(colors, isDark);

  if (!poll) {
    return (
      <View style={styles.card}>
        <Text style={{ color: colors.textSecondary }}>{t("pollCard.loadingPoll")}</Text>
      </View>
    );
  }

  const total = votes.length;
  const myVote = votes.find((v) => v.userId === uid)?.optionId;
  const countFor = (optId) => votes.filter((v) => v.optionId === optId).length;

  const handleVote = (optId) => {
    if (poll.closed) return;
    votePoll(parent, pollId, optId);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badgeRow}>
          <Icon name="chart" size={11} color={colors.primary} />
          <Text style={styles.badge}>{t("pollCard.poll")}{poll.closed ? ` · ${t("pollCard.closed")}` : ""}</Text>
        </View>
        {isHost && !poll.closed && (
          <TouchableOpacity onPress={() => closePoll(parent, pollId)}>
            <Text style={[styles.close, { color: colors.primary }]}>{t("pollCard.close")}</Text>
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
              <View
                style={[
                  styles.radio,
                  { borderColor: mine ? colors.primary : colors.border },
                ]}
              >
                {mine && (
                  <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                )}
              </View>
              <Text
                style={[
                  styles.optionText,
                  { color: colors.text, fontWeight: mine ? "700" : "500" },
                ]}
              >
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

      <View style={styles.footerRow}>
        <Text style={[styles.total, { color: colors.textTertiary }]}>
          {t("pollCard.voteCount", { count: total })}
          {poll.anonymous ? ` · ${t("pollCard.anonymous")}` : ""}
          {poll.closed ? ` · ${t("pollCard.final")}` : myVote ? ` · ${t("pollCard.tapToChange")}` : ` · ${t("pollCard.tapToVote")}`}
        </Text>
        {!poll.anonymous && (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("PollVotes", { parent, pollId })
            }
          >
            <Text style={[styles.viewVotes, { color: colors.primary }]}>
              {t("pollCard.viewVotes")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
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
    badgeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    badge: { fontSize: 11, fontWeight: "800", color: colors.primary, letterSpacing: 0.5 },
    close: { fontSize: 13, fontWeight: "700" },
    question: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
    optionRow: { marginBottom: 10 },
    optionTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    optionText: { fontSize: 14, flex: 1, marginRight: 8 },
    pct: { fontSize: 13, fontWeight: "600" },
    track: { height: 8, borderRadius: 4, overflow: "hidden" },
    fill: { height: 8, borderRadius: 4 },
    total: { fontSize: 12, marginTop: 4, flex: 1 },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1,
      marginRight: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    radioDot: { width: 9, height: 9, borderRadius: 5 },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 4,
    },
    viewVotes: { fontSize: 12, fontWeight: "700" },
  });
}
