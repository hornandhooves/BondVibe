/**
 * CsvImportScreen — bulk-create members by pasting a CSV (migrate an existing
 * client list). Zero native deps (paste, not file-pick) so it stays OTA-able.
 * Imported members get NO SMS consent unless a consent column is mapped and
 * truthy (never assume consent on a migrated list — LFPDPPP).
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { getBusiness } from "../../services/businessService";
import { parseCsv, bulkImportMembers } from "../../services/businessMembersService";

// Auto-map a field to a column by header keywords (EN + ES).
const GUESSES = {
  name: ["name", "nombre", "member", "cliente"],
  phone: ["phone", "tel", "cel", "móvil", "movil", "whatsapp"],
  email: ["email", "correo", "mail", "e-mail"],
  tags: ["tag", "etiqueta", "grupo", "nivel"],
  sms_consent: ["consent", "consentimiento", "sms", "opt"],
};

const guess = (headers, keys) => {
  const i = headers.findIndex((h) => keys.some((k) => h.toLowerCase().includes(k)));
  return i >= 0 ? i : null;
};

const FIELDS = [
  { key: "name", required: true },
  { key: "phone", required: false },
  { key: "email", required: false },
  { key: "tags", required: false },
  { key: "sms_consent", required: false },
];

export default function CsvImportScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [map, setMap] = useState({});
  const [importing, setImporting] = useState(false);

  const doParse = () => {
    const p = parseCsv(raw);
    if (!p.headers.length || !p.rows.length) {
      Alert.alert(t("business.csv.emptyTitle"), t("business.csv.emptyMsg"));
      return;
    }
    setParsed(p);
    const m = {};
    for (const f of FIELDS) m[f.key] = guess(p.headers, GUESSES[f.key]);
    setMap(m);
  };

  const setFieldColumn = (fieldKey, colIndex) =>
    setMap((cur) => ({ ...cur, [fieldKey]: cur[fieldKey] === colIndex ? null : colIndex }));

  const onImport = async () => {
    if (map.name == null) {
      Alert.alert(t("business.csv.nameRequiredTitle"), t("business.csv.nameRequiredMsg"));
      return;
    }
    setImporting(true);
    try {
      const biz = await getBusiness();
      const cleanMap = Object.fromEntries(Object.entries(map).filter(([, v]) => v != null));
      const res = await bulkImportMembers(parsed.rows, cleanMap, biz?.name || "");
      setImporting(false);
      Alert.alert(
        t("business.csv.doneTitle"),
        t("business.csv.doneMsg", { created: res.created, skipped: res.skipped }),
        [{ text: t("business.common.ok"), onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      setImporting(false);
      Alert.alert(t("business.common.errorTitle"), t("business.common.tryAgain"));
    }
  };

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.csv.title")}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("business.csv.intro")}</Text>

        <TextInput
          style={[styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          value={raw}
          onChangeText={setRaw}
          placeholder={t("business.csv.placeholder")}
          placeholderTextColor={colors.textTertiary}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
        />

        {!parsed ? (
          <TouchableOpacity
            style={[styles.parseBtn, { backgroundColor: raw.trim() ? colors.primary : colors.border }]}
            onPress={doParse}
            disabled={!raw.trim()}
          >
            <Text style={styles.parseText}>{t("business.csv.parse")}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={[styles.detected, { color: colors.textSecondary }]}>
              {t("business.csv.detected", { rows: parsed.rows.length, cols: parsed.headers.length })}
            </Text>

            {FIELDS.map((f) => (
              <View key={f.key} style={styles.mapField}>
                <Text style={[styles.mapLabel, { color: colors.text }]}>
                  {t(`business.csv.field.${f.key}`)}
                  {f.required && <Text style={{ color: colors.error }}> *</Text>}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colChips}>
                  {parsed.headers.map((h, idx) => {
                    const active = map[f.key] === idx;
                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => setFieldColumn(f.key, idx)}
                        style={[
                          styles.colChip,
                          { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}18` : "transparent" },
                        ]}
                      >
                        <Text style={[styles.colChipText, { color: active ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
                          {h || t("business.csv.colN", { n: idx + 1 })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ))}

            <Text style={[styles.consentNote, { color: colors.textTertiary }]}>{t("business.csv.consentNote")}</Text>

            <TouchableOpacity
              style={[styles.importBtn, { backgroundColor: colors.primary, opacity: importing ? 0.6 : 1 }]}
              onPress={onImport}
              disabled={importing}
              activeOpacity={0.85}
            >
              {importing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.importText}>{t("business.csv.import", { count: parsed.rows.length })}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    intro: { fontSize: 13.5, lineHeight: 19, marginBottom: 14 },
    textarea: { borderWidth: 1, borderRadius: 13, padding: 14, fontSize: 13, minHeight: 120, textAlignVertical: "top", fontFamily: "Courier" },
    parseBtn: { height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 16 },
    parseText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    detected: { fontSize: 13, fontWeight: "600", marginTop: 18, marginBottom: 6 },
    mapField: { marginTop: 14 },
    mapLabel: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
    colChips: { gap: 8, paddingRight: 8 },
    colChip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8, maxWidth: 160 },
    colChipText: { fontSize: 13, fontWeight: "600" },
    consentNote: { fontSize: 12, lineHeight: 17, marginTop: 18 },
    importBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginTop: 16 },
    importText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
