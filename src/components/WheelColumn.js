/**
 * WheelColumn — one scrollable wheel column (the JS picker used on Android, on
 * the Days wheel, and by any other wheel-style modal).
 *
 * Extracted verbatim from DurationWheelModal (KIN-207) so a second wheel picker
 * doesn't have to copy it. The accessibility contract comes from KIN-205 and is
 * unchanged: every option is a real element with a testID keyed by VALUE, a
 * button role, a label, and its selected state.
 *
 * ITEM_H / VISIBLE / PAD are exported because a host modal sizes its own wheel
 * row and centre band from them — the column and its container have to agree on
 * row height or the selection band drifts off the highlighted row.
 */
import React, { useEffect, useRef } from "react";
import { ScrollView, TouchableOpacity, Text, StyleSheet } from "react-native";

export const ITEM_H = 44;
export const VISIBLE = 5;
export const PAD = ITEM_H * Math.floor(VISIBLE / 2);

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function WheelColumn({ data, index, onIndexChange, formatter, align, colors, testIDPrefix }) {
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
          // Keyed by the VALUE, not the row position, so a handle still points
          // at "30 minutes" if the range ever changes (KIN-205).
          testID={testIDPrefix ? `${testIDPrefix}-${item}` : undefined}
          accessibilityRole="button"
          accessibilityLabel={formatter(item)}
          accessibilityState={{ selected: i === index }}
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

const styles = StyleSheet.create({
  item: { height: ITEM_H, justifyContent: "center" },
  itemText: { fontSize: 22, letterSpacing: -0.2 },
});
