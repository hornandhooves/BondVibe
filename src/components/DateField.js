/**
 * Reusable date picker field, matching the app's iOS-modal / Android-dialog
 * pattern (see CreateEventScreen). Keeps the DateTimePicker plumbing in one
 * place so rental screens (publish, filters, booking) stay consistent.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTheme } from "../contexts/ThemeContext";
import { useTranslation } from "react-i18next";

const fmt = (d) =>
  d
    ? new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
    : null;

export default function DateField({
  label,
  value, // Date | null
  onChange, // (Date) => void
  onClear, // optional () => void — shows a clear affordance when provided
  minimumDate,
  placeholder,
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder === undefined ? t("dateField.any") : placeholder;
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState(value || new Date());

  const open = () => {
    setTemp(value || minimumDate || new Date());
    setShow(true);
  };

  // Android fires onChange directly from the dialog; iOS confirms via the modal.
  const onNativeChange = (event, selected) => {
    if (Platform.OS === "android") {
      setShow(false);
      if (event.type === "set" && selected) onChange(selected);
      return;
    }
    if (selected) setTemp(selected);
  };

  const styles = createStyles(colors, isDark);

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.field, { borderColor: colors.border }]}
          onPress={open}
          activeOpacity={0.8}
        >
          <Text style={[styles.value, { color: value ? colors.text : colors.textTertiary }]}>
            {fmt(value) || resolvedPlaceholder}
          </Text>
        </TouchableOpacity>
        {onClear && value && (
          <TouchableOpacity onPress={onClear} style={styles.clear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.clearTxt, { color: colors.textTertiary }]}>{t("dateField.clear")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {Platform.OS === "android" && show && (
        <DateTimePicker
          value={value || minimumDate || new Date()}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onChange={onNativeChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <View style={styles.backdrop}>
            <View style={[styles.sheet, { backgroundColor: isDark ? "#1a1a2e" : "#ffffff" }]}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={[styles.cancel, { color: colors.textSecondary }]}>{t("dateField.cancel")}</Text>
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.text }]}>{label || t("dateField.selectDate")}</Text>
                <TouchableOpacity
                  onPress={() => {
                    onChange(temp);
                    setShow(false);
                  }}
                >
                  <Text style={[styles.done, { color: colors.primary }]}>{t("dateField.done")}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={temp}
                mode="date"
                display="spinner"
                minimumDate={minimumDate}
                onChange={onNativeChange}
                textColor={colors.text}
                themeVariant={isDark ? "dark" : "light"}
                style={styles.picker}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    field: {
      flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    },
    value: { fontSize: 15 },
    clear: { paddingHorizontal: 4 },
    clearTxt: { fontSize: 13, fontWeight: "600" },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
    sheetHeader: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
    },
    cancel: { fontSize: 16 },
    title: { fontSize: 16, fontWeight: "700" },
    done: { fontSize: 16, fontWeight: "700" },
    picker: { height: 200 },
  });
}
