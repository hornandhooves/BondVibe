/**
 * "Te presentamos a…" — a curated-set card (P2). Context-first: it leads with
 * WHY (shared communities + the affinity reasons), never with age. Avatars are
 * real photos + the custom Kinlo funny-tag icons — no emoji, no system icons.
 *
 * Two actions: "Conectar" (a private, double opt-in intro — the other person
 * only learns of it if they also opt in) and "Dejar de sugerir" (matchExclusions
 * — this is NOT a block, they just stop appearing here).
 */
import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../Icon";
import { funnyTag } from "../../constants/matchTags";
import { MATCH_TYPE_COLORS } from "../../services/matchingService";

export default function PresentationCard({ member, onConnect, onDismiss, onOpenProfile }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const s = createStyles(colors);
  if (dismissed) return null;

  const tags = (member.funnyTags || []).map(funnyTag).filter(Boolean).slice(0, 4);
  const reasons = (member.reasons || []).slice(0, 3);
  const shared = member.sharedCommunities || 0;

  const context =
    shared > 0
      ? t("matchmaking.curated.sharedCommunities", { count: shared })
      : t("matchmaking.curated.becauseAffinity");

  const connect = async () => {
    setPending(true);
    try {
      await onConnect?.(member);
    } finally {
      setPending(false);
    }
  };
  const dismiss = async () => {
    setDismissed(true);
    await onDismiss?.(member);
  };

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        style={s.head}
        activeOpacity={0.85}
        onPress={() => onOpenProfile?.(member)}
      >
        {member.photoUrl ? (
          <Image source={{ uri: member.photoUrl }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarInitial}>{(member.displayName || "?")[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          {/* Context-first — no age, ever. */}
          <Text style={[s.context, { color: "#7C3AED" }]} numberOfLines={2}>
            {context}
          </Text>
          <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
            {member.displayName}
          </Text>
        </View>
      </TouchableOpacity>

      {tags.length > 0 && (
        <View style={s.tagRow}>
          {tags.map((tg) => {
            const c = MATCH_TYPE_COLORS[tg.type] || MATCH_TYPE_COLORS.brand;
            return (
              <View key={tg.id} style={[s.tag, { backgroundColor: c.bg }]}>
                <Icon name={tg.icon} size={13} color={c.fg} />
                <Text style={[s.tagText, { color: c.fg }]}>{t(`matchmaking.funnyTag.${tg.id}`)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {reasons.length > 0 && (
        <View style={s.reasons}>
          {reasons.map((r) => (
            <Text key={r} style={[s.reason, { color: colors.textSecondary }]}>
              {t(`matchmaking.affinity.signal.${r}`)}
            </Text>
          ))}
        </View>
      )}

      <View style={s.actions}>
        <TouchableOpacity
          style={[s.connect, { backgroundColor: "#7C3AED", opacity: pending ? 0.6 : 1 }]}
          onPress={connect}
          disabled={pending}
        >
          <Icon name="heart" size={16} color="#fff" />
          <Text style={s.connectText}>{t("matchmaking.curated.connect")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.dismiss} onPress={dismiss} hitSlop={8}>
          <Text style={[s.dismissText, { color: colors.textTertiary }]}>
            {t("matchmaking.curated.dontSuggest")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 14 },
    head: { flexDirection: "row", alignItems: "center", gap: 14 },
    avatar: { width: 66, height: 66, borderRadius: 33 },
    avatarFallback: { backgroundColor: "#EDE4FC", alignItems: "center", justifyContent: "center" },
    avatarInitial: { fontFamily: FONTS.display, fontSize: 26, color: "#7C3AED" },
    context: { fontFamily: FONTS.bodyBold, fontSize: 12.5, lineHeight: 17 },
    name: { fontFamily: FONTS.display, fontSize: 18, marginTop: 2 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 },
    tag: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    tagText: { fontFamily: FONTS.bodySemibold, fontSize: 11.5 },
    reasons: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
    reason: { fontFamily: FONTS.bodyMedium, fontSize: 11.5 },
    actions: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 16 },
    connect: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      height: 44, borderRadius: 22,
    },
    connectText: { fontFamily: FONTS.bodyBold, fontSize: 14.5, color: "#fff" },
    dismiss: { paddingHorizontal: 6, paddingVertical: 10 },
    dismissText: { fontFamily: FONTS.bodySemibold, fontSize: 12.5 },
  });
}
