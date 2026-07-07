/**
 * AvailabilityCalendar — read-only month view of a vehicle's availability.
 *
 * Colors each day: booked (from bookedRanges), outside the owner's availability
 * window, or in the past = unavailable; everything else = available. Lets the
 * renter *see* which dates are taken before picking a range in VehicleDetail.
 */
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import { useTheme } from "../contexts/ThemeContext";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_KEYS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

export default function AvailabilityCalendar({
  bookedRanges = [],
  availableFrom,
  availableUntil,
  selectedStart,
  selectedEnd,
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const today = startOfDay(new Date());
  const fromMs = availableFrom ? startOfDay(availableFrom) : null;
  const untilMs = availableUntil ? startOfDay(availableUntil) : null;
  const ranges = (bookedRanges || []).map((r) => ({
    start: startOfDay(r.start),
    end: startOfDay(r.end),
  }));
  const selStart = selectedStart ? startOfDay(selectedStart) : null;
  const selEnd = selectedEnd ? startOfDay(selectedEnd) : null;

  const dayState = (ms) => {
    if (ms < today) return "past";
    if (fromMs && ms < fromMs) return "out";
    if (untilMs && ms > untilMs) return "out";
    if (ranges.some((r) => ms >= r.start && ms <= r.end)) return "booked";
    if (selStart != null && selEnd != null && ms >= selStart && ms <= selEnd)
      return "selected";
    return "free";
  };

  const first = new Date(cursor.year, cursor.month, 1);
  const leadBlanks = first.getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const shift = (delta) =>
    setCursor((c) => {
      const m = c.month + delta;
      return {
        year: c.year + Math.floor(m / 12),
        month: ((m % 12) + 12) % 12,
      };
    });

  const styles = createStyles(colors);
  const cellColors = {
    booked: { bg: "#F2C4C4", fg: "#8A3B3B" },
    selected: { bg: colors.primary, fg: "#fff" },
    free: { bg: "transparent", fg: colors.text },
    out: { bg: "transparent", fg: colors.textTertiary },
    past: { bg: "transparent", fg: colors.textTertiary },
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => shift(-1)} hitSlop={hit}>
          <Icon name="back" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.month, { color: colors.text }]}>
          {t(`availabilityCalendar.months.${MONTH_KEYS[cursor.month]}`)} {cursor.year}
        </Text>
        <TouchableOpacity onPress={() => shift(1)} hitSlop={hit}>
          <Icon name="forward" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {DAY_LABELS.map((l, i) => (
          <Text key={i} style={[styles.weekday, { color: colors.textTertiary }]}>
            {l}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d == null) return <View key={i} style={styles.cell} />;
          const ms = new Date(cursor.year, cursor.month, d).getTime();
          const st = dayState(ms);
          const c = cellColors[st];
          return (
            <View key={i} style={styles.cell}>
              <View style={[styles.dayDot, { backgroundColor: c.bg }]}>
                <Text
                  style={[
                    styles.dayText,
                    { color: c.fg, textDecorationLine: st === "booked" ? "line-through" : "none" },
                  ]}
                >
                  {d}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: "#F2C4C4" }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t("availabilityCalendar.booked")}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { borderWidth: 1, borderColor: colors.border }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t("availabilityCalendar.available")}</Text>
        </View>
      </View>
    </View>
  );
}

const hit = { top: 8, bottom: 8, left: 8, right: 8 };

function createStyles(colors) {
  return StyleSheet.create({
    wrap: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      backgroundColor: colors.surfaceGlass,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    month: { fontSize: 15, fontWeight: "700" },
    weekRow: { flexDirection: "row" },
    weekday: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", marginBottom: 6 },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
    dayDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    dayText: { fontSize: 13.5, fontWeight: "600" },
    legend: { flexDirection: "row", gap: 18, marginTop: 12, justifyContent: "center" },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    swatch: { width: 14, height: 14, borderRadius: 7 },
    legendText: { fontSize: 12.5 },
  });
}
