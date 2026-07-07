/**
 * MemberRow — one member in the CRM list. Initials avatar, name (+ at-risk /
 * manual / linked badges), a plan/credits or contact subtitle, status dot.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { MEMBER_STATUS } from "../../services/businessMembersService";
import StatusPill from "./StatusPill";

const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

export default function MemberRow({ member, onPress }) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Subtitle: credits if we have them, else contact, else the enrollment source.
  const parts = [];
  if (typeof member.creditBalance === "number" && member.creditBalance > 0) {
    parts.push(t("business.members.creditsLeft", { count: member.creditBalance }));
  }
  if (member.phone) parts.push(member.phone);
  if (!parts.length && member.email) parts.push(member.email);
  const subtitle = parts.join(" · ");

  const isManual = !member.linkedUid; // no linked app account yet

  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(member.name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {member.name || t("business.members.unnamed")}
          </Text>
          {member.status === MEMBER_STATUS.AT_RISK && <StatusPill status={member.status} size="sm" />}
          {isManual && (
            <View style={[styles.tagChip, { backgroundColor: colors.surfaceGlass }]}>
              <Text style={[styles.tagText, { color: colors.textTertiary }]}>
                {t("business.members.manual")}
              </Text>
            </View>
          )}
        </View>
        {!!subtitle && (
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <StatusPill status={member.status} dotOnly />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontWeight: "800" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  sub: { fontSize: 12.5, marginTop: 2 },
  tagChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  tagText: { fontSize: 10, fontWeight: "700" },
});
