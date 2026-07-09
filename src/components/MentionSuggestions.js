/**
 * MentionSuggestions — the @mention autocomplete for chat/post composers (spec
 * 10, block 4). Watches the composer text; when a mention is being typed it
 * shows matching users. Picking one calls onPick(handle). Renders nothing when
 * there's no active mention. Meant to sit directly above the input.
 */
import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { AvatarDisplay } from "./AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { activeMentionPrefix } from "../utils/mentions";
import { searchUsers } from "../services/userService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function MentionSuggestions({ text, onPick }) {
  const { colors } = useTheme();
  const prefix = activeMentionPrefix(text);
  const [results, setResults] = useState([]);
  const debRef = useRef(null);

  useEffect(() => {
    if (prefix === null || prefix.length < 2) {
      setResults([]);
      return;
    }
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      const r = await searchUsers(prefix);
      setResults(r.slice(0, 6));
    }, 250);
    return () => debRef.current && clearTimeout(debRef.current);
  }, [prefix]);

  if (prefix === null || prefix.length < 2 || results.length === 0) return null;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {results.map((u) => (
        <TouchableOpacity
          key={u.uid}
          style={[styles.row, { borderBottomColor: colors.border }]}
          onPress={() => onPick(u.handle)}
          activeOpacity={0.8}
        >
          <AvatarDisplay avatar={normAvatar(u.avatar)} size={30} />
          <Text style={[styles.handle, { color: colors.primary }]} numberOfLines={1}>@{u.handle}</Text>
          {!!u.name && (
            <Text style={[styles.name, { color: colors.textTertiary }]} numberOfLines={1}>
              {u.name}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 14,
    marginHorizontal: 12,
    marginBottom: 6,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  handle: { fontSize: 13.5, fontWeight: "800" },
  name: { flex: 1, fontSize: 12.5 },
});
