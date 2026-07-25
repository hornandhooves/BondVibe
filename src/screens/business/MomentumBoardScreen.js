/**
 * MomentumBoardScreen — the Momentum Kanban (kinlo_business/02 §B). Editable
 * columns; cards grouped by stage. Move a card by dragging it (long-press to
 * lift, drop on a column) or via the column picker (the reliable fallback).
 * Drag is dependency-free — core PanResponder + Animated, no native rebuild.
 * Add cards from members or bulk-populate from at-risk/inactive members.
 */
import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  Animated,
  PanResponder,
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
import { useAsyncLoad } from "../../hooks/useAsyncLoad";

const PRIORITY_FILTERS = [null, "urgent", "high", "medium", "low"];

/**
 * A card that can be lifted with a long-press and dragged. Kept at module scope
 * (never redefined per render) so its PanResponder identity survives the parent
 * re-renders a drag triggers. Latest callbacks are read through a ref to avoid
 * stale closures; `armedRef` (set on long-press) gates the capture so normal
 * taps and scrolls are never hijacked.
 */
function DragCard({ card, dragging, armedRef, onLift, onMoveDrag, onDrop, onPress, onMove }) {
  const viewRef = useRef(null);
  const cbs = useRef({});
  cbs.current = { onLift, onMoveDrag, onDrop };
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (e, g) =>
        armedRef.current === card.id && Math.abs(g.dx) + Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        if (viewRef.current) {
          viewRef.current.measureInWindow((x, y, w) => cbs.current.onLift(card, x, y, w));
        } else {
          cbs.current.onLift(card, 0, 0, 240);
        }
      },
      onPanResponderMove: (e, g) => cbs.current.onMoveDrag(g),
      onPanResponderRelease: (e, g) => cbs.current.onDrop(card, g.moveX, g.moveY),
      onPanResponderTerminate: () => cbs.current.onDrop(card, -1, -1),
    })
  ).current;

  return (
    <Animated.View ref={viewRef} collapsable={false} {...responder.panHandlers} style={dragging && { opacity: 0.25 }}>
      <MomentumCard
        card={card}
        onPress={onPress}
        onMove={onMove}
        onLongPress={() => { armedRef.current = card.id; }}
        onPressOut={() => { if (armedRef.current === card.id && !dragging) armedRef.current = null; }}
        dragging={dragging}
      />
    </Animated.View>
  );
}

export default function MomentumBoardScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [board, setBoard] = useState(null);
  const [cards, setCards] = useState([]);
  const { loading, run } = useAsyncLoad();
  const [movingCard, setMovingCard] = useState(null);
  const [pickMember, setPickMember] = useState(false);
  const [members, setMembers] = useState([]);
  // Multi-select health-status filter (BUG 24). Empty set = All.
  const [priorityFilters, setPriorityFilters] = useState(new Set());

  const toggleFilter = (p) => {
    if (!p) { setPriorityFilters(new Set()); return; } // "All" clears the set
    setPriorityFilters((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); // removing the last snaps back to All
      else next.add(p);
      return next;
    });
  };

  // ── Drag & drop (dependency-free) ──────────────────────────────────────────
  const armedRef = useRef(null);          // card id armed by a long-press
  const colRefs = useRef({});             // colId -> column View (for measuring)
  const colFrames = useRef({});           // colId -> { x, w } in window coords
  const [drag, setDrag] = useState(null); // { card, x, y, w } while lifting
  const [hoverCol, setHoverCol] = useState(null);
  const pan = useRef(new Animated.ValueXY()).current;

  const onLift = useCallback((card, x, y, w) => {
    // Snapshot every visible column's on-screen frame so the drop can hit-test.
    Object.entries(colRefs.current).forEach(([id, r]) => {
      r?.measureInWindow?.((cx, cy, cw) => { colFrames.current[id] = { x: cx, w: cw }; });
    });
    pan.setValue({ x: 0, y: 0 });
    setDrag({ card, x, y, w: w || 240 });
  }, [pan]);

  const columnAtX = useCallback((moveX) => {
    const hit = Object.entries(colFrames.current).find(
      ([, f]) => moveX >= f.x && moveX <= f.x + f.w
    );
    return hit ? hit[0] : null;
  }, []);

  const onMoveDrag = useCallback((g) => {
    pan.setValue({ x: g.dx, y: g.dy });
    setHoverCol(columnAtX(g.moveX));
  }, [pan, columnAtX]);

  const onDrop = useCallback(async (card, moveX, moveY) => {
    armedRef.current = null;
    setDrag(null);
    setHoverCol(null);
    if (moveX < 0) return; // terminated (cancelled)
    const colId = columnAtX(moveX);
    if (colId && colId !== card.stage) {
      const col = (board?.columns || []).find((c) => c.id === colId);
      if (col) {
        await moveCard(card, col.id, columnName(col, t));
        load();
      }
    }
  }, [board, columnAtX, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(
    () =>
      run(async () => {
        const [b, c] = await Promise.all([getBoard(), listCards()]);
        setBoard(b);
        setCards(c);
      }),
    [run]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const columns = (board?.columns || [])
    .filter((c) => !c.archived)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const allSelected = priorityFilters.size === 0;
  const visibleCards = allSelected
    ? cards
    : cards.filter((c) => priorityFilters.has(c.priority));

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

      {/* Health-status filter — multi-select (BUG 24) */}
      <Text style={[styles.filterHeading, { color: colors.textTertiary }]}>{t("business.momentum.healthStatus")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {PRIORITY_FILTERS.map((p) => {
          const active = p ? priorityFilters.has(p) : allSelected;
          return (
            <TouchableOpacity
              key={p || "all"}
              onPress={() => toggleFilter(p)}
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.boardRow}
          scrollEnabled={!drag}
        >
          {columns.map((col) => {
            const colCards = visibleCards.filter((c) => c.stage === col.id);
            const isTarget = drag && hoverCol === col.id && col.id !== drag.card.stage;
            return (
              <View
                key={col.id}
                ref={(r) => { colRefs.current[col.id] = r; }}
                collapsable={false}
                style={[
                  styles.column,
                  isTarget && { backgroundColor: `${col.color || colors.primary}12`, borderRadius: 14 },
                ]}
              >
                <View style={styles.colHeader}>
                  <View style={[styles.colDot, { backgroundColor: col.color || colors.primary }]} />
                  <Text style={[styles.colName, { color: colors.text }]} numberOfLines={1}>{columnName(col, t)}</Text>
                  <Text style={[styles.colCount, { color: colors.textTertiary }]}>{colCards.length}</Text>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={!drag} contentContainerStyle={{ paddingBottom: 20 }}>
                  {colCards.map((card) => (
                    <DragCard
                      key={card.id}
                      card={card}
                      dragging={drag?.card.id === card.id}
                      armedRef={armedRef}
                      onLift={onLift}
                      onMoveDrag={onMoveDrag}
                      onDrop={onDrop}
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

      {/* Floating drag copy — rendered above everything, follows the finger. */}
      {drag && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragGhost,
            { left: drag.x, top: drag.y, width: drag.w, transform: pan.getTranslateTransform() },
          ]}
        >
          <MomentumCard card={drag.card} onPress={() => {}} onMove={() => {}} dragging />
        </Animated.View>
      )}

      {drag && (
        <View pointerEvents="none" style={styles.dragHintWrap}>
          <View style={[styles.dragHint, { backgroundColor: colors.text }]}>
            <Text style={[styles.dragHintText, { color: colors.background }]}>{t("business.momentum.dragHint")}</Text>
          </View>
        </View>
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
    filterHeading: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 20, marginBottom: 6 },
    filterScroll: { flexGrow: 0 },
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
    dragGhost: { position: "absolute", zIndex: 1000, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 16 },
    dragHintWrap: { position: "absolute", top: 108, left: 0, right: 0, alignItems: "center" },
    dragHint: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
    dragHintText: { fontSize: 12.5, fontWeight: "700" },
  });
}
