/**
 * DurationWheelModal — a spinning-cylinder (iOS-style wheel) duration picker.
 * Pure JS (ScrollView + snapToInterval), so it needs no native module. Lets a
 * host pick a fine-grained event length spanning minutes → days.
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
const VISIBLE = 5; // odd number → one centered row
const PAD = ITEM_H * Math.floor(VISIBLE / 2);

// Curated durations in minutes, spanning minutes → days.
export const DURATION_MINUTES = [
  5, 10, 15, 20, 30, 45,
  60, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720,
  1440, 2880, 4320, 5760, 7200, 10080,
];

/** Human label for a minute count, e.g. 5→"5 min", 90→"1.5 hours", 2880→"2 days". */
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

function nearestIndex(min) {
  const m = parseInt(min, 10) || 180;
  let best = 0;
  let bestDiff = Infinity;
  DURATION_MINUTES.forEach((v, i) => {
    const diff = Math.abs(v - m);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

export default function DurationWheelModal({ visible, value, onSelect, onClose }) {
  const { colors } = useTheme();
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(() => nearestIndex(value));

  // On open, sync to the current value and scroll the wheel to it.
  useEffect(() => {
    if (!visible) return undefined;
    const i = nearestIndex(value);
    setIndex(i);
    const raf = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: false });
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, value]);

  const onMomentumEnd = (e) => {
    const raw = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const clamped = Math.max(0, Math.min(DURATION_MINUTES.length - 1, raw));
    setIndex(clamped);
  };

  const done = () => {
    onSelect(String(DURATION_MINUTES[index]));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>Event length</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={22} color={colors.textSecondary} type="ui" />
            </TouchableOpacity>
          </View>

          <View style={[styles.wheelWrap, { height: ITEM_H * VISIBLE }]}>
            {/* Center selection band */}
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
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_H}
              decelerationRate="fast"
              onMomentumScrollEnd={onMomentumEnd}
              contentContainerStyle={{ paddingVertical: PAD }}
            >
              {DURATION_MINUTES.map((v, i) => (
                <TouchableOpacity
                  key={v}
                  activeOpacity={0.7}
                  style={[styles.item, { height: ITEM_H }]}
                  onPress={() => {
                    setIndex(i);
                    scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
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
                    {formatDuration(v)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  wheelWrap: { justifyContent: "center" },
  centerBand: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRadius: 12,
  },
  item: { justifyContent: "center", alignItems: "center" },
  itemText: { fontSize: 22, letterSpacing: -0.2 },
  doneBtn: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  doneText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
});
