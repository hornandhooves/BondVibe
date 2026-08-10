/**
 * Apple logomark — for "Continue with Apple", styled to match GoogleIcon.js
 * so both social buttons share the same Button component treatment.
 */
import React from "react";
import Svg, { Path } from "react-native-svg";

export default function AppleIcon({ size = 18, color = "#000000" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.087 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zm3.415-3.132c.843-1.012 1.41-2.427 1.254-3.83-1.213.052-2.688.805-3.558 1.818-.78.896-1.462 2.338-1.28 3.714 1.345.104 2.735-.688 3.584-1.702"
      />
    </Svg>
  );
}
