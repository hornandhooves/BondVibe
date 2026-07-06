/**
 * BondMark — the "bond" glyph: two overlapping circles (people connecting).
 * Used for Personality Matching / connection features. Per the design rule,
 * sparkles are reserved strictly for Kinlo AI — this mark is the human bond.
 */
import React from "react";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../contexts/ThemeContext";

export default function BondMark({ size = 22, color, strokeWidth = 1.75 }) {
  const { colors } = useTheme();
  const stroke = color || colors.primary;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="12" r="6" stroke={stroke} strokeWidth={strokeWidth} />
      <Circle cx="15" cy="12" r="6" stroke={stroke} strokeWidth={strokeWidth} />
    </Svg>
  );
}
