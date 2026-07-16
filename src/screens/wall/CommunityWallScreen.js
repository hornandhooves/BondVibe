/**
 * Community wall (Wall v2 · P2). A community's page: gradient banner + name +
 * membership state, and a Muro / Eventos / Miembros sub-tab set. The Muro is the
 * hero (posts tagged with this communityId). Only members can compose here
 * (enforced by rules); the host can post host posts with a CTA.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { auth } from "../../services/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import PostCard from "../../components/PostCard";
import { MatchHeader } from "../matching/matchUi";
import { getGroup } from "../../services/hostGroupService";
import { getCommunityPosts } from "../../services/postService";

export default function CommunityWallScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { communityId } = route.params || {};
  const me = auth.currentUser?.uid;
  const [community, setCommunity] = useState(null);
  const [posts, setPosts] = useState([]);
  const [sub, setSub] = useState(0); // 0 Muro · 1 Eventos · 2 Miembros
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([getGroup(communityId), getCommunityPosts(communityId)]);
    setCommunity(c);
    setPosts(p);
    setLoading(false);
  }, [communityId]);
  React.useEffect(() => navigation.addListener("focus", load), [navigation, load]);

  const isMember =
    !!community && (community.hostId === me || (community.memberIds || []).includes(me));
  const isHost = !!community && community.hostId === me;
  const s = createStyles(colors);

  const SUBS = [t("wall.community.wall"), t("wall.community.events"), t("wall.community.members")];

  const header = (
    <View>
      <LinearGradient colors={["#1F8A6E", "#2BA37E"]} style={s.banner} />
      <View style={s.headBody}>
        <Text style={[s.name, { color: colors.text }]}>{community?.name || ""}</Text>
        <View style={s.metaRow}>
          <Text style={[s.meta, { color: colors.textSecondary }]}>
            {t("wall.discover.memberCount", { count: (community?.memberIds || []).length })}
          </Text>
          {isMember && (
            <View style={s.joinedChip}>
              <Icon name="check" size={12} color="#1F8A6E" />
              <Text style={s.joinedText}>{t("wall.community.joined")}</Text>
            </View>
          )}
        </View>
        <View style={s.subTabs}>
          {SUBS.map((label, i) => (
            <TouchableOpacity key={i} style={s.subTab} onPress={() => setSub(i)}>
              <Text
                style={[
                  s.subLabel,
                  { fontFamily: i === sub ? FONTS.bodyExtra : FONTS.bodySemibold, color: i === sub ? colors.text : colors.textTertiary },
                ]}
              >
                {label}
              </Text>
              <View style={[s.subUnderline, { backgroundColor: i === sub ? "#1F8A6E" : "transparent" }]} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <MatchHeader title={t("wall.community.title")} onBack={() => navigation.goBack()} />
        <ActivityIndicator style={{ marginTop: 48 }} color="#1F8A6E" />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={community?.name || t("wall.community.title")} onBack={() => navigation.goBack()} />
      {sub === 0 ? (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => <PostCard post={item} navigation={navigation} onChanged={load} />}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <Text style={[s.empty, { color: colors.textSecondary }]}>{t("wall.community.emptyWall")}</Text>
          }
        />
      ) : (
        <FlatList
          data={[]}
          ListHeaderComponent={header}
          renderItem={null}
          ListFooterComponent={
            <Text style={[s.empty, { color: colors.textSecondary }]}>
              {sub === 1 ? t("wall.community.eventsSoon") : t("wall.community.membersSoon")}
            </Text>
          }
        />
      )}

      {isMember && sub === 0 && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: "#7C3AED" }]}
          onPress={() =>
            navigation.navigate("CreatePost", {
              communityId,
              communityName: community?.name,
              canHostPost: isHost,
            })
          }
          activeOpacity={0.9}
        >
          <Icon name="add" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    list: { paddingHorizontal: 16, paddingBottom: 90 },
    banner: { height: 120, borderRadius: 0 },
    headBody: { paddingHorizontal: 4, paddingTop: 14, paddingBottom: 6 },
    name: { fontFamily: FONTS.display, fontSize: 24, letterSpacing: -0.3 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
    meta: { fontFamily: FONTS.bodyMedium, fontSize: 13 },
    joinedChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E1F5EC", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    joinedText: { fontFamily: FONTS.bodyBold, fontSize: 12, color: "#1F8A6E" },
    subTabs: { flexDirection: "row", gap: 20, marginTop: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    subTab: { paddingBottom: 10, alignItems: "center" },
    subLabel: { fontSize: 14 },
    subUnderline: { height: 2.5, borderRadius: 2, alignSelf: "stretch", marginTop: 8, minWidth: 24 },
    empty: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, textAlign: "center", marginTop: 40, paddingHorizontal: 30, lineHeight: 20 },
    fab: {
      position: "absolute", right: 20, bottom: 28, width: 56, height: 56, borderRadius: 28,
      alignItems: "center", justifyContent: "center",
      shadowColor: "#7C3AED", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 20, elevation: 8,
    },
  });
}
