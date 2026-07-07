/**
 * MomentumBoardScreen — the Momentum Kanban (kinlo_business/02 §B). Editable
 * columns; cards grouped by stage. Move a card via the column picker (reliable
 * on mobile; drag-and-drop is a follow-up). Add cards from members or bulk-
 * populate from at-risk/inactive members.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import MomentumCard from "../../components/business/MomentumCard";
import { useTheme } from "../../contexts/ThemeContext";
import {
  getBoard,
  listCards,
  moveCard,
  createCard,
  populateAtRisk,
} from "../../services/businessMomentumService";
import { listMembers } from "../../services/businessMembersService";
import { columnName } from "../../constants/momentumDefaults";

const PRIORITY_FILTERS = [null, "urgent", "high", "medium", "low"];

export default function MomentumBoardScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [board, setBoard] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [movingCard, setMovingCard] = useState(null);
  const [pickMember, setPickMember] = useState(false);
  const [members, setMembers] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState(null);

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([getBoard(), listCards()]);
    setBoard(b);
    setCards(c);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const columns = (board?.columns || [])
    .filter((c) => !c.archived)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const visibleCards = priorityFilter
    ? cards.filter((c) => c.priority === priorityFilter)
    : cards;

  const onMove = async (col) => {
    const card = movingCard;
    setMovingCard(null);
    if (!card) return;
    await moveCard(card, col.id, columnName(col, t));
    load();
  };

  const openMemberPicker = async () => {
    setMembers(await listMembers());
    setPickMember(true);
  };

  const onPickMember = async (m) => {
    setPickMember(false);
    const stage = columns[0]?.id || "at_risk";
    const card = await createCard({ memberId: m.id, memberName: m.name, stage });
    navigation.navigate("MomentumCard", { cardId: card.id });
  };

  const onPopulate = async () => {
    const n = await populateAtRisk();
    await load();
    Alert.alert(
      t("business.momentum.populatedTitle"),
      n > 0 ? t("business.momentum.populatedMsg", { count: n }) : t("business.momentum.populatedNone")
    );
  };

  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {board?.name || t("business.momentum.title")}
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate("MomentumColumns")}>
            <Icon name="settings" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openMemberPicker}>
            <Icon name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Priority filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {PRIORITY_FILTERS.map((p) => {
          const active = priorityFilter === p;
          return (
            <TouchableOpacity
              key={p || "all"}
              onPress={() => setPriorityFilter(p)}
              style={[styles.filterChip, { backgroundColor: active ? colors.text : colors.surfaceGlass }]}
            >
              <Text style={[styles.filterText, { color: active ? colors.background : colors.textSecondary }]}>
                {p ? t(`business.momentum.priority.${p}`) : t("business.momentum.allPriorities")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyArt, { backgroundColor: colors.brandSoft }]}>
            <Icon name="analytics" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("business.momentum.emptyTitle")}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("business.momentum.emptyText")}</Text>
          <TouchableOpacity style={[styles.cta, { backgroundColor: colors.primary }]} onPress={onPopulate}>
            <Text style={styles.ctaText}>{t("business.momentum.populateCta")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryCta} onPress={openMemberPicker}>
            <Text style={[styles.secondaryCtaText, { color: colors.primary }]}>{t("business.momentum.addCard")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardRow}>
          {columns.map((col) => {
            const colCards = visibleCards.filter((c) => c.stage === col.id);
            return (
              <View key={col.id} style={styles.column}>
                <View style={styles.colHeader}>
                  <View style={[styles.colDot, { backgroundColor: col.color || colors.primary }]} />
                  <Text style={[styles.colName, { color: colors.text }]} numberOfLines={1}>{columnName(col, t)}</Text>
                  <Text style={[styles.colCount, { color: colors.textTertiary }]}>{colCards.length}</Text>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                  {colCards.map((card) => (
                    <MomentumCard
                      key={card.id}
                      card={card}
                      onPress={() => navigation.navigate("MomentumCard", { cardId: card.id })}
                      onMove={() => setMovingCard(card)}
                    />
                  ))}
                  {colCards.length === 0 && (
                    <Text style={[styles.colEmpty, { color: colors.textTertiary }]}>—</Text>
                  )}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Move-to-column picker */}
      <Modal visible={!!movingCard} transparent animationType="fade" onRequestClose={() => setMovingCard(null)}>
        <TouchableOpacity style={styles.centerBackdrop} activeOpacity={1} onPress={() => setMovingCard(null)}>
          <View style={[styles.pickerCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>{t("business.momentum.moveTo")}</Text>
            {columns.map((col) => (
              <TouchableOpacity key={col.id} style={styles.pickerRow} onPress={() => onMove(col)}>
                <View style={[styles.colDot, { backgroundColor: col.color || colors.primary }]} />
                <Text style={[styles.pickerRowText, { color: colors.text }]}>{columnName(col, t)}</Text>
                {movingCard?.stage === col.id && <Icon name="successCircle" size={16} color={colors.success} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Member picker for a new card */}
      <Modal visible={pickMember} transparent animationType="slide" onRequestClose={() => setPickMember(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>{t("business.momentum.pickMember")}</Text>
              <TouchableOpacity onPress={() => setPickMember(false)}>
                <Icon name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {members.length === 0 ? (
                <Text style={{ color: colors.textTertiary, textAlign: "center", paddingVertical: 24 }}>
                  {t("business.members.emptyTitle")}
                </Text>
              ) : (
                members.map((m) => (
                  <TouchableOpacity key={m.id} style={[styles.memberRow, { borderColor: colors.border }]} onPress={() => onPickMember(m)}>
                    <Text style={[styles.memberName, { color: colors.text }]}>{m.name}</Text>
                    <Icon name="forward" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10, gap: 12 },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: "800" },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 14 },
    addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    filterRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 10 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
    filterText: { fontSize: 12, fontWeight: "700" },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    boardRow: { paddingHorizontal: 14, gap: 12, paddingBottom: 10 },
    column: { width: 260 },
    colHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingBottom: 10 },
    colDot: { width: 10, height: 10, borderRadius: 5 },
    colName: { flex: 1, fontSize: 14, fontWeight: "800" },
    colCount: { fontSize: 13, fontWeight: "700" },
    colEmpty: { textAlign: "center", paddingVertical: 20, fontSize: 16 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36 },
    emptyArt: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" },
    emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 20 },
    cta: { borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28 },
    ctaText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    secondaryCta: { paddingVertical: 14 },
    secondaryCtaText: { fontSize: 14, fontWeight: "700" },
    centerBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 32 },
    pickerCard: { width: "100%", borderRadius: 18, padding: 18 },
    pickerTitle: { fontSize: 16, fontWeight: "800", marginBottom: 12 },
    pickerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
    pickerRowText: { flex: 1, fontSize: 15, fontWeight: "600" },
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    memberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
    memberName: { fontSize: 15, fontWeight: "600" },
  });
}
