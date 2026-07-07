/**
 * MomentumCardScreen — the Jira-style card detail (kinlo_business/02 §B):
 * member, action title, description/message, priority, action status, labels,
 * due date, reminder, channel, checklist, activity — plus an AI "suggest +
 * draft" that fills the action, priority and message for the host to approve.
 * (Reminder delivery + channel routing land with the Automations block.)
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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import DateField from "../../components/DateField";
import { useTheme } from "../../contexts/ThemeContext";
import { getCard, updateCard, deleteCard } from "../../services/businessMomentumService";
import { callClaude } from "../../services/claudeService";
import { PRIORITIES, ACTION_STATUSES, CHANNELS } from "../../constants/momentumDefaults";

export default function MomentumCardScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const cardId = route.params?.cardId;

  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const [actionTitle, setActionTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [actionStatus, setActionStatus] = useState("todo");
  const [labels, setLabels] = useState([]);
  const [labelDraft, setLabelDraft] = useState("");
  const [dueDate, setDueDate] = useState(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderAt, setReminderAt] = useState(null);
  const [channel, setChannel] = useState("push");
  const [checklist, setChecklist] = useState([]);
  const [checkDraft, setCheckDraft] = useState("");

  useEffect(() => {
    (async () => {
      const c = await getCard(cardId);
      if (c) {
        setCard(c);
        setActionTitle(c.actionTitle || "");
        setDescription(c.description || "");
        setPriority(c.priority || "medium");
        setActionStatus(c.actionStatus || "todo");
        setLabels(Array.isArray(c.labels) ? c.labels : []);
        setDueDate(c.dueDate ? new Date(c.dueDate) : null);
        setReminderOn(c.reminder?.on === true);
        setReminderAt(c.reminder?.at ? new Date(c.reminder.at) : null);
        setChannel(c.channel || "push");
        setChecklist(Array.isArray(c.checklist) ? c.checklist : []);
      }
      setLoading(false);
    })();
  }, [cardId]);

  const addLabel = () => {
    const v = labelDraft.trim();
    if (v && !labels.includes(v)) setLabels((c) => [...c, v]);
    setLabelDraft("");
  };
  const addCheck = () => {
    const v = checkDraft.trim();
    if (v) setChecklist((c) => [...c, { text: v, done: false }]);
    setCheckDraft("");
  };
  const toggleCheck = (i) =>
    setChecklist((c) => c.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it)));
  const removeCheck = (i) => setChecklist((c) => c.filter((_, idx) => idx !== i));

  const onAiDraft = async () => {
    if (!card?.memberId) return;
    setAiBusy(true);
    const res = await callClaude("momentum_action", { memberId: card.memberId });
    setAiBusy(false);
    if (res.ok && res.data) {
      setActionTitle(res.data.actionTitle || actionTitle);
      setPriority(res.data.priority || priority);
      setDescription(res.data.message || description);
    } else if (res.needsPro) {
      Alert.alert(t("business.momentum.aiProTitle"), t("business.momentum.aiProMsg"));
    } else {
      Alert.alert(t("business.momentum.aiOffTitle"), t("business.momentum.aiOffMsg"));
    }
  };

  const onSave = async () => {
    setSaving(true);
    const statusChanged = card && card.actionStatus !== actionStatus;
    try {
      await updateCard(
        cardId,
        {
          actionTitle: actionTitle.trim(),
          description: description.trim(),
          priority,
          actionStatus,
          labels,
          dueDate: dueDate ? dueDate.toISOString() : null,
          reminder: { on: reminderOn, at: reminderAt ? reminderAt.toISOString() : null },
          channel,
          checklist,
        },
        statusChanged ? { type: "status", text: `Status → ${t(`business.momentum.status.${actionStatus}`)}` } : null
      );
      navigation.goBack();
    } catch (e) {
      setSaving(false);
      Alert.alert(t("business.common.errorTitle"), t("business.common.tryAgain"));
    }
  };

  const onDelete = () =>
    Alert.alert(t("business.momentum.deleteTitle"), t("business.momentum.deleteMsg"), [
      { text: t("business.common.cancel"), style: "cancel" },
      {
        text: t("business.momentum.deleteConfirm"),
        style: "destructive",
        onPress: async () => {
          await deleteCard(cardId);
          navigation.goBack();
        },
      },
    ]);

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
  const Segment = ({ options, value, onChange, labelKey }) => (
    <View style={styles.segRow}>
      {options.map((o) => {
        const active = value === o;
        return (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(o)}
            style={[styles.seg, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}14` : "transparent" }]}
          >
            <Text style={[styles.segText, { color: active ? colors.primary : colors.textSecondary }]}>{t(`${labelKey}.${o}`)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.momentum.cardTitle")}</Text>
          <TouchableOpacity onPress={onDelete}>
            <Icon name="delete" size={22} color={colors.error} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Member */}
          {!!card?.memberId && (
            <TouchableOpacity
              style={[styles.memberChip, { backgroundColor: colors.surfaceGlass }]}
              onPress={() => navigation.navigate("BusinessMemberRecord", { memberId: card.memberId })}
            >
              <Icon name="profile" size={16} color={colors.primary} />
              <Text style={[styles.memberChipText, { color: colors.text }]}>{card.memberName}</Text>
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}

          {/* AI draft */}
          <TouchableOpacity style={[styles.aiBtn, { backgroundColor: colors.ink || "#160F22" }]} onPress={onAiDraft} disabled={aiBusy}>
            {aiBusy ? (
              <ActivityIndicator size="small" color="#C792EA" />
            ) : (
              <>
                <Icon name="ai" size={16} color="#C792EA" />
                <Text style={styles.aiBtnText}>{t("business.momentum.aiDraft")}</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.actionTitle")}</Text>
            <TextInput style={[styles.input, inputStyle]} value={actionTitle} onChangeText={setActionTitle} placeholder={t("business.momentum.actionPlaceholder")} placeholderTextColor={colors.textTertiary} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.priority.label")}</Text>
            <Segment options={PRIORITIES} value={priority} onChange={setPriority} labelKey="business.momentum.priority" />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.actionStatusLabel")}</Text>
            <Segment options={ACTION_STATUSES} value={actionStatus} onChange={setActionStatus} labelKey="business.momentum.status" />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.message")}</Text>
            <TextInput style={[styles.input, inputStyle, styles.textarea]} value={description} onChangeText={setDescription} placeholder={t("business.momentum.messagePlaceholder")} placeholderTextColor={colors.textTertiary} multiline />
          </View>

          {/* Labels */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.labels")}</Text>
            <View style={styles.chips}>
              {labels.map((l) => (
                <TouchableOpacity key={l} style={[styles.chipSel, { backgroundColor: `${colors.primary}18` }]} onPress={() => setLabels((c) => c.filter((x) => x !== l))}>
                  <Text style={[styles.chipSelText, { color: colors.primary }]}>{l}</Text>
                  <Icon name="close" size={11} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.input, inputStyle, styles.inlineInput]}>
              <TextInput style={{ flex: 1, color: colors.text, fontSize: 14 }} value={labelDraft} onChangeText={setLabelDraft} placeholder={t("business.momentum.addLabel")} placeholderTextColor={colors.textTertiary} onSubmitEditing={addLabel} returnKeyType="done" />
              {!!labelDraft.trim() && <TouchableOpacity onPress={addLabel}><Icon name="add" size={18} color={colors.primary} /></TouchableOpacity>}
            </View>
          </View>

          {/* Due date + reminder */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.dueDate")}</Text>
            <DateField label={t("business.momentum.dueDate")} value={dueDate} onChange={setDueDate} onClear={() => setDueDate(null)} />
          </View>
          <View style={[styles.rowBetween, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>{t("business.momentum.reminder")}</Text>
              <Text style={[styles.switchHint, { color: colors.textTertiary }]}>{t("business.momentum.reminderHint")}</Text>
            </View>
            <Switch value={reminderOn} onValueChange={setReminderOn} trackColor={{ true: colors.primary }} />
          </View>
          {reminderOn && (
            <View style={[styles.field, { marginTop: 12 }]}>
              <DateField label={t("business.momentum.reminderAt")} value={reminderAt} onChange={setReminderAt} onClear={() => setReminderAt(null)} />
            </View>
          )}

          {/* Channel */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.channel")}</Text>
            <Segment options={CHANNELS} value={channel} onChange={setChannel} labelKey="business.momentum.channelOpt" />
          </View>

          {/* Checklist */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.checklist")}</Text>
            {checklist.map((it, i) => (
              <View key={i} style={styles.checkRow}>
                <TouchableOpacity onPress={() => toggleCheck(i)} style={[styles.checkbox, { borderColor: it.done ? colors.success : colors.border, backgroundColor: it.done ? colors.success : "transparent" }]}>
                  {it.done && <Icon name="checkAll" size={12} color="#fff" />}
                </TouchableOpacity>
                <Text style={[styles.checkText, { color: colors.text, textDecorationLine: it.done ? "line-through" : "none" }]}>{it.text}</Text>
                <TouchableOpacity onPress={() => removeCheck(i)}><Icon name="close" size={14} color={colors.textTertiary} /></TouchableOpacity>
              </View>
            ))}
            <View style={[styles.input, inputStyle, styles.inlineInput]}>
              <TextInput style={{ flex: 1, color: colors.text, fontSize: 14 }} value={checkDraft} onChangeText={setCheckDraft} placeholder={t("business.momentum.addTask")} placeholderTextColor={colors.textTertiary} onSubmitEditing={addCheck} returnKeyType="done" />
              {!!checkDraft.trim() && <TouchableOpacity onPress={addCheck}><Icon name="add" size={18} color={colors.primary} /></TouchableOpacity>}
            </View>
          </View>

          {/* Activity */}
          {Array.isArray(card?.activity) && card.activity.length > 0 && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.momentum.activity")}</Text>
              <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {card.activity.slice(0, 10).map((a, i) => (
                  <View key={i} style={[styles.actRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Text style={[styles.actText, { color: colors.textSecondary }]}>{a.text}</Text>
                    <Text style={[styles.actDate, { color: colors.textTertiary }]}>{new Date(a.at).toLocaleDateString()}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={onSave} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{t("business.momentum.save")}</Text>}
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
    memberChip: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, marginBottom: 14 },
    memberChipText: { fontSize: 14, fontWeight: "700" },
    aiBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 23, marginBottom: 18 },
    aiBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    field: { marginBottom: 16 },
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
    inlineInput: { flexDirection: "row", alignItems: "center", gap: 8 },
    textarea: { minHeight: 80, textAlignVertical: "top" },
    segRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    seg: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, flexGrow: 1, alignItems: "center" },
    segText: { fontSize: 12.5, fontWeight: "700" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
    chipSel: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
    chipSelText: { fontSize: 13, fontWeight: "700" },
    rowBetween: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12 },
    switchLabel: { fontSize: 14, fontWeight: "700" },
    switchHint: { fontSize: 11.5, marginTop: 2 },
    checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    checkText: { flex: 1, fontSize: 14 },
    activityCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
    actRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
    actText: { fontSize: 12.5, flex: 1 },
    actDate: { fontSize: 11 },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
