/**
 * AgendaScreen — the 24-hour per-staff Agenda (kinlo_business/05 §F, mockup #4).
 * Pick a date + a staff member → their day: a full 24h HH:mm timeline (30-min
 * rows) merging that staff's classes + private sessions + host-defined block-off
 * ("Unavailable") time. Tap an empty slot to add a session or block time off.
 */
import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, TextInput,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { BRAND } from "../../constants/theme-tokens";
import { auth } from "../../services/firebase";
import { listStaff } from "../../services/businessStaffService";
import {
  getDayItems, createAgendaBlock, deleteAgendaBlock, AGENDA_ITEM_KIND,
} from "../../services/businessAgendaService";

const ROW_H = 56; // px per 30-min slot
const SLOTS = 48; // 24h × 2
const pad2 = (n) => String(n).padStart(2, "0");
const slotLabel = (i) => `${pad2(Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`;
const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const minsFromMidnight = (d) => d.getHours() * 60 + d.getMinutes();
const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export default function AgendaScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();

  const days = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, []);

  const [date, setDate] = useState(days[0]);
  const [staff, setStaff] = useState([]);
  const [staffUid, setStaffUid] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slotModal, setSlotModal] = useState(null); // { min }
  const [blockDraft, setBlockDraft] = useState(null); // { min, label, durationMin }

  const selectedStaff = staff.find((s) => s.id === staffUid);

  const loadStaff = useCallback(async () => {
    const list = await listStaff();
    const withSelf = list.length ? list : [{ id: auth.currentUser?.uid, name: "", role: "owner" }];
    setStaff(withSelf);
    setStaffUid((cur) => cur || withSelf[0]?.id || auth.currentUser?.uid);
  }, []);

  const loadDay = useCallback(async () => {
    if (!staffUid) return;
    setLoading(true);
    const it = await getDayItems(staffUid, selectedStaff?.name, date);
    setItems(it);
    setLoading(false);
  }, [staffUid, selectedStaff?.name, date]);

  useFocusEffect(useCallback(() => { loadStaff(); }, [loadStaff]));
  useFocusEffect(useCallback(() => { loadDay(); }, [loadDay]));

  const openSlot = (i) => setSlotModal({ min: i * 30 });

  const startNewSession = () => {
    const start = new Date(date);
    start.setHours(Math.floor(slotModal.min / 60), slotModal.min % 60, 0, 0);
    setSlotModal(null);
    navigation.navigate("BusinessBookingForm", {
      start: start.toISOString(),
      staffUid,
      time: `${pad2(Math.floor(slotModal.min / 60))}:${pad2(slotModal.min % 60)}`,
    });
  };

  const openBlockDraft = () => {
    setBlockDraft({ min: slotModal.min, label: "", durationMin: 30 });
    setSlotModal(null);
  };

  const saveBlock = async () => {
    const start = new Date(date);
    start.setHours(Math.floor(blockDraft.min / 60), blockDraft.min % 60, 0, 0);
    const end = new Date(start.getTime() + blockDraft.durationMin * 60000);
    await createAgendaBlock({ staffUid, start, end, label: blockDraft.label, type: "blocked" });
    setBlockDraft(null);
    loadDay();
  };

  const onItemPress = (item) => {
    if (item.kind === AGENDA_ITEM_KIND.SESSION && item.bookingId) {
      navigation.navigate("BusinessSessionDetail", { bookingId: item.bookingId });
    } else if (item.kind === AGENDA_ITEM_KIND.BLOCKED) {
      setBlockDraft(null);
      // Tap a block to remove it.
      deleteAgendaBlock(item.id).then(loadDay);
    }
  };

  const styles = createStyles(colors);
  const dayName = (d) => d.toLocaleDateString(i18n.language, { weekday: "short" }).toUpperCase();

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.agenda.title")}</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate("BusinessBookingForm", { staffUid })}
        >
          <Icon name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Day strip */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
          {days.map((d) => {
            const on = d.toDateString() === date.toDateString();
            return (
              <TouchableOpacity
                key={d.toISOString()}
                onPress={() => setDate(d)}
                style={[styles.dayCell, { backgroundColor: on ? colors.text : colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.dayName, { color: on ? colors.background : colors.textTertiary }]}>{dayName(d)}</Text>
                <Text style={[styles.dayNum, { color: on ? colors.background : colors.text }]}>{d.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Staff chips */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffStrip}>
          {staff.map((s) => {
            const on = s.id === staffUid;
            const name = s.name || t("business.agenda.you");
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => setStaffUid(s.id)}
                style={[styles.staffChip, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
              >
                <View style={[styles.staffAvatar, { backgroundColor: on ? "rgba(255,255,255,0.25)" : colors.brandSoft }]}>
                  <Text style={[styles.staffAvatarText, { color: on ? "#fff" : colors.primary }]}>{initials(name)}</Text>
                </View>
                <Text style={[styles.staffName, { color: on ? "#fff" : colors.text }]} numberOfLines={1}>{name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t("business.agenda.class")}</Text>
        <View style={[styles.legendDot, { backgroundColor: colors.textTertiary, marginLeft: 14 }]} />
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t("business.agenda.blocked")}</Text>
        <Text style={[styles.legendHint, { color: colors.textTertiary }]}>{t("business.agenda.tapSlot")}</Text>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ height: SLOTS * ROW_H }} showsVerticalScrollIndicator={false}>
          {/* Background rows (time gutter + tappable empty slot) */}
          {Array.from({ length: SLOTS }, (_, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.6}
              style={[styles.slotRow, { height: ROW_H, borderTopColor: colors.border }]}
              onPress={() => openSlot(i)}
            >
              <Text style={[styles.slotLabel, { color: colors.textTertiary }]}>{slotLabel(i)}</Text>
              <View style={styles.slotAdd}>
                <Icon name="plus" size={13} color={colors.textTertiary} />
                <Text style={[styles.slotAddText, { color: colors.textTertiary }]}>{t("business.agenda.add")}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Item cards positioned absolutely by time */}
          {items.map((item) => {
            const top = (minsFromMidnight(item.start) / 30) * ROW_H;
            const dur = Math.max(30, (item.end - item.start) / 60000);
            const height = (dur / 30) * ROW_H - 6;
            const range = `${hhmm(item.start)}–${hhmm(item.end)}`;
            if (item.kind === AGENDA_ITEM_KIND.BLOCKED) {
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.8}
                  onPress={() => onItemPress(item)}
                  style={[styles.itemCard, styles.blockedCard, { top: top + 3, height, borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                >
                  <Icon name="lock" size={13} color={colors.textTertiary} />
                  <Text style={[styles.blockedText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t("business.agenda.unavailable")}{item.label ? ` · ${item.label}` : ""} {range}
                  </Text>
                </TouchableOpacity>
              );
            }
            const isClass = item.kind === AGENDA_ITEM_KIND.CLASS;
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                onPress={() => onItemPress(item)}
                style={[styles.itemCard, { top: top + 3, height, overflow: "hidden" }]}
              >
                <LinearGradient
                  colors={isClass ? BRAND.gradient : [colors.success, colors.success]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemMeta} numberOfLines={1}>{range}{item.subtitle ? ` · ${item.subtitle}` : ""}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Empty-slot action sheet */}
      <Modal visible={!!slotModal} transparent animationType="fade" onRequestClose={() => setSlotModal(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSlotModal(null)}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {slotModal ? `${pad2(Math.floor(slotModal.min / 60))}:${pad2(slotModal.min % 60)}` : ""}
            </Text>
            <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: colors.primary }]} onPress={startNewSession}>
              <Icon name="calendar" size={17} color="#fff" />
              <Text style={styles.sheetBtnText}>{t("business.agenda.newSession")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetBtnGhost, { borderColor: colors.border }]} onPress={openBlockDraft}>
              <Icon name="lock" size={16} color={colors.textSecondary} />
              <Text style={[styles.sheetBtnGhostText, { color: colors.textSecondary }]}>{t("business.agenda.blockOff")}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Block-off editor */}
      <Modal visible={!!blockDraft} transparent animationType="fade" onRequestClose={() => setBlockDraft(null)}>
        <View style={styles.centerBackdrop}>
          <View style={[styles.editCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.agenda.blockOff")}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              value={blockDraft?.label}
              onChangeText={(v) => setBlockDraft((b) => ({ ...b, label: v }))}
              placeholder={t("business.agenda.blockLabelPlaceholder")}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.durRow}>
              {[30, 60, 120].map((m) => {
                const on = blockDraft?.durationMin === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setBlockDraft((b) => ({ ...b, durationMin: m }))}
                    style={[styles.durChip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}14` : "transparent" }]}
                  >
                    <Text style={[styles.durText, { color: on ? colors.primary : colors.textSecondary }]}>{m}m</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.editActions}>
              <TouchableOpacity style={[styles.editBtn, { borderColor: colors.border, borderWidth: 1 }]} onPress={() => setBlockDraft(null)}>
                <Text style={[styles.editBtnText, { color: colors.textSecondary }]}>{t("business.common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.primary }]} onPress={saveBlock}>
                <Text style={[styles.editBtnText, { color: "#fff" }]}>{t("business.agenda.save")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10 },
    headerTitle: { fontSize: 22, fontWeight: "800" },
    addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    dayStrip: { paddingHorizontal: 16, gap: 8, paddingVertical: 6 },
    dayCell: { width: 58, height: 68, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 4 },
    dayName: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
    dayNum: { fontSize: 20, fontWeight: "800" },
    staffStrip: { paddingHorizontal: 16, gap: 8, paddingVertical: 8 },
    staffChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 22, paddingLeft: 5, paddingRight: 14, height: 44 },
    staffAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    staffAvatarText: { fontSize: 12, fontWeight: "800" },
    staffName: { fontSize: 14, fontWeight: "700", maxWidth: 120 },
    legend: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 8 },
    legendDot: { width: 10, height: 10, borderRadius: 3 },
    legendText: { fontSize: 12, fontWeight: "700" },
    legendHint: { flex: 1, textAlign: "right", fontSize: 11.5 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    slotRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
    slotLabel: { width: 52, fontSize: 12, fontWeight: "600" },
    slotAdd: { flexDirection: "row", alignItems: "center", gap: 4, opacity: 0.7 },
    slotAddText: { fontSize: 12.5, fontWeight: "600" },
    itemCard: { position: "absolute", left: 84, right: 14, borderRadius: 14, padding: 12, justifyContent: "center" },
    itemTitle: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
    itemMeta: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 3, fontWeight: "600" },
    blockedCard: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed" },
    blockedText: { fontSize: 12.5, fontWeight: "700", flex: 1 },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34, gap: 12 },
    sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
    sheetBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 26 },
    sheetBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    sheetBtnGhost: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 26, borderWidth: 1.5 },
    sheetBtnGhostText: { fontSize: 15, fontWeight: "800" },
    centerBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 32 },
    editCard: { width: "100%", borderRadius: 20, padding: 20 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 12 },
    durRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    durChip: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
    durText: { fontSize: 14, fontWeight: "800" },
    editActions: { flexDirection: "row", gap: 10, marginTop: 18 },
    editBtn: { flex: 1, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
    editBtnText: { fontSize: 14, fontWeight: "800" },
  });
}
