/**
 * BirthdayWheelModal — month + day picker for the profile birthday (KIN-207).
 *
 * Replaces two free-text number fields that happily accepted 30 February. Two
 * wheels can only ever produce a real calendar date, because the day column is
 * rebuilt from the selected month.
 *
 * NO YEAR, anywhere — not in the model, not in the UI, not here. That is the
 * whole promise of the feature ("we never ask for the year"), and it has one
 * consequence worth stating: **29 February must always be offered**. Leap-ness
 * is a property of a year, and there is no year, so a date with no year can be
 * the 29th. The month lengths therefore come from a fixed leap anchor (2000),
 * never from "this year" — otherwise someone born on 29 February would be
 * unable to enter their own birthday in three years out of four.
 */
import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import WheelColumn, { ITEM_H, VISIBLE, PAD } from "./WheelColumn";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12

/**
 * Days in a month, anchored to a leap year on purpose (see the header).
 * @param {number} month 1-12
 * @returns {number} 28..31 — February is always 29
 */
export const daysInMonth = (month) => new Date(2000, month, 0).getDate();

const daysOf = (month) =>
  Array.from({ length: daysInMonth(month) }, (_, i) => i + 1);

export default function BirthdayWheelModal({ visible, day, month, onSelect, onClose }) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Seeded from the incoming value each time the sheet opens; an unset birthday
  // starts on 1 January rather than leaving the wheels with no selection.
  const [m, setM] = useState(month || 1);
  const [d, setD] = useState(day || 1);

  useEffect(() => {
    if (!visible) return;
    const nextM = month || 1;
    setM(nextM);
    // Clamp on open too: a value already stored as an impossible pair (the old
    // text inputs could persist 31/02) must not seed an out-of-range wheel.
    setD(Math.min(day || 1, daysInMonth(nextM)));
  }, [visible, day, month]);

  const days = daysOf(m);

  const onMonthChange = (i) => {
    const nextM = MONTHS[i];
    setM(nextM);
    // The day has to be re-clamped by VALUE before it reaches the day wheel —
    // going from 31 January to April would otherwise leave 31 selected for a
    // 30-day month, which is exactly the invalid state this picker exists to
    // prevent. Not even transiently.
    setD((cur) => Math.min(cur, daysInMonth(nextM)));
  };

  const monthLabel = (n) => t(`gifting.months.m${n}`);

  const done = () => {
    onSelect(Math.min(d, daysInMonth(m)), m);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                {t("gifting.birthday.pickTitle")}
              </Text>
              <Text style={[styles.blurb, { color: colors.textSecondary }]}>
                {t("gifting.birthday.pickBlurb")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="birthday-close"
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <Icon name="close" size={22} color={colors.textSecondary} type="ui" />
            </TouchableOpacity>
          </View>

          <View style={[styles.wheelRow, { height: ITEM_H * VISIBLE }]}>
            <View
              pointerEvents="none"
              style={[styles.centerBand, { top: PAD, height: ITEM_H, borderColor: colors.border }]}
            />
            <WheelColumn
              data={MONTHS}
              testIDPrefix="birthday-month"
              index={MONTHS.indexOf(m)}
              onIndexChange={onMonthChange}
              formatter={monthLabel}
              align="right"
              colors={colors}
            />
            <WheelColumn
              data={days}
              testIDPrefix="birthday-day"
              index={days.indexOf(Math.min(d, days.length))}
              onIndexChange={(i) => setD(days[i])}
              formatter={(n) => String(n)}
              align="left"
              colors={colors}
            />
          </View>

          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={done}
            activeOpacity={0.85}
            testID="birthday-done"
            accessibilityRole="button"
            accessibilityLabel={t("gifting.birthday.continue")}
          >
            <Text style={styles.doneText}>{t("gifting.birthday.continue")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  blurb: { fontSize: 14, marginTop: 2 },
  wheelRow: { flexDirection: "row", justifyContent: "center" },
  centerBand: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 12,
  },
  doneBtn: {
    marginTop: 16,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
  },
  doneText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
