/**
 * MomentumCard — one card in a Momentum board column (kinlo_business/02 §B).
 * Shows the member, action title, priority, labels, status, due date and a
 * checklist progress. The move affordance opens a column picker (parent).
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../Icon";
import { useTheme } from "../../contexts/ThemeContext";

export function priorityColor(priority, colors) {
  return (
    {
      urgent: colors.error,
      high: colors.warning,
      medium: colors.primary,
      low: colors.textTertiary,
    }[priority] || colors.textTertiary
  );
}

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export default function MomentumCard({ card, onPress, onMove }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const pColor = priorityColor(card.priority, colors);
  const checklist = Array.isArray(card.checklist) ? card.checklist : [];
  const done = checklist.filter((c) => c.done).length;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.top}>
        <View style={[styles.priority, { backgroundColor: `${pColor}22` }]}>
          <Text style={[styles.priorityText, { color: pColor }]}>{t(`business.momentum.priority.${card.priority}`)}</Text>
        </View>
        <TouchableOpacity onPress={onMove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="more" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {!!card.actionTitle && (
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{card.actionTitle}</Text>
      )}

      <View style={styles.memberRow}>
        <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(card.memberName)}</Text>
        </View>
        <Text style={[styles.memberName, { color: colors.textSecondary }]} numberOfLines={1}>
          {card.memberName || t("business.members.unnamed")}
        </Text>
      </View>

      {(!!card.labels?.length || !!card.dueDate || checklist.length > 0 || card.actionStatus !== "todo") && (
        <View style={styles.metaRow}>
          {card.actionStatus && card.actionStatus !== "todo" && (
            <View style={[styles.metaChip, { backgroundColor: colors.surfaceGlass }]}>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {t(`business.momentum.status.${card.actionStatus}`)}
              </Text>
            </View>
          )}
          {checklist.length > 0 && (
            <View style={[styles.metaChip, { backgroundColor: colors.surfaceGlass }]}>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{done}/{checklist.length}</Text>
            </View>
          )}
          {!!card.dueDate && (
            <View style={[styles.metaChip, { backgroundColor: colors.surfaceGlass }]}>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{new Date(card.dueDate).toLocaleDateString()}</Text>
            </View>
          )}
          {(card.labels || []).slice(0, 2).map((l) => (
            <View key={l} style={[styles.metaChip, { backgroundColor: `${colors.primary}14` }]}>
              <Text style={[styles.metaText, { color: colors.primary }]}>{l}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  priority: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  priorityText: { fontSize: 10.5, fontWeight: "800", textTransform: "uppercase" },
  title: { fontSize: 14, fontWeight: "700", marginBottom: 10, lineHeight: 19 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 10.5, fontWeight: "800" },
  memberName: { flex: 1, fontSize: 12.5, fontWeight: "600" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  metaChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  metaText: { fontSize: 10.5, fontWeight: "700" },
});
