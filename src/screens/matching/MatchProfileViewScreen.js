/**
 * "Your matchmaking profile" — READ-ONLY view (the Profile entry point). Nothing
 * is editable here: the header's Edit action opens MatchProfileScreen in
 * canonical mode, and saving there returns straight back to this view.
 *
 * Empty/incomplete profile → a friendly nudge + CTA into the editor, never a
 * half-rendered profile.
 *
 * Flat cards (1px border, no shadow), Space Grotesk on numbers, Kinlo icon set —
 * no emoji, no system icons; the avatar is the user's real photo.
 */
import React, { useState, useCallback } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { doc, getDoc } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db, auth } from "../../services/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import BigFiveBars from "../../components/matching/BigFiveBars";
import BigFiveInterpretation from "../../components/matching/BigFiveInterpretation";
import { MatchHeader } from "./matchUi";
import {
  getCanonicalMatchProfile,
  getMatchDataFor,
  MATCH_TYPE_COLORS,
} from "../../services/matchingService";
import { funnyTag, isProfileComplete } from "../../constants/matchTags";

export default function MatchProfileViewScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const me = auth.currentUser?.uid;
    const [p, uSnap, md] = await Promise.all([
      getCanonicalMatchProfile(),
      me ? getDoc(doc(db, "users", me)) : Promise.resolve(null),
      me ? getMatchDataFor(me) : Promise.resolve({}),
    ]);
    setProfile(p);
    // personality moved to the gated match subcollection — fold it back onto the
    // `user` object so the existing `user.personality` read keeps working even
    // when the match profile itself isn't filled yet.
    const u = uSnap?.exists() ? uSnap.data() : {};
    u.personality = md.personality ?? null;
    setUser(u);
    setLoading(false);
  }, []);
  // Re-read on focus so returning from the editor shows the saved profile.
  React.useEffect(() => navigation.addListener("focus", load), [navigation, load]);

  const s = createStyles(colors);
  const openEditor = () => navigation.navigate("MatchProfile");
  const personality = user.personality ?? profile?.personality ?? null;
  const complete = isProfileComplete({ ...(profile || {}), personality });

  const header = (
    <MatchHeader
      title={t("matching.profileView.title")}
      onBack={() => navigation.goBack()}
      right={
        <TouchableOpacity onPress={openEditor} hitSlop={8} testID="match-profile-edit">
          <Text style={[s.edit, { color: colors.primary }]}>{t("matching.profileView.edit")}</Text>
        </TouchableOpacity>
      }
    />
  );

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header}
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      </View>
    );
  }

  // Empty / incomplete → friendly nudge, not a broken profile.
  if (!profile || !complete) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {header}
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: colors.brandSoft }]}>
            <Icon name="brain" size={30} color={colors.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: colors.text }]}>{t("matching.profileView.emptyTitle")}</Text>
          <Text style={[s.emptyBody, { color: colors.textSecondary }]}>{t("matching.profileView.emptyBody")}</Text>
          <TouchableOpacity style={[s.emptyCta, { backgroundColor: colors.primary }]} onPress={openEditor}>
            <Text style={s.emptyCtaText}>{t("matching.profileView.emptyCta")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const avatarUrl = user.avatar?.type === "photo" ? user.avatar.value : null;
  const name = user.fullName || user.name || "";
  const tags = (profile.funnyTags || []).map(funnyTag).filter(Boolean);
  const pro = profile.pro || null;
  const hasPro = !!(pro && (pro.role || pro.industry || pro.offer || pro.seek));

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {header}
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <View style={s.identity}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, s.avatarFallback, { backgroundColor: colors.brandSoft }]}>
              <Text style={[s.avatarInitial, { color: colors.primary }]}>
                {(name || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[s.name, { color: colors.text }]}>{name}</Text>
          {!!profile.bio && <Text style={[s.bio, { color: colors.textSecondary }]}>{profile.bio}</Text>}
        </View>

        {/* Looking for */}
        {!!(profile.lookingFor || []).length && (
          <Card s={s} colors={colors} title={t("matching.profile.lookingForLabel")}>
            <View style={s.chips}>
              {profile.lookingFor.map((ty) => {
                const c = MATCH_TYPE_COLORS[ty] || MATCH_TYPE_COLORS.brand;
                return (
                  <View key={ty} style={[s.chip, { backgroundColor: c.bg }]}>
                    <Text style={[s.chipText, { color: c.fg }]}>{t(`matchmaking.type.${ty}`)}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* Vibe: funny tags + interests */}
        {(tags.length > 0 || (profile.interests || []).length > 0) && (
          <Card s={s} colors={colors} title={t("matching.profile.funnyTagsLabel")}>
            {tags.length > 0 && (
              <View style={s.chips}>
                {tags.map((tg) => {
                  const c = MATCH_TYPE_COLORS[tg.type] || MATCH_TYPE_COLORS.brand;
                  return (
                    <View key={tg.id} style={[s.chip, s.chipIcon, { backgroundColor: c.bg }]}>
                      <Icon name={tg.icon} size={12} color={c.fg} />
                      <Text style={[s.chipText, { color: c.fg }]}>{t(`matchmaking.funnyTag.${tg.id}`)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
            {!!(profile.interests || []).length && (
              <>
                <Text style={[s.subLabel, { color: colors.textTertiary }]}>
                  {t("matching.profile.interestsLabel")}
                </Text>
                <View style={s.chips}>
                  {profile.interests.map((i) => (
                    <View key={i} style={[s.chip, { backgroundColor: colors.sunken }]}>
                      <Text style={[s.chipText, { color: colors.textSecondary }]}>
                        {t(`matchmaking.interest.${i}`, { defaultValue: i })}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Card>
        )}

        {/* Energy + how they like to meet */}
        {(profile.energy || profile.groupPref) && (
          <Card s={s} colors={colors} title={t("matching.profile.energyLabel")}>
            {profile.energy && (
              <>
                <EnergyRow
                  s={s} colors={colors}
                  low={t("matching.profile.energyChill")}
                  high={t("matching.profile.energyAdventurous")}
                  value={profile.energy.adventure}
                />
                <EnergyRow
                  s={s} colors={colors}
                  low={t("matching.profile.energyIntrovert")}
                  high={t("matching.profile.energyExtrovert")}
                  value={profile.energy.social}
                />
              </>
            )}
            {!!profile.groupPref && (
              <View style={[s.chips, { marginTop: 10 }]}>
                <View style={[s.chip, { backgroundColor: colors.brandSoft }]}>
                  <Text style={[s.chipText, { color: colors.primary }]}>
                    {t(`matchmaking.groupPref.${profile.groupPref}`)}
                  </Text>
                </View>
              </View>
            )}
          </Card>
        )}

        {/* Languages: speaks / learning */}
        {((profile.languages || []).length > 0 || (profile.learning || []).length > 0) && (
          <Card s={s} colors={colors} title={t("matching.profile.languagesLabel")}>
            {!!(profile.languages || []).length && (
              <View style={s.chips}>
                {profile.languages.map((l) => (
                  <View key={l} style={[s.chip, { backgroundColor: colors.sunken }]}>
                    <Text style={[s.chipText, { color: colors.textSecondary }]}>
                      {t(`matchmaking.language.${l}`)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {!!(profile.learning || []).length && (
              <>
                <Text style={[s.subLabel, { color: colors.textTertiary }]}>
                  {t("matching.profile.learningLabel")}
                </Text>
                <View style={s.chips}>
                  {profile.learning.map((l) => (
                    <View key={l} style={[s.chip, { backgroundColor: colors.sunken }]}>
                      <Text style={[s.chipText, { color: colors.textSecondary }]}>
                        {t(`matchmaking.learning.${l}`)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Card>
        )}

        {/* Professional — only when they filled it */}
        {hasPro && (
          <Card s={s} colors={colors} title={t("matching.profile.proLabel")}>
            {!!pro.role && <Text style={[s.proRole, { color: colors.text }]}>{pro.role}</Text>}
            {!!pro.industry && (
              <View style={[s.chips, { marginTop: 8 }]}>
                <View style={[s.chip, { backgroundColor: MATCH_TYPE_COLORS.professional.bg }]}>
                  <Text style={[s.chipText, { color: MATCH_TYPE_COLORS.professional.fg }]}>
                    {t(`matchmaking.industry.${pro.industry}`)}
                  </Text>
                </View>
              </View>
            )}
          </Card>
        )}

        {/* Icebreaker */}
        {!!profile.icebreaker && (
          <Card s={s} colors={colors} title={t("matching.profile.icebreaker")}>
            <Text style={[s.iceText, { color: colors.text }]}>{profile.icebreaker}</Text>
          </Card>
        )}

        {/* Big Five — all five, then the reading. testID for the Maestro smoke
            that verifies personality reads from the gated subcollection (#52). */}
        <View testID="match-bigfive">
          <Card s={s} colors={colors} title={t("matching.profile.personalityLabel")}>
            <BigFiveBars personality={personality} />
          </Card>
        </View>
        <BigFiveInterpretation personality={personality} />
      </ScrollView>
    </View>
  );
}

/** A flat section card (1px border, no shadow). */
function Card({ s, colors, title, children }) {
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[s.cardTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

/** One read-only energy axis: a filled track between two labels. */
function EnergyRow({ s, colors, low, high, value }) {
  const v = Math.max(0, Math.min(100, typeof value === "number" ? value : 50));
  return (
    <View style={s.energyRow}>
      <View style={[s.energyTrack, { backgroundColor: colors.sunken }]}>
        <View style={[s.energyDot, { left: `${v}%`, backgroundColor: colors.primary }]} />
      </View>
      <View style={s.energyLabels}>
        <Text style={[s.energyLabel, { color: colors.textTertiary }]}>{low}</Text>
        <Text style={[s.energyLabel, { color: colors.textTertiary }]}>{high}</Text>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    edit: { fontFamily: FONTS.bodyBold, fontSize: 14.5 },
    identity: { alignItems: "center", gap: 6, marginBottom: 4 },
    avatar: { width: 84, height: 84, borderRadius: 42 },
    avatarFallback: { alignItems: "center", justifyContent: "center" },
    avatarInitial: { fontFamily: FONTS.display, fontSize: 32 },
    name: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.3, marginTop: 4 },
    bio: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, lineHeight: 19, textAlign: "center", paddingHorizontal: 12 },
    card: { borderWidth: 1, borderRadius: 18, padding: 16 },
    cardTitle: { fontFamily: FONTS.display, fontSize: 15, marginBottom: 12 },
    subLabel: {
      fontFamily: FONTS.display, fontSize: 10, letterSpacing: 0.8,
      textTransform: "uppercase", marginTop: 14, marginBottom: 8,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    chip: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
    chipIcon: { flexDirection: "row", alignItems: "center", gap: 5 },
    chipText: { fontFamily: FONTS.bodySemibold, fontSize: 12 },
    energyRow: { marginBottom: 12 },
    energyTrack: { height: 7, borderRadius: 4, justifyContent: "center" },
    energyDot: { position: "absolute", width: 13, height: 13, borderRadius: 7, marginLeft: -6.5 },
    energyLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
    energyLabel: { fontFamily: FONTS.bodyMedium, fontSize: 11 },
    proRole: { fontFamily: FONTS.bodyBold, fontSize: 14 },
    iceText: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, lineHeight: 19 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 36, gap: 12 },
    emptyIcon: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    emptyTitle: { fontFamily: FONTS.display, fontSize: 19, textAlign: "center" },
    emptyBody: { fontFamily: FONTS.bodyMedium, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
    emptyCta: { marginTop: 8, height: 48, borderRadius: 24, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
    emptyCtaText: { fontFamily: FONTS.bodyBold, fontSize: 15, color: "#FFFFFF" },
  });
}
