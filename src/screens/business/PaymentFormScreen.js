/**
 * PaymentFormScreen — record a payment (kinlo_business/01 §6). Manual-first:
 * cash / transfer / online (logged). Optionally tied to a member and applied to
 * their outstanding balance. Offers a shareable receipt on save.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import { getBusiness } from "../../services/businessService";
import { getMember, listMembers } from "../../services/businessMembersService";
import { createPayment, receiptText, PAYMENT_METHODS } from "../../services/businessPaymentsService";
import { formatCentavos } from "../../utils/pricing";

export default function PaymentFormScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const presetMemberId = route.params?.memberId || null;

  const [business, setBusiness] = useState(null);
  const [member, setMember] = useState(null);
  const [pickMember, setPickMember] = useState(false);
  const [members, setMembers] = useState([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date());
  const [applyToBalance, setApplyToBalance] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const biz = await getBusiness();
      setBusiness(biz);
      if (presetMemberId) {
        const m = await getMember(presetMemberId);
        setMember(m);
        if ((m?.balanceOwedCents || 0) > 0) setApplyToBalance(true);
      }
    })();
  }, [presetMemberId]);

  const openPicker = async () => {
    setMembers(await listMembers());
    setPickMember(true);
  };

  const onSave = async () => {
    const cents = Math.round((parseFloat(amount) || 0) * 100);
    if (cents <= 0) {
      Alert.alert(t("business.payment.amountRequiredTitle"), t("business.payment.amountRequiredMsg"));
      return;
    }
    setSaving(true);
    try {
      const payment = await createPayment({
        memberId: member?.id || null,
        memberName: member?.name || "",
        amount,
        method,
        note,
        date,
        applyToBalance: applyToBalance && (member?.balanceOwedCents || 0) > 0,
      });
      const methodLabel = t(`business.payment.method.${method}`);
      Alert.alert(t("business.payment.savedTitle"), t("business.payment.savedMsg"), [
        {
          text: t("business.payment.shareReceipt"),
          onPress: async () => {
            try {
              await Share.share({ message: receiptText(payment, business?.name, methodLabel) });
            } catch (e) {
              /* cancelled */
            }
            navigation.goBack();
          },
        },
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
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.payment.title")}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Member (optional) */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.payment.member")}</Text>
            <TouchableOpacity style={[styles.input, inputStyle, styles.memberRow]} onPress={openPicker}>
              <Text style={{ color: member ? colors.text : colors.textTertiary, fontSize: 15, flex: 1 }}>
                {member ? member.name : t("business.payment.noMember")}
              </Text>
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
            {member && (member.balanceOwedCents || 0) > 0 && (
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceText, { color: colors.warning }]}>
                  {t("business.payment.owes", { amount: formatCentavos(member.balanceOwedCents) })}
                </Text>
                <View style={styles.applyRow}>
                  <Text style={[styles.applyLabel, { color: colors.textSecondary }]}>{t("business.payment.applyToBalance")}</Text>
                  <Switch value={applyToBalance} onValueChange={setApplyToBalance} trackColor={{ true: colors.primary }} />
                </View>
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.payment.amount")}</Text>
            <TextInput style={[styles.input, inputStyle, styles.amount]} value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.payment.methodLabel")}</Text>
            <View style={styles.segRow}>
              {PAYMENT_METHODS.map((m) => {
                const active = method === m;
                return (
                  <TouchableOpacity key={m} onPress={() => setMethod(m)} style={[styles.seg, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}14` : "transparent" }]}>
                    <Text style={[styles.segText, { color: active ? colors.primary : colors.textSecondary }]}>{t(`business.payment.method.${m}`)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.payment.date")}</Text>
            <DateField label={t("business.payment.date")} value={date} onChange={setDate} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.payment.note")}</Text>
            <TextInput style={[styles.input, inputStyle]} value={note} onChangeText={setNote} placeholder={t("business.payment.notePlaceholder")} placeholderTextColor={colors.textTertiary} />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={onSave} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{t("business.payment.save")}</Text>}
          </TouchableOpacity>
        </View>

        <Modal visible={pickMember} transparent animationType="slide" onRequestClose={() => setPickMember(false)}>
          <View style={styles.sheetBackdrop}>
            <View style={[styles.sheet, { backgroundColor: colors.background }]}>
              <View style={styles.sheetHeader}>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("business.payment.member")}</Text>
                <TouchableOpacity onPress={() => setPickMember(false)}>
                  <Icon name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                <TouchableOpacity style={[styles.pickRow, { borderColor: colors.border }]} onPress={() => { setMember(null); setPickMember(false); }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{t("business.payment.noMember")}</Text>
                </TouchableOpacity>
                {members.map((m) => (
                  <TouchableOpacity key={m.id} style={[styles.pickRow, { borderColor: colors.border }]} onPress={() => { setMember(m); setApplyToBalance((m.balanceOwedCents || 0) > 0); setPickMember(false); }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>{m.name}</Text>
                    <Icon name="forward" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 24 },
    field: { marginBottom: 16 },
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    amount: { fontSize: 22, fontWeight: "800" },
    memberRow: { flexDirection: "row", alignItems: "center" },
    balanceRow: { marginTop: 8 },
    balanceText: { fontSize: 12.5, fontWeight: "700" },
    applyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
    applyLabel: { fontSize: 13, fontWeight: "600" },
    segRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    seg: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, flexGrow: 1, alignItems: "center" },
    segText: { fontSize: 12, fontWeight: "700" },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    sheetTitle: { fontSize: 16, fontWeight: "800" },
    pickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  });
}
