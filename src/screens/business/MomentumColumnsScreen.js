/**
 * MomentumColumnsScreen — edit the board: rename it, and add / rename / reorder /
 * recolor / remove columns (min 1). kinlo_business/02 §B.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { getBoard, saveColumns, saveBoardName } from "../../services/businessMomentumService";
import { COLUMN_COLORS, columnName } from "../../constants/momentumDefaults";

const newId = () => `col_${Math.random().toString(36).slice(2, 8)}`;

export default function MomentumColumnsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [boardName, setBoardName] = useState("");
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const b = await getBoard();
      setBoardName(b.name || "");
      // Bake display names so each column is directly editable.
      setColumns((b.columns || []).map((c) => ({ ...c, name: columnName(c, t) })));
      setLoading(false);
    })();
  }, []);

  const setName = (i, name) => setColumns((cs) => cs.map((c, idx) => (idx === i ? { ...c, name } : c)));
  const setColor = (i, color) => setColumns((cs) => cs.map((c, idx) => (idx === i ? { ...c, color } : c)));
  const move = (i, dir) =>
    setColumns((cs) => {
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const copy = [...cs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const remove = (i) => {
    if (columns.length <= 1) {
      Alert.alert(t("business.momentum.minColumnTitle"), t("business.momentum.minColumnMsg"));
      return;
    }
    setColumns((cs) => cs.filter((_, idx) => idx !== i));
  };
  const add = () =>
    setColumns((cs) => [...cs, { id: newId(), name: "", color: COLUMN_COLORS[cs.length % COLUMN_COLORS.length] }]);

  const onSave = async () => {
    const clean = columns
      .map((c) => ({ ...c, name: (c.name || "").trim() }))
      .filter((c) => c.name);
    if (clean.length === 0) {
      Alert.alert(t("business.momentum.minColumnTitle"), t("business.momentum.minColumnMsg"));
      return;
    }
    setSaving(true);
    try {
      await Promise.all([saveColumns(clean), saveBoardName(boardName)]);
      navigation.goBack();
    } catch (e) {
      setSaving(false);
      Alert.alert(t("business.common.errorTitle"), t("business.common.tryAgain"));
    }
  };

  const styles = createStyles(colors);
  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.momentum.editBoard")}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.boardName")}</Text>
            <TextInput style={[styles.input, inputStyle]} value={boardName} onChangeText={setBoardName} placeholder={t("business.momentum.title")} placeholderTextColor={colors.textTertiary} />
          </View>

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.columnsLabel")}</Text>
          {columns.map((col, i) => (
            <View key={col.id} style={[styles.colCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.colTop}>
                <View style={[styles.colDot, { backgroundColor: col.color }]} />
                <TextInput
                  style={[styles.colInput, { color: colors.text }]}
                  value={col.name}
                  onChangeText={(v) => setName(i, v)}
                  placeholder={t("business.momentum.columnName")}
                  placeholderTextColor={colors.textTertiary}
                />
                <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0}>
                  <Icon name="back" size={18} color={i === 0 ? colors.border : colors.textSecondary} style={{ transform: [{ rotate: "90deg" }] }} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(i, 1)} disabled={i === columns.length - 1}>
                  <Icon name="back" size={18} color={i === columns.length - 1 ? colors.border : colors.textSecondary} style={{ transform: [{ rotate: "-90deg" }] }} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(i)}>
                  <Icon name="close" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
              <View style={styles.swatches}>
                {COLUMN_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setColor(i, c)}
                    style={[styles.swatch, { backgroundColor: c, borderWidth: col.color === c ? 2.5 : 0, borderColor: colors.text }]}
                  />
                ))}
              </View>
            </View>
          ))}

          <TouchableOpacity style={[styles.addCol, { borderColor: colors.border }]} onPress={add}>
            <Icon name="add" size={18} color={colors.primary} />
            <Text style={[styles.addColText, { color: colors.primary }]}>{t("business.momentum.addColumn")}</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={onSave} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{t("business.momentum.saveBoard")}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 24 },
    field: { marginBottom: 18 },
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    colCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
    colTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    colDot: { width: 12, height: 12, borderRadius: 6 },
    colInput: { flex: 1, fontSize: 15, fontWeight: "600", paddingVertical: 4 },
    swatches: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    swatch: { width: 26, height: 26, borderRadius: 13 },
    addCol: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, paddingVertical: 14, marginTop: 6 },
    addColText: { fontSize: 14, fontWeight: "700" },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
