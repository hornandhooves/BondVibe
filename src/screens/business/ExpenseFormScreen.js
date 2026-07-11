/**
 * ExpenseFormScreen — record a business expense (dashboard handoff §8). Mirrors
 * PaymentFormScreen: amount, category, method, date, note + an optional receipt
 * photo. Feeds the P&L on BusinessExpensesScreen and the Dashboard net-margin KPI.
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
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import { getMyBizId } from "../../services/businessService";
import { createExpense, EXPENSE_CATEGORIES } from "../../services/businessExpensesService";
import { PAYMENT_METHODS } from "../../services/businessPaymentsService";
import { uploadExpenseReceipt } from "../../services/storageService";
import { FONTS } from "../../constants/theme-tokens";

const BRAND_GRADIENT = ["#7C3AED", "#C026D3"];

export default function ExpenseFormScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("rent");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date());
  const [receiptUri, setReceiptUri] = useState(null);
  const [saving, setSaving] = useState(false);

  const pickReceipt = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setReceiptUri(res.assets[0].uri);
  };

  const onSave = async () => {
    const cents = Math.round((parseFloat(amount) || 0) * 100);
    if (cents <= 0) {
      Alert.alert(t("business.expense.amountRequiredTitle"), t("business.expense.amountRequiredMsg"));
      return;
    }
    setSaving(true);
    try {
      let receiptUrl = null;
      if (receiptUri) {
        try {
          receiptUrl = await uploadExpenseReceipt(getMyBizId(), receiptUri);
        } catch (e) {
          /* receipt is optional — save the expense anyway */
        }
      }
      await createExpense({ amount, category, method, note, date, receiptUrl });
      Alert.alert(t("business.expense.savedTitle"), t("business.expense.savedMsg"), [
        { text: t("business.common.ok"), onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setSaving(false);
      Alert.alert(t("business.common.errorTitle"), t("business.common.tryAgain"));
    }
  };

  const styles = createStyles(colors);
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.expense.title")}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.expense.amount")}</Text>
            <TextInput
              style={[styles.input, inputStyle, styles.amount]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.expense.categoryLabel")}</Text>
            <View style={styles.segRow}>
              {EXPENSE_CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[styles.seg, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}14` : "transparent" }]}
                  >
                    <Text style={[styles.segText, { color: active ? colors.primary : colors.textSecondary }]}>
                      {t(`business.expense.category.${c}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.expense.methodLabel")}</Text>
            <View style={styles.segRow}>
              {PAYMENT_METHODS.map((m) => {
                const active = method === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMethod(m)}
                    style={[styles.seg, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}14` : "transparent" }]}
                  >
                    <Text style={[styles.segText, { color: active ? colors.primary : colors.textSecondary }]}>
                      {t(`business.payment.method.${m}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.expense.date")}</Text>
            <DateField label={t("business.expense.date")} value={date} onChange={setDate} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.expense.note")}</Text>
            <TextInput
              style={[styles.input, inputStyle]}
              value={note}
              onChangeText={setNote}
              placeholder={t("business.expense.notePlaceholder")}
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.expense.receipt")}</Text>
            {receiptUri ? (
              <View style={styles.receiptWrap}>
                <Image source={{ uri: receiptUri }} style={styles.receiptImg} />
                <TouchableOpacity style={[styles.receiptRemove, { backgroundColor: colors.text }]} onPress={() => setReceiptUri(null)}>
                  <Icon name="close" size={16} color={colors.surface} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.receiptAdd, inputStyle]} onPress={pickReceipt}>
                <Icon name="camera" size={18} color={colors.primary} />
                <Text style={[styles.receiptAddText, { color: colors.primary }]}>{t("business.expense.addReceipt")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={onSave} disabled={saving} activeOpacity={0.9} style={styles.saveShadow}>
            <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.saveBtn, { opacity: saving ? 0.7 : 1 }]}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{t("business.expense.save")}</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingTop: 60, paddingBottom: 8 },
    headerTitle: { fontFamily: FONTS.display, fontSize: 19, letterSpacing: -0.4 },
    content: { paddingHorizontal: 16, paddingBottom: 24 },
    field: { marginBottom: 16 },
    label: { fontFamily: FONTS.bodyBold, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: FONTS.bodySemibold },
    amount: { fontFamily: FONTS.display, fontSize: 24, letterSpacing: -0.5 },
    segRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    seg: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, flexGrow: 1, alignItems: "center" },
    segText: { fontFamily: FONTS.bodyBold, fontSize: 12 },
    receiptAdd: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderRadius: 13, paddingVertical: 16 },
    receiptAddText: { fontFamily: FONTS.bodyBold, fontSize: 13.5 },
    receiptWrap: { position: "relative", alignSelf: "flex-start" },
    receiptImg: { width: 120, height: 120, borderRadius: 12 },
    receiptRemove: { position: "absolute", top: -8, right: -8, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    footer: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 6 },
    saveShadow: {
      borderRadius: 27,
      shadowColor: "#7C3AED",
      shadowOpacity: 0.28,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#fff", fontFamily: FONTS.bodyExtra, fontSize: 16 },
  });
}
