import React from "react";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  G,
  Path,
  Circle,
  Rect,
  ClipPath,
} from "react-native-svg";

/**
 * BondVibe Echo Logo Component
 *
 * @param {number} size - Size of the logo (default: 72)
 * @param {string} variant - "adaptive" | "withBackground" | "light" | "dark"
 *   - "adaptive": Auto-adapts based on isDark prop
 *   - "withBackground": Full logo with purple gradient background
 *   - "light": White/light waves (for dark backgrounds)
 *   - "dark": Purple waves (for light backgrounds)
 * @param {boolean} isDark - Whether the current theme is dark (used with variant="adaptive")
 * @param {string} color - Custom color override for waves
 */
export default function BondVibeLogo({
  size = 72,
  variant = "adaptive",
  isDark = true,
  color = null,
}) {
  // Determine wave color based on variant and theme
  const getWaveColor = () => {
    if (color) return color; // Custom color override

    switch (variant) {
      case "light":
        return "#FFFFFF";
      case "dark":
        return "#7C3AED";
      case "adaptive":
      default:
        return isDark ? "#FFFFFF" : "#7C3AED";
    }
  };

  // Full logo with gradient background
  if (variant === "withBackground") {
    return (
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Defs>
          <LinearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#7C3AED" />
            <Stop offset="50%" stopColor="#C026D3" />
            <Stop offset="100%" stopColor="#FF3E9A" />
          </LinearGradient>
          <ClipPath id="rounded">
            <Rect width="200" height="200" rx="44" ry="44" />
          </ClipPath>
        </Defs>

        <G clipPath="url(#rounded)">
          <Rect width="200" height="200" fill="url(#bgGradient)" />

          {/* Decorative circles */}
          <Circle cx="40" cy="30" r="50" fill="rgba(255,255,255,0.05)" />
          <Circle cx="170" cy="160" r="60" fill="rgba(255,255,255,0.05)" />

          {/* Echo Logo centered */}
          <G transform="translate(100, 100)">
            <Path
              d="M-15 -60 A60 60 0 0 0 -15 60"
              stroke="white"
              strokeWidth="6"
              fill="none"
              opacity="0.3"
              strokeLinecap="round"
            />
            <Path
              d="M-30 -45 A45 45 0 0 0 -30 45"
              stroke="white"
              strokeWidth="7"
              fill="none"
              opacity="0.5"
              strokeLinecap="round"
            />
            <Path
              d="M-45 -30 A30 30 0 0 0 -45 30"
              stroke="white"
              strokeWidth="8"
              fill="none"
              opacity="0.75"
              strokeLinecap="round"
            />
            <Path
              d="M15 -60 A60 60 0 0 1 15 60"
              stroke="white"
              strokeWidth="6"
              fill="none"
              opacity="0.3"
              strokeLinecap="round"
            />
            <Path
              d="M30 -45 A45 45 0 0 1 30 45"
              stroke="white"
              strokeWidth="7"
              fill="none"
              opacity="0.5"
              strokeLinecap="round"
            />
            <Path
              d="M45 -30 A30 30 0 0 1 45 30"
              stroke="white"
              strokeWidth="8"
              fill="none"
              opacity="0.75"
              strokeLinecap="round"
            />
            <Circle cx="0" cy="0" r="12" fill="white" />
          </G>
        </G>
      </Svg>
    );
  }

  // Simple logo without background (adaptive to theme)
  const waveColor = getWaveColor();

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <G transform="translate(100, 100)">
        {/* Left person - 3 waves */}
        <Path
          d="M-15 -60 A60 60 0 0 0 -15 60"
          stroke={waveColor}
          strokeWidth="6"
          fill="none"
          opacity="0.3"
          strokeLinecap="round"
        />
        <Path
          d="M-30 -45 A45 45 0 0 0 -30 45"
          stroke={waveColor}
          strokeWidth="7"
          fill="none"
          opacity="0.5"
          strokeLinecap="round"
        />
        <Path
          d="M-45 -30 A30 30 0 0 0 -45 30"
          stroke={waveColor}
          strokeWidth="8"
          fill="none"
          opacity="0.75"
          strokeLinecap="round"
        />

        {/* Right person - 3 waves */}
        <Path
          d="M15 -60 A60 60 0 0 1 15 60"
          stroke={waveColor}
          strokeWidth="6"
          fill="none"
          opacity="0.3"
          strokeLinecap="round"
        />
        <Path
          d="M30 -45 A45 45 0 0 1 30 45"
          stroke={waveColor}
          strokeWidth="7"
          fill="none"
          opacity="0.5"
          strokeLinecap="round"
        />
        <Path
          d="M45 -30 A30 30 0 0 1 45 30"
          stroke={waveColor}
          strokeWidth="8"
          fill="none"
          opacity="0.75"
          strokeLinecap="round"
        />

        {/* Center connection point */}
        <Circle cx="0" cy="0" r="12" fill={waveColor} />
      </G>
    </Svg>
  );
}
