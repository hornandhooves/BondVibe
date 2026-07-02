/**
 * Reusable phone number input with a WhatsApp-style country-code picker
 * (flag + dial code, searchable, default +52 Mexico). Pure JS — no native dep.
 * Emits an E.164-ish string ("+52551234567") via onChangeText, or "" when empty.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { COUNTRIES, flagEmoji, parsePhone } from "../utils/countries";

export default function PhoneInput({
  value,
  onChangeText,
  placeholder = "55 1234 5678",
  style,
}) {
  const { colors, isDark } = useTheme();
  const initial = parsePhone(value);
  const [country, setCountry] = useState(initial.country);
  const [number, setNumber] = useState(initial.number);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const emit = (c, n) => {
    const digits = n.replace(/[^0-9]/g, "");
    onChangeText && onChangeText(digits ? `${c.dial}${digits}` : "");
  };
  const onNumberChange = (t) => {
    setNumber(t);
    emit(country, t);
  };
  const selectCountry = (c) => {
    setCountry(c);
    setPickerOpen(false);
    setSearch("");
    emit(c, number);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.dial.includes(q) ||
          c.code.toLowerCase().includes(q)
      )
    : COUNTRIES;

  const styles = createStyles(colors, isDark);

  return (
    <View style={[styles.row, style]}>
      <TouchableOpacity
        style={styles.codeBtn}
        onPress={() => setPickerOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.flag}>{flagEmoji(country.code)}</Text>
        <Text style={[styles.dial, { color: colors.text }]}>{country.dial}</Text>
        <Text style={[styles.caret, { color: colors.textTertiary }]}>▾</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.input}
        value={number}
        onChangeText={onNumberChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType="phone-pad"
        maxLength={15}
      />

      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Country</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Text style={[styles.done, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Search country"
              placeholderTextColor={colors.textTertiary}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.code + c.dial}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.countryRow}
                  onPress={() => selectCountry(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.flag}>{flagEmoji(item.code)}</Text>
                  <Text style={[styles.countryName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.countryDial, { color: colors.textSecondary }]}>
                    {item.dial}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    codeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceGlass,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    flag: { fontSize: 18 },
    dial: { fontSize: 15, fontWeight: "700" },
    caret: { fontSize: 12 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceGlass,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: {
      backgroundColor: isDark ? "#14141f" : "#fff",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 20,
      maxHeight: "80%",
    },
    sheetHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    sheetTitle: { fontSize: 18, fontWeight: "800" },
    done: { fontSize: 16, fontWeight: "700" },
    search: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      marginBottom: 12,
    },
    countryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
    },
    countryName: { flex: 1, fontSize: 15, fontWeight: "600" },
    countryDial: { fontSize: 15, fontWeight: "600" },
  });
}
