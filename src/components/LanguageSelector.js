/**
 * LanguageSelector — bottom-sheet language picker (kinlo_build/04_I18N_SPEC.md).
 * Searchable, native names + English subtitle, check on selected, no flag
 * emoji. Switches the whole app instantly via setAppLanguage.
 */
import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import Icon from "./Icon";
import { APP_LANGUAGES } from "../i18n/languages";
import { setAppLanguage } from "../i18n";

const badgeFor = (code) =>
  code === "nl-BE" ? "BE" : code.slice(0, 2).toUpperCase();

export default function LanguageSelector({ visible, onClose }) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const current = i18n.language;

  const s = q.trim().toLowerCase();
  const data = !s
    ? APP_LANGUAGES
    : APP_LANGUAGES.filter(
        (l) =>
          l.native.toLowerCase().includes(s) ||
          l.english.toLowerCase().includes(s) ||
          l.code.toLowerCase().includes(s)
      );

  const pick = async (code) => {
    await setAppLanguage(code);
    onClose && onClose();
  };

  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t("language.choose")}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={hit}>
              <Icon name="close" size={22} color={colors.textSecondary} type="ui" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Icon name="search" size={18} color={colors.textTertiary} type="ui" />
            <TextInput
              style={styles.searchInput}
              placeholder={t("language.searchPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={q}
              onChangeText={setQ}
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={data}
            keyExtractor={(l) => l.code}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => {
              const selected = item.code === current;
              return (
                <TouchableOpacity
                  style={[
                    styles.row,
                    selected && { borderColor: colors.primary, borderWidth: 1.5 },
                  ]}
                  onPress={() => pick(item.code)}
                  activeOpacity={0.8}
                >
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badgeFor(item.code)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.native}>{item.native}</Text>
                    <Text style={styles.english}>{item.english}</Text>
                  </View>
                  {selected && (
                    <Icon name="check" size={18} color={colors.primary} type="ui" />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 8,
      maxHeight: "82%",
    },
    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    title: { fontSize: 20, fontWeight: "700", color: colors.text, letterSpacing: -0.3 },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surfaceGlass,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 12,
      height: 44,
      marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 16, color: colors.text },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surfaceGlass,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
    },
    badge: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { fontSize: 13, fontWeight: "800", color: colors.primary },
    native: { fontSize: 16, fontWeight: "600", color: colors.text },
    english: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  });
}
