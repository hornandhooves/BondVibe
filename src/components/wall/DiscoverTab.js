/**
 * Wall v2 · Descubre (P1) — affinity discovery, monetized in context.
 *
 * People are ranked + gated server-side (functions/wall/discover.js). A free
 * user sees ONE unlocked pick; the rest arrive as { locked:true } with NO
 * identity, so we render skeleton placeholders (nothing to leak) behind a Kinlo
 * Plus upsell. Communities + events are light, ungated suggestions. Not opted
 * into matchmaking → an honest opt-in CTA, never a global directory.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../Icon";
import { funnyTag } from "../../constants/matchTags";
import { MATCH_TYPE_COLORS } from "../../services/matchingService";
import {
  getDiscoverPeople,
  getSuggestedCommunities,
  getSuggestedEvents,
} from "../../services/discoverService";

export default function DiscoverTab({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [people, comms, evs] = await Promise.all([
      getDiscoverPeople(),
      getSuggestedCommunities(),
      getSuggestedEvents(),
    ]);
    setData(people);
    setCommunities(comms);
    setEvents(evs);
    setLoading(false);
  }, []);
  React.useEffect(() => {
    const unsub = navigation?.addListener?.("focus", load);
    load();
    return unsub;
  }, [navigation, load]);

  const s = createStyles(colors);

  if (loading) {
    return <ActivityIndicator style={{ marginTop: 48 }} color="#7C3AED" />;
  }

  // Not participating → honest opt-in (never a global directory).
  if (data && data.participating === false) {
    return (
      <View style={s.centered}>
        <View style={s.centerIcon}>
          <Icon name="community" size={30} color="#7C3AED" />
        </View>
        <Text style={[s.centerTitle, { color: colors.text }]}>{t("wall.discover.optInTitle")}</Text>
        <Text style={[s.centerBody, { color: colors.textSecondary }]}>{t("wall.discover.optInBody")}</Text>
        <TouchableOpacity style={s.centerCta} onPress={() => navigation.navigate("MatchConsent", {})}>
          <Text style={s.centerCtaText}>{t("matchmaking.curated.setUp")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const people = data?.people || [];
  const lockedCount = data?.lockedCount || 0;

  return (
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      {/* PEOPLE — the affinity differentiator */}
      <Text style={[s.section, { color: colors.text }]}>{t("wall.discover.people")}</Text>
      {people.length === 0 ? (
        <Text style={[s.emptyRow, { color: colors.textSecondary }]}>{t("wall.discover.noPeople")}</Text>
      ) : (
        people.map((p, i) =>
          p.locked ? null : (
            <PersonCard key={p.uid} person={p} colors={colors} t={t} s={s}
              onOpen={() => navigation.navigate("UserProfile", { userId: p.uid })} />
          )
        )
      )}
      {/* Upsell in context — the blurred rest (identity withheld server-side). */}
      {lockedCount > 0 && (
        <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate("PlusPaywall", { source: "discover" })}>
          <View style={s.lockedStack}>
            {[0, 1].map((k) => (
              <View key={k} style={[s.lockedCard, { backgroundColor: "#ECE9F1", opacity: 1 - k * 0.35 }]} />
            ))}
          </View>
          <LinearGradient
            colors={["#2A1E3D", "#42265C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.upsell}
          >
            <View style={s.lockBadge}>
              <Icon name="lock" size={22} color="#FFFFFF" />
            </View>
            <Text style={s.upsellTitle}>{t("wall.upsell.morePeople", { count: lockedCount })}</Text>
            <Text style={s.upsellSub}>{t("wall.upsell.unlockPlus")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* COMMUNITIES */}
      {communities.length > 0 && (
        <>
          <Text style={[s.section, { color: colors.text, marginTop: 22 }]}>{t("wall.discover.communities")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
            {communities.map((c) => (
              <View key={c.id} style={[s.commCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={s.commIcon}>
                  <Icon name="community" size={20} color="#1F8A6E" />
                </View>
                <Text style={[s.commName, { color: colors.text }]} numberOfLines={2}>{c.name}</Text>
                <Text style={[s.commMeta, { color: colors.textSecondary }]}>
                  {t("wall.discover.memberCount", { count: (c.memberIds || []).length })}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      {/* EVENTS */}
      {events.length > 0 && (
        <>
          <Text style={[s.section, { color: colors.text, marginTop: 22 }]}>{t("wall.discover.events")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
            {events.map((e) => (
              <TouchableOpacity
                key={e.id}
                style={[s.evtCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => navigation.navigate("EventDetail", { eventId: e.id })}
                activeOpacity={0.85}
              >
                {e.coverImage || e.image ? (
                  <Image source={{ uri: e.coverImage || e.image }} style={s.evtImg} />
                ) : (
                  <View style={[s.evtImg, { backgroundColor: "#EDE4FC" }]} />
                )}
                <Text style={[s.evtTitle, { color: colors.text }]} numberOfLines={2}>{e.title}</Text>
                {!!e.city && <Text style={[s.commMeta, { color: colors.textSecondary }]}>{e.city}</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

function PersonCard({ person, colors, t, s, onOpen }) {
  const tags = (person.funnyTags || []).map(funnyTag).filter(Boolean).slice(0, 3);
  const reasons = (person.reasons || []).slice(0, 2);
  return (
    <TouchableOpacity
      style={[s.person, { backgroundColor: colors.surface, borderColor: colors.border }]}
      activeOpacity={0.85}
      onPress={onOpen}
    >
      {person.photoUrl ? (
        <Image source={{ uri: person.photoUrl }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, { backgroundColor: "#EDE4FC", alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ fontFamily: FONTS.display, fontSize: 22, color: "#7C3AED" }}>
            {(person.displayName || "?")[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.personName, { color: colors.text }]} numberOfLines={1}>{person.displayName}</Text>
        {reasons.length > 0 && (
          <Text style={[s.personWhy, { color: "#7C3AED" }]} numberOfLines={1}>
            {reasons.map((r) => t(`matchmaking.affinity.signal.${r}`)).join(" · ")}
          </Text>
        )}
        {tags.length > 0 && (
          <View style={s.tagRow}>
            {tags.map((tg) => {
              const c = MATCH_TYPE_COLORS[tg.type] || MATCH_TYPE_COLORS.brand || { fg: "#7C3AED", bg: "#EDE4FC" };
              return (
                <View key={tg.id} style={[s.tag, { backgroundColor: c.bg }]}>
                  <Icon name={tg.icon} size={11} color={c.fg} />
                  <Text style={[s.tagText, { color: c.fg }]}>{t(`matchmaking.funnyTag.${tg.id}`)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    content: { padding: 16 },
    section: { fontFamily: FONTS.display, fontSize: 16, marginBottom: 12 },
    emptyRow: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, marginBottom: 8 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
    centerIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: "#EDE4FC", alignItems: "center", justifyContent: "center", marginBottom: 4 },
    centerTitle: { fontFamily: FONTS.display, fontSize: 19, textAlign: "center" },
    centerBody: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
    centerCta: { marginTop: 8, height: 48, borderRadius: 24, paddingHorizontal: 28, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
    centerCtaText: { fontFamily: FONTS.bodyBold, fontSize: 15, color: "#fff" },
    person: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
    avatar: { width: 60, height: 60, borderRadius: 30 },
    personName: { fontFamily: FONTS.display, fontSize: 16 },
    personWhy: { fontFamily: FONTS.bodyBold, fontSize: 12, marginTop: 3 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
    tag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    tagText: { fontFamily: FONTS.bodySemibold, fontSize: 10.5 },
    lockedStack: { height: 20 },
    lockedCard: { position: "absolute", left: 12, right: 12, height: 18, borderRadius: 12, top: 0 },
    upsell: { borderRadius: 20, padding: 20, alignItems: "center", gap: 6, marginTop: 6 },
    lockBadge: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center", marginBottom: 4 },
    upsellTitle: { fontFamily: FONTS.display, fontSize: 17, color: "#FFFFFF", textAlign: "center" },
    upsellSub: { fontFamily: FONTS.bodyMedium, fontSize: 13, color: "#D9CBEC", textAlign: "center" },
    hRow: { gap: 12, paddingRight: 8 },
    commCard: { width: 150, borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
    commIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#E1F5EC", alignItems: "center", justifyContent: "center", marginBottom: 4 },
    commName: { fontFamily: FONTS.bodyBold, fontSize: 14 },
    commMeta: { fontFamily: FONTS.bodyMedium, fontSize: 12 },
    evtCard: { width: 160, borderWidth: 1, borderRadius: 16, padding: 10, gap: 6 },
    evtImg: { width: "100%", height: 90, borderRadius: 12 },
    evtTitle: { fontFamily: FONTS.bodyBold, fontSize: 13.5 },
  });
}
