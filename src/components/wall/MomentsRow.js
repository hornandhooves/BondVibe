/**
 * Moments row (Wall v2 · P3) — the ephemeral 24h stories strip at the top of
 * "Para ti". FIDELITY §5: 58px avatars; authors with content get the
 * #7C3AED→#E91E8C gradient ring (2.5px) + a 2px white inner gap; "Your moment"
 * is a dashed #C9B0F2 add tile. Nothing to show → the row hides itself.
 */
import React, { useState, useCallback } from "react";
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../Icon";
import { AvatarDisplay } from "../AvatarPicker";
import { getMomentsFeed } from "../../services/momentService";

const normAvatar = (a) => (!a ? null : typeof a === "string" ? { type: "emoji", value: a } : a);

export default function MomentsRow({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [groups, setGroups] = useState([]);

  const load = useCallback(async () => {
    setGroups(await getMomentsFeed());
  }, []);
  React.useEffect(() => {
    const unsub = navigation?.addListener?.("focus", load);
    load();
    return unsub;
  }, [navigation, load]);

  const mine = groups.find((g) => g.isMine);
  const others = groups.filter((g) => !g.isMine);
  const s = createStyles(colors);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {/* Your moment — add (opens compose with the Moment consent copy). */}
      <TouchableOpacity
        style={s.item}
        activeOpacity={0.85}
        onPress={() => navigation.navigate("CreatePost", { presetMoment: true })}
      >
        <View style={s.addRing}>
          {mine ? (
            <Image source={{ uri: mine.items[0].url }} style={s.addImg} />
          ) : (
            <Icon name="add" size={22} color="#7C3AED" />
          )}
        </View>
        <Text style={[s.label, { color: colors.textSecondary }]} numberOfLines={1}>
          {t("wall.moments.yours")}
        </Text>
      </TouchableOpacity>

      {others.map((g) => (
        <TouchableOpacity
          key={g.authorId}
          style={s.item}
          activeOpacity={0.85}
          onPress={() => navigation.navigate("MomentViewer", { authorId: g.authorId })}
        >
          <LinearGradient
            colors={["#7C3AED", "#E91E8C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.ring}
          >
            <View style={[s.ringInner, { backgroundColor: colors.background }]}>
              {g.items[0]?.url ? (
                <Image source={{ uri: g.items[0].url }} style={s.avatarImg} />
              ) : (
                <AvatarDisplay avatar={normAvatar(g.authorAvatar)} size={50} />
              )}
            </View>
          </LinearGradient>
          <Text style={[s.label, { color: colors.textSecondary }]} numberOfLines={1}>
            {g.authorName}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    row: { gap: 14, paddingHorizontal: 16, paddingBottom: 14 },
    item: { alignItems: "center", width: 66, gap: 6 },
    addRing: {
      width: 58, height: 58, borderRadius: 29,
      borderWidth: 2, borderStyle: "dashed", borderColor: "#C9B0F2",
      alignItems: "center", justifyContent: "center", overflow: "hidden",
    },
    addImg: { width: "100%", height: "100%" },
    ring: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", padding: 2.5 },
    ringInner: { width: "100%", height: "100%", borderRadius: 27, padding: 2, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    avatarImg: { width: "100%", height: "100%", borderRadius: 25 },
    label: { fontFamily: FONTS.bodyMedium, fontSize: 9.5, textAlign: "center" },
  });
}
