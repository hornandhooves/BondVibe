/**
 * DurationWheelModal — friendly event-length picker.
 *
 * Primary: the OS-native hours:minutes wheel (iOS countdown mode of
 * @react-native-community/datetimepicker — the same smooth picker used for
 * date/time, no extra native module). Android falls back to JS wheels.
 * A small Hours/Days segment keeps multi-day events selectable.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import Icon from "./Icon";

const ITEM_H = 44;
const VISIBLE = 5;
const PAD = ITEM_H * Math.floor(VISIBLE / 2);

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,..,55
const DAYS = Array.from({ length: 14 }, (_, i) => i + 1); // 1..14 days

/** Human label, e.g. 45→"45 min", 150→"2h 30m", 420→"7 hours", 2880→"2 days". */
export function formatDuration(min) {
  const m = parseInt(min, 10) || 0;
  if (m < 60) return i18n.t("durationWheelModal.minShort", { m });
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r
      ? i18n.t("durationWheelModal.hoursMinutesShort", { h, m: r })
      : i18n.t(h === 1 ? "durationWheelModal.hourSingular" : "durationWheelModal.hoursPlural", { h });
  }
  const d = m / 1440;
  const dVal = Number.isInteger(d) ? d : d.toFixed(1);
  return i18n.t(d === 1 ? "durationWheelModal.daySingular" : "durationWheelModal.daysPlural", { d: dVal });
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const durationToDate = (min) =>
  new Date(2000, 0, 1, Math.floor((min % 1440) / 60), min % 60, 0, 0);
const dateToMinutes = (d) => d.getHours() * 60 + d.getMinutes();

function nearestIdx(arr, target) {
  let best = 0;
  let bestDiff = Infinity;
  arr.forEach((v, i) => {
    const diff = Math.abs(v - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

// A single JS wheel column (Android fallback + Days wheel).
function WheelColumn({ data, index, onIndexChange, formatter, align, colors }) {
  const ref = useRef(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      ref.current?.scrollTo({ y: index * ITEM_H, animated: false });
    });
    return () => cancelAnimationFrame(raf);
  }, [index, data]);

  const onEnd = (e) => {
    const raw = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const c = clamp(raw, 0, data.length - 1);
    if (c !== index) onIndexChange(c);
  };

  return (
    <ScrollView
      ref={ref}
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      onMomentumScrollEnd={onEnd}
      contentContainerStyle={{ paddingVertical: PAD }}
    >
      {data.map((item, i) => (
        <TouchableOpacity
          key={`${item}-${i}`}
          activeOpacity={0.7}
          style={[
            styles.item,
            align === "right" ? { alignItems: "flex-end", paddingRight: 14 } : null,
            align === "left" ? { alignItems: "flex-start", paddingLeft: 14 } : null,
            align === "center" ? { alignItems: "center" } : null,
          ]}
          onPress={() => {
            onIndexChange(i);
            ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
          }}
        >
          <Text
            style={[
              styles.itemText,
              {
                color: i === index ? colors.primary : colors.textSecondary,
                fontWeight: i === index ? "700" : "400",
              },
            ]}
          >
            {formatter(item)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export default function DurationWheelModal({ visible, value, onSelect, onClose }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState("hours"); // 'hours' | 'days'
  // Seed from the incoming value (single source of truth) — not a hard-coded
  // default — so the wheel always opens on the current duration (FIX 8).
  const [iosDate, setIosDate] = useState(() => durationToDate(parseInt(value, 10) || 180));
  const [hIdx, setHIdx] = useState(3); // Android hours index
  const [mIdx, setMIdx] = useState(0); // Android minutes index
  const [dIdx, setDIdx] = useState(0); // days index

  // On open, decompose the incoming value onto the controls.
  useEffect(() => {
    if (!visible) return;
    const m = parseInt(value, 10) || 180;
    if (m >= 1440 && m % 1440 === 0) {
      setMode("days");
      setDIdx(clamp(m / 1440 - 1, 0, DAYS.length - 1));
    } else {
      setMode("hours");
      setIosDate(durationToDate(m));
      setHIdx(clamp(Math.floor(m / 60), 0, 23));
      setMIdx(nearestIdx(MINUTES, m % 60));
    }
  }, [visible, value]);

  let total;
  if (mode === "days") total = DAYS[dIdx] * 1440;
  else if (Platform.OS === "ios") total = dateToMinutes(iosDate);
  else total = HOURS[hIdx] * 60 + MINUTES[mIdx];

  const done = () => {
    onSelect(String(Math.max(5, total)));
    onClose();
  };

  const Segment = ({ id, label }) => {
    const active = mode === id;
    return (
      <TouchableOpacity
        onPress={() => setMode(id)}
        activeOpacity={0.8}
        style={[
          styles.segment,
          { backgroundColor: active ? colors.primary : "transparent" },
        ]}
      >
        <Text
          style={{
            color: active ? "#FFFFFF" : colors.textSecondary,
            fontWeight: "700",
            fontSize: 14,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>{t("durationWheelModal.eventLength")}</Text>
              <Text style={[styles.preview, { color: colors.textSecondary }]}>
                {formatDuration(Math.max(5, total))}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={22} color={colors.textSecondary} type="ui" />
            </TouchableOpacity>
          </View>

          <View style={[styles.segmentRow, { backgroundColor: colors.sunken }]}>
            <Segment id="hours" label={t("durationWheelModal.hoursAndMinutes")} />
            <Segment id="days" label={t("durationWheelModal.days")} />
          </View>

          {mode === "hours" && Platform.OS === "ios" && (
            <DateTimePicker
              // Remount when the incoming value changes so the native spinner
              // always initializes to `value` (iOS ignores a changed controlled
              // value on an already-mounted countdown picker) — FIX 8.
              key={`countdown-${value}`}
              mode="countdown"
              display="spinner"
              value={iosDate}
              minuteInterval={5}
              onChange={(e, d) => d && setIosDate(d)}
              style={{ height: ITEM_H * VISIBLE }}
            />
          )}

          {mode === "hours" && Platform.OS !== "ios" && (
            <View style={[styles.wheelRow, { height: ITEM_H * VISIBLE }]}>
              <View
                pointerEvents="none"
                style={[styles.centerBand, bandStyle(colors)]}
              />
              <WheelColumn
                data={HOURS}
                index={hIdx}
                onIndexChange={setHIdx}
                formatter={(n) => t("durationWheelModal.hoursAbbrev", { n })}
                align="right"
                colors={colors}
              />
              <WheelColumn
                data={MINUTES}
                index={mIdx}
                onIndexChange={setMIdx}
                formatter={(n) => t("durationWheelModal.minutesAbbrev", { n: String(n).padStart(2, "0") })}
                align="left"
                colors={colors}
              />
            </View>
          )}

          {mode === "days" && (
            <View style={[styles.wheelRow, { height: ITEM_H * VISIBLE }]}>
              <View
                pointerEvents="none"
                style={[styles.centerBand, bandStyle(colors)]}
              />
              <WheelColumn
                data={DAYS}
                index={dIdx}
                onIndexChange={setDIdx}
                formatter={(n) => t(n === 1 ? "durationWheelModal.daySingularAbbrev" : "durationWheelModal.daysPluralAbbrev", { n })}
                align="center"
                colors={colors}
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={done}
            activeOpacity={0.85}
          >
            <Text style={styles.doneText}>{t("durationWheelModal.done")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const bandStyle = (colors) => ({
  top: PAD,
  height: ITEM_H,
  borderColor: colors.border,
  backgroundColor: `${colors.primary}12`,
});

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
  preview: { fontSize: 14, marginTop: 2 },
  segmentRow: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  wheelRow: { flexDirection: "row", justifyContent: "center" },
  centerBand: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 12,
  },
  item: { height: ITEM_H, justifyContent: "center" },
  itemText: { fontSize: 22, letterSpacing: -0.2 },
  doneBtn: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  doneText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
});
