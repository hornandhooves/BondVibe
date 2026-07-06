/**
 * DurationWheelModal — a two-wheel (amount × unit) duration picker, like the
 * iOS timer. Pure JS (ScrollView + snapToInterval), no native module. Lets a
 * host dial in ANY length — 45 min, 7 hours, 9 hours, 3 days — instead of a
 * fixed shortlist.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import Icon from "./Icon";

const ITEM_H = 44;
const VISIBLE = 5; // odd → one centered row
const PAD = ITEM_H * Math.floor(VISIBLE / 2);

const UNITS = [
  { key: "min", label: "min", mult: 1,
    values: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] },
  { key: "hr", label: "hours", mult: 60,
    values: Array.from({ length: 23 }, (_, i) => i + 1) },
  { key: "day", label: "days", mult: 1440,
    values: Array.from({ length: 14 }, (_, i) => i + 1) },
];

/** Human label for a minute count, e.g. 45→"45 min", 420→"7 hours", 2880→"2 days". */
export function formatDuration(min) {
  const m = parseInt(min, 10) || 0;
  if (m < 60) return `${m} min`;
  if (m < 1440) {
    const h = m / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? "hour" : "hours"}`;
  }
  const d = m / 1440;
  return `${Number.isInteger(d) ? d : d.toFixed(1)} ${d === 1 ? "day" : "days"}`;
}

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

// Split a minute count into the friendliest {unitIdx, amount}.
function decompose(min) {
  const m = parseInt(min, 10) || 180;
  if (m >= 1440 && m % 1440 === 0) return { unitIdx: 2, amount: m / 1440 };
  if (m >= 60 && m % 60 === 0) return { unitIdx: 1, amount: m / 60 };
  return { unitIdx: 0, amount: Math.max(5, Math.round(m / 5) * 5) };
}

function WheelColumn({ data, index, onIndexChange, formatter, align, colors }) {
  const ref = useRef(null);

  // Keep the scroll position synced to `index` (external changes: open, unit swap).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      ref.current?.scrollTo({ y: index * ITEM_H, animated: false });
    });
    return () => cancelAnimationFrame(raf);
  }, [index, data]);

  const onEnd = (e) => {
    const raw = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const clamped = Math.max(0, Math.min(data.length - 1, raw));
    if (clamped !== index) onIndexChange(clamped);
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
            { alignItems: align === "right" ? "flex-end" : "flex-start" },
            align === "right" ? { paddingRight: 14 } : { paddingLeft: 14 },
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
  const [unitIdx, setUnitIdx] = useState(0);
  const [amtIdx, setAmtIdx] = useState(0);

  // On open, decompose the current value onto the two wheels.
  useEffect(() => {
    if (!visible) return;
    const { unitIdx: u, amount } = decompose(value);
    setUnitIdx(u);
    setAmtIdx(nearestIdx(UNITS[u].values, amount));
  }, [visible, value]);

  const amounts = UNITS[unitIdx].values;
  const currentAmount = amounts[Math.min(amtIdx, amounts.length - 1)];
  const totalMinutes = currentAmount * UNITS[unitIdx].mult;

  // Switching unit preserves the amount number when the new unit offers it,
  // else snaps to the nearest available.
  const changeUnit = (newUnitIdx) => {
    const curAmount = amounts[amtIdx];
    const newVals = UNITS[newUnitIdx].values;
    setUnitIdx(newUnitIdx);
    setAmtIdx(nearestIdx(newVals, curAmount));
  };

  const done = () => {
    onSelect(String(totalMinutes));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Event length</Text>
              <Text style={[styles.preview, { color: colors.textSecondary }]}>
                {formatDuration(totalMinutes)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={22} color={colors.textSecondary} type="ui" />
            </TouchableOpacity>
          </View>

          <View style={[styles.wheelRow, { height: ITEM_H * VISIBLE }]}>
            {/* Center selection band spans both columns */}
            <View
              pointerEvents="none"
              style={[
                styles.centerBand,
                {
                  top: PAD,
                  height: ITEM_H,
                  borderColor: colors.border,
                  backgroundColor: `${colors.primary}12`,
                },
              ]}
            />
            <WheelColumn
              data={amounts}
              index={Math.min(amtIdx, amounts.length - 1)}
              onIndexChange={setAmtIdx}
              formatter={(n) => String(n)}
              align="right"
              colors={colors}
            />
            <WheelColumn
              data={UNITS}
              index={unitIdx}
              onIndexChange={changeUnit}
              formatter={(u) => u.label}
              align="left"
              colors={colors}
            />
          </View>

          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={done}
            activeOpacity={0.85}
          >
            <Text style={styles.doneText}>Done</Text>
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
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  preview: { fontSize: 14, marginTop: 2 },
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
