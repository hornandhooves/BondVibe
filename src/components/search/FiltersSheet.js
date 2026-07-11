/**
 * Bottom-sheet that holds the Search filters in Map mode. Opened from the
 * "Filters · N" pill so the user can adjust filters without leaving the map.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import Icon from "../../components/Icon";

export default function FiltersSheet({ visible, onClose, count, onReset, children }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {count > 0 ? `${t("searchEvents.filters")} · ${count}` : t("searchEvents.filters")}
            </Text>
            <View style={styles.headerRight}>
              {count > 0 && (
                <TouchableOpacity onPress={onReset} style={styles.resetBtn}>
                  <Text style={[styles.resetText, { color: colors.primary }]}>
                    {t("searchEvents.clearAll")}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Icon name="close" size={22} color={colors.textSecondary} type="ui" />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={onClose}
            activeOpacity={0.9}
          >
            <Text style={[styles.doneText, { color: colors.onPrimary }]}>
              {t("searchEvents.showResults")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
    backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    sheet: {
      maxHeight: "82%",
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingBottom: 28,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    title: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    resetBtn: { paddingVertical: 4, paddingHorizontal: 4 },
    resetText: { fontSize: 13.5, fontWeight: "700" },
    closeBtn: { padding: 2 },
    body: { paddingHorizontal: 20 },
    bodyContent: { paddingTop: 16, paddingBottom: 8 },
    doneBtn: {
      marginHorizontal: 20,
      marginTop: 8,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
    },
    doneText: { fontSize: 15.5, fontWeight: "800" },
  });
}
