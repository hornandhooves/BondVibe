/**
 * C1 — Grid "who was here". Only checked-in attendees appear (enforced by
 * rules). Cards are ranked by Big Five compatibility. Tapping opens a profile.
 */
import React, { useState, useEffect, useCallback } from "react";
import Icon from "../../components/Icon";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { MatchHeader } from "./matchUi";
import { getMatchGrid, getMyMatchProfile } from "../../services/matchingService";

export default function MatchGridScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { eventId, eventTitle } = route.params || {};
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const mine = await getMyMatchProfile(eventId);
    if (!mine) {
      // Not opted in yet — send them through consent/profile first.
      navigation.replace("MatchConsent", { eventId, eventTitle });
      return;
    }
    setPeople(await getMatchGrid(eventId));
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    return unsub;
  }, [navigation, load]);

  const styles = createStyles(colors);

  const renderCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() =>
        navigation.navigate("MatchPerson", { eventId, eventTitle, profile: item })
      }
    >
      <View style={styles.avatarBox}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {(item.displayName || "?")[0].toUpperCase()}
            </Text>
          </View>
        )}
        {typeof item.compatibility === "number" ? (
          <View style={[styles.compat, { backgroundColor: colors.primary }]}>
            <Text style={styles.compatText}>{item.compatibility}%</Text>
          </View>
        ) : item.affinity?.status === "under_construction" ? (
          <View style={[styles.compat, { backgroundColor: "#EDE4FC" }]}>
            <Text style={[styles.compatText, { color: "#7C3AED" }]}>
              {t("matchmaking.affinity.building")}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {item.displayName}
        {item.age ? `, ${item.age}` : ""}
      </Text>
      {!!(item.interests || []).length && (
        <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.interests.slice(0, 2).join(" · ")}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={t("matching.grid.title")} onBack={() => navigation.goBack()} />
      <View style={[styles.banner, { backgroundColor: `${colors.primary}12` }]}>
        <Text style={[styles.bannerText, { color: colors.primary }]}>
          {t("matching.grid.banner")}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : people.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="users" size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t("matching.grid.empty")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(i) => i.id}
          renderItem={renderCard}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    banner: {
      marginHorizontal: 16,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: "center",
      marginBottom: 8,
    },
    bannerText: { fontSize: 13, fontWeight: "700" },
    list: { padding: 12 },
    row: { justifyContent: "space-between" },
    card: {
      flex: 1,
      margin: 6,
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderRadius: 18,
      padding: 12,
      alignItems: "center",
    },
    avatarBox: { marginBottom: 10 },
    avatar: { width: 92, height: 92, borderRadius: 46 },
    avatarFallback: {
      backgroundColor: `${colors.primary}22`,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: { fontSize: 34, fontWeight: "800", color: colors.primary },
    compat: {
      position: "absolute",
      bottom: -4,
      right: -4,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    compatText: { color: "#fff", fontSize: 12, fontWeight: "800" },
    name: { fontSize: 15, fontWeight: "700" },
    sub: { fontSize: 12, marginTop: 2 },
    empty: { alignItems: "center", marginTop: 60, paddingHorizontal: 40, gap: 12 },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  });
}
