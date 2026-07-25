/**
 * AutomationFormScreen — create / edit an automation rule (kinlo_business/04):
 * trigger → audience → message → channels. AI drafts the copy; the host
 * approves. Scheduled triggers run server-side; any rule can also send now.
 */
import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet,
  Switch, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import { useTheme } from "../../contexts/ThemeContext";
import { getRule, createRule, updateRule, deleteRule, sendNow, TRIGGERS, AUDIENCE_TYPES, CHANNELS, SCHEDULED_TRIGGERS } from "../../services/businessAutomationsService";
import { callClaude } from "../../services/claudeService";

export default function AutomationFormScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const ruleId = route.params?.ruleId || null;
  const editing = !!ruleId;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [trigger, setTrigger] = useState("welcome");
  const [audienceType, setAudienceType] = useState("all");
  const [tag, setTag] = useState("");
  const [channels, setChannels] = useState(["push", "inapp"]);
  const [message, setMessage] = useState("");
  const [days, setDays] = useState("3");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!editing) return;
    (async () => {
      const r = await getRule(ruleId);
      if (r) {
        setTrigger(r.trigger || "welcome");
        setAudienceType(r.audience?.type || "all");
        setTag(r.audience?.type === "tag" ? r.audience.value || "" : "");
        setChannels(Array.isArray(r.channels) ? r.channels : ["push", "inapp"]);
        setMessage(r.message || "");
        setDays(String(r.params?.days || 3));
        setActive(r.active !== false);
      }
      setLoading(false);
    })();
  }, [ruleId]);

  const toggleChannel = (c) => setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const buildAudience = () => (audienceType === "tag" ? { type: "tag", value: tag.trim() } : { type: audienceType });

  const onAiDraft = async () => {
    setAiBusy(true);
    try {
      const res = await callClaude("automation_copy", { trigger, audienceType });
      if (res.ok && res.data?.message) setMessage(res.data.message);
      else if (res.needsPro) Alert.alert(t("business.momentum.aiProTitle"), t("business.momentum.aiProMsg"));
      else Alert.alert(t("business.momentum.aiOffTitle"), t("business.momentum.aiOffMsg"));
    } catch (e) {
      Alert.alert(t("business.momentum.aiOffTitle"), t("business.momentum.aiOffMsg"));
    } finally {
      setAiBusy(false);
    }
  };

  const payload = () => ({ trigger, params: { days: parseInt(days, 10) || 3 }, audience: buildAudience(), message: message.trim(), channels, active });

  const onSave = async () => {
    if (!message.trim()) { Alert.alert(t("business.automations.msgRequiredTitle"), t("business.automations.msgRequiredMsg")); return; }
    setSaving(true);
    try {
      if (editing) await updateRule(ruleId, payload());
      else await createRule(payload());
      navigation.goBack();
    } catch (e) {
      setSaving(false);
      Alert.alert(t("business.common.errorTitle"), t("business.common.tryAgain"));
    }
  };

  const onSendNow = async () => {
    if (!message.trim()) { Alert.alert(t("business.automations.msgRequiredTitle"), t("business.automations.msgRequiredMsg")); return; }
    const res = await sendNow({ message: message.trim(), audience: buildAudience(), channels, ruleId });
    Alert.alert(t("business.automations.sentTitle"), t("business.automations.sentMsg", { sent: res.sent, skipped: res.skipped }));
  };

  const onDelete = () =>
    Alert.alert(t("business.automations.deleteTitle"), t("business.automations.deleteMsg"), [
      { text: t("business.common.cancel"), style: "cancel" },
      { text: t("business.automations.delete"), style: "destructive", onPress: async () => { await deleteRule(ruleId); navigation.goBack(); } },
    ]);

  const styles = createStyles(colors);
  if (loading) return <GradientBackground><View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View></GradientBackground>;
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };
  const scheduled = SCHEDULED_TRIGGERS.includes(trigger);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Icon name="close" size={26} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{editing ? t("business.automations.editTitle") : t("business.automations.newTitle")}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.automations.triggerLabel")}</Text>
          <View style={styles.chips}>
            {TRIGGERS.map((tr) => {
              const on = trigger === tr;
              return <TouchableOpacity key={tr} onPress={() => setTrigger(tr)} style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}18` : "transparent" }]}><Text style={[styles.chipText, { color: on ? colors.primary : colors.textSecondary }]}>{t(`business.automations.trigger.${tr}`)}</Text></TouchableOpacity>;
            })}
          </View>
          {scheduled && (
            <View style={styles.daysRow}>
              <Text style={[styles.daysLabel, { color: colors.textSecondary }]}>{t("business.automations.daysBefore")}</Text>
              <TextInput style={[styles.daysInput, inputStyle]} value={days} onChangeText={setDays} keyboardType="number-pad" />
            </View>
          )}

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.automations.audienceLabel")}</Text>
          <View style={styles.chips}>
            {AUDIENCE_TYPES.map((a) => {
              const on = audienceType === a;
              return <TouchableOpacity key={a} onPress={() => setAudienceType(a)} style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}18` : "transparent" }]}><Text style={[styles.chipText, { color: on ? colors.primary : colors.textSecondary }]}>{t(`business.automations.audience.${a}`)}</Text></TouchableOpacity>;
            })}
          </View>
          {audienceType === "tag" && <TextInput style={[styles.input, inputStyle]} value={tag} onChangeText={setTag} placeholder={t("business.automations.tagPlaceholder")} placeholderTextColor={colors.textTertiary} />}

          <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.automations.channelsLabel")}</Text>
          <View style={styles.chips}>
            {CHANNELS.map((c) => {
              const on = channels.includes(c);
              return <TouchableOpacity key={c} onPress={() => toggleChannel(c)} style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? `${colors.primary}18` : "transparent" }]}><Text style={[styles.chipText, { color: on ? colors.primary : colors.textSecondary }]}>{t(`business.automations.channel.${c}`)}</Text></TouchableOpacity>;
            })}
          </View>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>{t("business.automations.channelHint")}</Text>

          <View style={styles.msgHeader}>
            <Text style={[styles.label, { color: colors.textTertiary, marginBottom: 0 }]}>{t("business.automations.message")}</Text>
            <TouchableOpacity style={[styles.aiBtn, { backgroundColor: colors.ink || "#160F22" }]} onPress={onAiDraft} disabled={aiBusy}>
              {aiBusy ? <ActivityIndicator size="small" color="#C792EA" /> : <><Icon name="ai" size={13} color="#C792EA" /><Text style={styles.aiText}>{t("business.automations.aiDraft")}</Text></>}
            </TouchableOpacity>
          </View>
          <TextInput style={[styles.input, inputStyle, styles.textarea]} value={message} onChangeText={setMessage} placeholder={t("business.automations.messagePlaceholder")} placeholderTextColor={colors.textTertiary} multiline />

          <View style={[styles.rowBetween, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>{t("business.automations.active")}</Text>
              {scheduled && <Text style={[styles.switchHint, { color: colors.textTertiary }]}>{t("business.automations.activeHint")}</Text>}
            </View>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: colors.primary }} />
          </View>

          <TouchableOpacity style={[styles.sendNowBtn, { borderColor: colors.primary }]} onPress={onSendNow}>
            <Icon name="send" size={16} color={colors.primary} />
            <Text style={[styles.sendNowText, { color: colors.primary }]}>{t("business.automations.sendNowAudience")}</Text>
          </TouchableOpacity>

          {editing && <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}><Icon name="delete" size={16} color={colors.error} /><Text style={[styles.deleteText, { color: colors.error }]}>{t("business.automations.delete")}</Text></TouchableOpacity>}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} onPress={onSave} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>{t("business.automations.save")}</Text>}
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
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8, marginTop: 14 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
    chipText: { fontSize: 12.5, fontWeight: "700" },
    daysRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
    daysLabel: { fontSize: 13, flex: 1 },
    daysInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, width: 70, textAlign: "center" },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 8 },
    textarea: { minHeight: 90, textAlignVertical: "top" },
    hint: { fontSize: 11.5, marginTop: 8, lineHeight: 16 },
    msgHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
    aiBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
    aiText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    rowBetween: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16 },
    switchLabel: { fontSize: 14, fontWeight: "700" },
    switchHint: { fontSize: 11.5, marginTop: 2 },
    sendNowBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 24, paddingVertical: 13, marginTop: 16 },
    sendNowText: { fontSize: 14, fontWeight: "700" },
    deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 18 },
    deleteText: { fontSize: 14, fontWeight: "700" },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
