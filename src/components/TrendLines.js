/**
 * TrendLines — the Business Dashboard multi-line trend (dashboard handoff §A +
 * PIXEL-FIDELITY §4). Three strokes over the same buckets, each normalized to
 * its own max so shapes compare:
 *   attendance  #7C3AED w2.5 + area fill fading to 0
 *   revenue     #1F8A6E w2.2
 *   new members #E8A33D w2 dashed 3 4
 * Rendered with react-native-svg <Path> (no chart lib) to match the mock exactly.
 * Pure/presentational: labels + legend live in the screen for i18n.
 */
import React, { useState } from "react";
import { View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

const COLORS = { attendance: "#7C3AED", revenue: "#1F8A6E", newMembers: "#E8A33D" };
const PAD = { top: 10, bottom: 8, left: 4, right: 4 };

/** Smooth (horizontal-tangent cubic) path through px points. */
function linePath(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y} ${cx} ${p1.y} ${p1.x} ${p1.y}`;
  }
  return d;
}

export default function TrendLines({ series = [], height = 130 }) {
  const [w, setW] = useState(0);
  const n = series.length;

  const pointsFor = (key, max) => {
    if (n < 2 || w === 0) return [];
    const innerW = w - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    return series.map((s, i) => {
      const v = s[key] || 0;
      const x = PAD.left + (i / (n - 1)) * innerW;
      const y = PAD.top + (1 - (max > 0 ? v / max : 0)) * innerH;
      return { x, y };
    });
  };

  const maxAtt = Math.max(1, ...series.map((s) => s.value || 0));
  const maxRev = Math.max(1, ...series.map((s) => s.revenueCents || 0));
  const maxNew = Math.max(1, ...series.map((s) => s.newMembers || 0));

  const attPts = pointsFor("value", maxAtt);
  const revPts = pointsFor("revenueCents", maxRev);
  const newPts = pointsFor("newMembers", maxNew);

  const baseY = height - PAD.bottom;
  const areaPath =
    attPts.length >= 2
      ? `${linePath(attPts)} L ${attPts[attPts.length - 1].x} ${baseY} L ${attPts[0].x} ${baseY} Z`
      : "";

  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && n >= 2 && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="attArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={COLORS.attendance} stopOpacity="0.22" />
              <Stop offset="1" stopColor={COLORS.attendance} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {!!areaPath && <Path d={areaPath} fill="url(#attArea)" />}
          <Path d={linePath(revPts)} stroke={COLORS.revenue} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={linePath(newPts)} stroke={COLORS.newMembers} strokeWidth={2} strokeDasharray="3 4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={linePath(attPts)} stroke={COLORS.attendance} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

export const TREND_COLORS = COLORS;
