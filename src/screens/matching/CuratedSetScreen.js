/**
 * "Tu semana en Kinlo" — the weekly curated set (P2). Renders one of four honest
 * states resolved from the server-built curatedSets/{me} doc:
 *
 *   inactive → not opted in / profile incomplete → send to consent + profile
 *   locked   → trial week is over and the user isn't Kinlo Plus → paywall
 *              (the server already WITHHELD the members; we only know the count)
 *   empty    → active but nobody to suggest yet → honest "under construction"
 *   ready    → the "te presentamos" cards (double opt-in intro + dejar de sugerir)
 *
 * The set is never fabricated and never unlocked client-side — both are the
 * server's job (functions/matching/curated.js).
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import { MatchHeader } from "./matchUi";
import PresentationCard from "../../components/matching/PresentationCard";
import {
  getCuratedSet,
  requestCuratedSet,
  dontSuggest,
  requestIntro,
} from "../../services/curatedService";

export default function CuratedSetScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let res = await getCuratedSet();
    // No set yet this week but the user is active → ask the server to build one.
    if (res.state === "empty" && !res.weekOf) {
      try {
        await requestCuratedSet();
        res = await getCuratedSet();
      } catch (e) {
        /* keep the honest empty state */
      }
    }
    setData(res);
    setLoading(false);
  }, []);

  React.useEffect(() => navigation.addListener("focus", load), [navigation, load]);

  const onConnect = async (member) => {
    const r = await requestIntro(member.uid);
    if (r?.matched && r.threadId) {
      navigation.navigate("MatchChat", { matchId: r.threadId, name: member.displayName });
    }
    // Not yet reciprocal → stays private; the card just settles back.
  };
  const onDismiss = (member) => dontSuggest(member.uid);
  const onOpenProfile = (member) =>
    navigation.navigate("UserProfile", { userId: member.uid });

  const s = createStyles(colors);
  const state = data?.state;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={t("matchmaking.curated.title")} onBack={() => navigation.goBack()} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color="#7C3AED" />
      ) : state === "inactive" ? (
        <Centered
          icon="ai"
          title={t("matchmaking.curated.inactiveTitle")}
          body={t("matchmaking.curated.inactiveBody")}
          cta={t("matchmaking.curated.setUp")}
          onPress={() => navigation.navigate("MatchConsent", {})}
          colors={colors}
        />
      ) : state === "locked" ? (
        <Centered
          icon="lock"
          title={t("matchmaking.curated.lockedTitle")}
          body={t("matchmaking.curated.lockedBody", { count: data.count || 0 })}
          cta={t("matchmaking.curated.unlockPlus")}
          onPress={() => navigation.navigate("PlusPaywall", { source: "curated" })}
          colors={colors}
        />
      ) : state === "empty" ? (
        <Centered
          icon="users"
          title={t("matchmaking.curated.emptyTitle")}
          body={t("matchmaking.curated.emptyBody")}
          colors={colors}
        />
      ) : (
        <FlatList
          data={data.members}
          keyExtractor={(m) => m.uid}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <Text style={[s.intro, { color: colors.textSecondary }]}>
              {t("matchmaking.curated.intro", { count: data.count })}
            </Text>
          }
          renderItem={({ item }) => (
            <PresentationCard
              member={item}
              onConnect={onConnect}
              onDismiss={onDismiss}
              onOpenProfile={onOpenProfile}
            />
          )}
        />
      )}
    </View>
  );
}

function Centered({ icon, title, body, cta, onPress, colors }) {
  const s = createStyles(colors);
  return (
    <View style={s.centered}>
      <View style={s.centerIcon}>
        <Icon name={icon} size={30} color="#7C3AED" />
      </View>
      <Text style={[s.centerTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[s.centerBody, { color: colors.textSecondary }]}>{body}</Text>
      {cta && onPress ? (
        <TouchableOpacity style={s.centerCta} onPress={onPress}>
          <Text style={s.centerCtaText}>{cta}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    list: { padding: 16 },
    intro: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, lineHeight: 19, marginBottom: 16 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 36, gap: 12 },
    centerIcon: {
      width: 64, height: 64, borderRadius: 20, backgroundColor: "#EDE4FC",
      alignItems: "center", justifyContent: "center", marginBottom: 6,
    },
    centerTitle: { fontFamily: FONTS.display, fontSize: 19, textAlign: "center" },
    centerBody: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
    centerCta: {
      marginTop: 10, height: 48, borderRadius: 24, paddingHorizontal: 28,
      backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center",
    },
    centerCtaText: { fontFamily: FONTS.bodyBold, fontSize: 15, color: "#fff" },
  });
}
