/**
 * "Grupos para ti" — community-scoped groups of 4-6 (P3). Lists the groups the
 * server suggested this week; joining is opt-in (a transactional Cloud Function)
 * and the group chat only opens once 3+ people have joined. Honest empty state
 * when there's nothing to suggest yet — groups are never fabricated.
 */
import React, { useState, useCallback } from "react";
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { auth } from "../../services/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import { MatchHeader } from "./matchUi";
import { getMyMatchGroups, joinMatchGroup } from "../../services/matchGroupService";

export default function MatchGroupsScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const me = auth.currentUser?.uid;

  const load = useCallback(async () => {
    setLoading(true);
    setGroups(await getMyMatchGroups());
    setLoading(false);
  }, []);
  React.useEffect(() => navigation.addListener("focus", load), [navigation, load]);

  const onJoin = async (g) => {
    setBusyId(g.id);
    try {
      await joinMatchGroup(g.id);
      await load();
    } catch (e) {
      /* swallow — the list reload reflects the true state */
    } finally {
      setBusyId(null);
    }
  };

  const s = createStyles(colors);
  const renderItem = ({ item }) => {
    const joined = (item.joined || []).includes(me);
    const count = (item.joined || []).length;
    const size = (item.candidates || []).length;
    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.cardHead}>
          <View style={s.groupIcon}>
            <Icon name="community" size={22} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.text }]}>
              {t("matchmaking.groups.cardTitle", { count: size })}
            </Text>
            <Text style={[s.sub, { color: colors.textSecondary }]}>
              {item.chatActive
                ? t("matchmaking.groups.active", { count })
                : t("matchmaking.groups.joinedCount", { count })}
            </Text>
          </View>
        </View>

        {joined && item.chatActive ? (
          <TouchableOpacity
            style={[s.primary, { backgroundColor: "#7C3AED" }]}
            onPress={() =>
              navigation.navigate("MatchGroupChat", { groupId: item.id, size })
            }
          >
            <Icon name="message" size={16} color="#fff" />
            <Text style={s.primaryText}>{t("matchmaking.groups.openChat")}</Text>
          </TouchableOpacity>
        ) : joined ? (
          <View style={[s.pending, { borderColor: colors.border }]}>
            <Text style={[s.pendingText, { color: colors.textSecondary }]}>
              {t("matchmaking.groups.waiting")}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.primary, { backgroundColor: "#7C3AED", opacity: busyId === item.id ? 0.6 : 1 }]}
            onPress={() => onJoin(item)}
            disabled={busyId === item.id}
          >
            <Text style={s.primaryText}>{t("matchmaking.groups.join")}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={t("matchmaking.groups.title")} onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color="#7C3AED" />
      ) : groups.length === 0 ? (
        <View style={s.empty}>
          <Icon name="users" size={34} color={colors.textTertiary} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>{t("matchmaking.groups.emptyTitle")}</Text>
          <Text style={[s.emptyBody, { color: colors.textSecondary }]}>{t("matchmaking.groups.emptyBody")}</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
    groupIcon: {
      width: 46, height: 46, borderRadius: 14, backgroundColor: "#EDE4FC",
      alignItems: "center", justifyContent: "center",
    },
    title: { fontFamily: FONTS.display, fontSize: 16 },
    sub: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, marginTop: 2 },
    primary: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      height: 44, borderRadius: 22,
    },
    primaryText: { fontFamily: FONTS.bodyBold, fontSize: 14.5, color: "#fff" },
    pending: { height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    pendingText: { fontFamily: FONTS.bodySemibold, fontSize: 13 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 36, gap: 10 },
    emptyTitle: { fontFamily: FONTS.display, fontSize: 18, textAlign: "center" },
    emptyBody: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
  });
}
