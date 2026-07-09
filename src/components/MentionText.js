/**
 * MentionText — renders a message/post body with @handle mentions as tappable
 * links to the mentioned user's profile (spec 10, block 4 / BUG 14). Plain text
 * when there are no mentions.
 */
import React from "react";
import { Text } from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { splitByMentions } from "../utils/mentions";
import { findUserByHandle } from "../services/userService";

export default function MentionText({ text, style, mentionStyle, navigation, numberOfLines }) {
  const { colors } = useTheme();
  const parts = splitByMentions(text || "");

  // No mentions → cheap plain Text.
  if (parts.length === 1 && parts[0].type === "text") {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const openProfile = async (handle) => {
    if (!navigation) return;
    const u = await findUserByHandle(handle);
    if (u) navigation.navigate("UserProfile", { userId: u.uid });
  };

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        p.type === "mention" ? (
          <Text
            key={i}
            style={[{ color: colors.primary, fontWeight: "700" }, mentionStyle]}
            onPress={() => openProfile(p.handle)}
          >
            {p.value}
          </Text>
        ) : (
          <Text key={i}>{p.value}</Text>
        )
      )}
    </Text>
  );
}
