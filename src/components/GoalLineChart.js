/**
 * GoalLineChart — Revenue Targets goal/actual/projection chart
 * (design_handoff_revenue_targets §4). react-native-svg <Path>, not a chart lib,
 * to match the Dashboard trend exactly:
 *   goal       solid #4F5BD5 w2.5 (target trajectory, rising to the goal)
 *   actual     solid #1F8A6E w2.8 + area fill .18→0, STOPS at "today"
 *   projection #1F8A6E w2.5 dashed "3 4", from "today" to year end
 *   today      vertical dashed #C9C6D2 + a #1F8A6E dot at actual's last point
 * Cumulative series (monotonic) → straight segments. Labels/legend live in the
 * screen for i18n.
 */
import React, { useState } from "react";
import { View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle } from "react-native-svg";

const COLORS = { goal: "#4F5BD5", actual: "#1F8A6E", today: "#C9C6D2" };
const PAD = { top: 10, bottom: 8, left: 4, right: 4 };

const poly = (pts) => (pts.length < 2 ? "" : `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`);

export default function GoalLineChart({ series = [], height = 132 }) {
  const [w, setW] = useState(0);
  const n = series.length;

  const vals = [];
  for (const s of series) {
    if (typeof s.goal === "number") vals.push(s.goal);
    if (typeof s.actual === "number") vals.push(s.actual);
    if (typeof s.projection === "number") vals.push(s.projection);
  }
  const max = Math.max(1, ...vals);

  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const xAt = (i) => PAD.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const yAt = (v) => PAD.top + (1 - v / max) * innerH;
  const baseY = height - PAD.bottom;

  const goalPts = series.map((s, i) => ({ x: xAt(i), y: yAt(s.goal || 0) }));
  const actualPts = series.map((s, i) => (typeof s.actual === "number" ? { x: xAt(i), y: yAt(s.actual) } : null)).filter(Boolean);
  const projPts = series.map((s, i) => (typeof s.projection === "number" ? { x: xAt(i), y: yAt(s.projection) } : null)).filter(Boolean);
  const todayIdx = series.findIndex((s) => s.isToday);
  const todayPt = todayIdx >= 0 && typeof series[todayIdx].actual === "number" ? { x: xAt(todayIdx), y: yAt(series[todayIdx].actual) } : null;

  const areaPath =
    actualPts.length >= 2
      ? `${poly(actualPts)} L ${actualPts[actualPts.length - 1].x} ${baseY} L ${actualPts[0].x} ${baseY} Z`
      : "";

  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && n >= 2 && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="goalActualArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={COLORS.actual} stopOpacity="0.18" />
              <Stop offset="1" stopColor={COLORS.actual} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {!!areaPath && <Path d={areaPath} fill="url(#goalActualArea)" />}
          {todayPt && <Line x1={todayPt.x} y1={PAD.top} x2={todayPt.x} y2={baseY} stroke={COLORS.today} strokeWidth={1} strokeDasharray="2 3" />}
          <Path d={poly(goalPts)} stroke={COLORS.goal} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {projPts.length >= 2 && <Path d={poly(projPts)} stroke={COLORS.actual} strokeWidth={2.5} strokeDasharray="3 4" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          {actualPts.length >= 2 && <Path d={poly(actualPts)} stroke={COLORS.actual} strokeWidth={2.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          {todayPt && <Circle cx={todayPt.x} cy={todayPt.y} r={3.5} fill={COLORS.actual} />}
        </Svg>
      )}
    </View>
  );
}

export const GOAL_CHART_COLORS = COLORS;
