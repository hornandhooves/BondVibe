/**
 * UserSearchField — reusable @handle / name people search (spec 10). Debounced
 * searchUsers, renders result rows, calls onSelect(user) with the public
 * projection { uid, handle, name, avatar, city }. Reused in Staff add, group
 * add-member, community invite, CRM link and the "Find people" screen.
 */
import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import { AvatarDisplay } from "./AvatarPicker";
import { useTheme } from "../contexts/ThemeContext";
import { searchUsers } from "../services/userService";

const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function UserSearchField({ onSelect, placeholder, autoFocus, maxHeight = 260 }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debRef = useRef(null);
  const styles = createStyles(colors);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (q.trim().replace(/^@+/, "").length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debRef.current = setTimeout(async () => {
      const r = await searchUsers(q);
      setResults(r);
      setSearching(false);
    }, 350);
    return () => debRef.current && clearTimeout(debRef.current);
  }, [q]);

  const showEmpty = q.trim().replace(/^@+/, "").length >= 2 && !searching && results.length === 0;

  return (
    <View>
      <View style={[styles.inputWrap, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
        <Icon name="search" size={18} color={colors.textTertiary} />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={q}
          onChangeText={setQ}
          placeholder={placeholder || t("userSearch.placeholder")}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
        />
        {searching && <ActivityIndicator size="small" color={colors.textTertiary} />}
      </View>

      {results.length > 0 && (
        <View style={[styles.results, { maxHeight, borderColor: colors.border, backgroundColor: colors.surface }]}>
          {results.map((u) => (
            <TouchableOpacity
              key={u.uid}
              testID="user-search-result"
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => onSelect && onSelect(u)}
              activeOpacity={0.8}
            >
              <AvatarDisplay avatar={normAvatar(u.avatar)} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {u.name || `@${u.handle}`}
                </Text>
                <Text style={[styles.sub, { color: colors.textTertiary }]} numberOfLines={1}>
                  @{u.handle}{u.city ? ` · ${u.city}` : ""}
                </Text>
              </View>
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showEmpty && (
        <Text style={[styles.empty, { color: colors.textTertiary }]}>{t("userSearch.noResults")}</Text>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
    },
    input: { flex: 1, fontSize: 15, paddingVertical: 12 },
    results: { borderWidth: 1, borderRadius: 14, marginTop: 8, overflow: "hidden" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { fontSize: 14.5, fontWeight: "700" },
    sub: { fontSize: 12, marginTop: 2 },
    empty: { textAlign: "center", marginTop: 12, fontSize: 13 },
  });
}
