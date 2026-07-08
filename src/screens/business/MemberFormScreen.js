/**
 * MemberFormScreen — add / edit a member by hand (manual-first, no app account
 * required). Captures SMS consent explicitly at enrollment (LFPDPPP: opt-in,
 * off by default, references the privacy notice). Saving a NEW member mints a
 * guest code so they can later link an app account without duplicating.
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
import { useTheme } from "../../contexts/ThemeContext";
import { getBusiness, listBranches } from "../../services/businessService";
import { createMember, updateMember, getMember, buildSmsConsent } from "../../services/businessMembersService";
import { verticalTagsKey } from "../../constants/businessVerticals";

export default function MemberFormScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const memberId = route.params?.memberId || null;
  const editing = !!memberId;

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState("");
  const [notes, setNotes] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [balanceOwed, setBalanceOwed] = useState("");
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(null);

  useEffect(() => {
    (async () => {
      const [biz, brs] = await Promise.all([getBusiness(), listBranches()]);
      setBusiness(biz);
      setBranches(brs);
      if (editing) {
        const m = await getMember(memberId);
        if (m) {
          setName(m.name || "");
          setPhone(m.phone || "");
          setEmail(m.email || "");
          setTags(Array.isArray(m.tags) ? m.tags : []);
          setSmsConsent(m.smsConsent?.granted === true);
          setBalanceOwed(m.balanceOwedCents ? String(m.balanceOwedCents / 100) : "");
          setBranchId(m.branchId || null);
        }
        setLoading(false);
      }
    })();
  }, [memberId]);

  const suggested = (() => {
    try {
      const arr = t(verticalTagsKey(business?.vertical), { returnObjects: true });
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  })();

  const toggleTag = (tag) =>
    setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));

  const addDraftTag = () => {
    const v = tagDraft.trim();
    if (v && !tags.includes(v)) setTags((cur) => [...cur, v]);
    setTagDraft("");
  };

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert(t("business.form.nameRequiredTitle"), t("business.form.nameRequiredMsg"));
      return;
    }
    setSaving(true);
    try {
      const owedCents = Math.max(0, Math.round((parseFloat(balanceOwed) || 0) * 100));
      if (editing) {
        await updateMember(memberId, {
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          tags,
          branchId: branchId || null,
          balanceOwedCents: owedCents,
          smsConsent: buildSmsConsent(smsConsent, "edit"),
          ...(notes.trim() ? { appendNote: notes.trim() } : {}),
        });
      } else {
        await createMember(
          {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            tags,
            notes: notes.trim(),
            branchId: branchId || null,
            balanceOwedCents: owedCents,
            smsConsentGranted: smsConsent,
            source: "manual",
          },
          business?.name || ""
        );
      }
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

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {editing ? t("business.form.editTitle") : t("business.form.newTitle")}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.form.name")}</Text>
            <TextInput
              style={[styles.input, inputStyle(colors)]}
              value={name}
              onChangeText={setName}
              placeholder={t("business.form.namePlaceholder")}
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.form.phone")}</Text>
              <TextInput
                style={[styles.input, inputStyle(colors)]}
                value={phone}
                onChangeText={setPhone}
                placeholder="+52 …"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.form.emailOptional")}</Text>
              <TextInput
                style={[styles.input, inputStyle(colors)]}
                value={email}
                onChangeText={setEmail}
                placeholder="—"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.form.tags")}</Text>
            <View style={styles.tagsWrap}>
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.tagSelected, { backgroundColor: `${colors.primary}18` }]}
                  onPress={() => toggleTag(tag)}
                >
                  <Text style={[styles.tagSelectedText, { color: colors.primary }]}>{tag}</Text>
                  <Icon name="close" size={12} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
            {suggested.filter((s) => !tags.includes(s)).length > 0 && (
              <View style={styles.tagsWrap}>
                {suggested
                  .filter((s) => !tags.includes(s))
                  .map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.tagSuggest, { borderColor: colors.border }]}
                      onPress={() => toggleTag(s)}
                    >
                      <Text style={[styles.tagSuggestText, { color: colors.textSecondary }]}>+ {s}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            )}
            <View style={[styles.input, inputStyle(colors), styles.tagInputRow]}>
              <TextInput
                style={{ flex: 1, color: colors.text, fontSize: 14 }}
                value={tagDraft}
                onChangeText={setTagDraft}
                placeholder={t("business.form.addTag")}
                placeholderTextColor={colors.textTertiary}
                onSubmitEditing={addDraftTag}
                returnKeyType="done"
              />
              {!!tagDraft.trim() && (
                <TouchableOpacity onPress={addDraftTag}>
                  <Icon name="add" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.form.notes")}</Text>
            <TextInput
              style={[styles.input, inputStyle(colors), styles.textarea]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("business.form.notesPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              multiline
            />
          </View>

          {branches.length > 0 && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.form.branch")}</Text>
              <View style={styles.tagsWrap}>
                {branches.map((br) => {
                  const active = branchId === br.id;
                  return (
                    <TouchableOpacity
                      key={br.id}
                      onPress={() => setBranchId(active ? null : br.id)}
                      style={[styles.tagSuggest, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}18` : "transparent" }]}
                    >
                      <Text style={[styles.tagSuggestText, { color: active ? colors.primary : colors.textSecondary }]}>{br.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.form.balanceOwed")}</Text>
            <TextInput
              style={[styles.input, inputStyle(colors)]}
              value={balanceOwed}
              onChangeText={setBalanceOwed}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
            />
          </View>

          {/* SMS consent — LFPDPPP explicit opt-in, off by default. */}
          <View style={[styles.consentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.consentRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.consentTitle, { color: colors.text }]}>{t("business.form.smsConsentTitle")}</Text>
                <Text style={[styles.consentSub, { color: colors.textTertiary }]}>
                  {t("business.form.smsConsentSub")}
                </Text>
              </View>
              <Switch value={smsConsent} onValueChange={setSmsConsent} trackColor={{ true: colors.primary }} />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={onSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveText}>{t("business.form.save")}</Text>
            )}
          </TouchableOpacity>
          {!editing && (
            <Text style={[styles.linkNote, { color: colors.textTertiary }]}>{t("business.form.autoLinkNote")}</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const inputStyle = (colors) => ({ borderColor: colors.border, backgroundColor: colors.surface, color: colors.text });

function createStyles(colors) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 24 },
    field: { marginBottom: 16 },
    row: { flexDirection: "row", gap: 12 },
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
    textarea: { minHeight: 70, textAlignVertical: "top" },
    tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
    tagSelected: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
    tagSelectedText: { fontSize: 13, fontWeight: "700" },
    tagSuggest: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
    tagSuggestText: { fontSize: 13, fontWeight: "600" },
    tagInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    consentCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 4 },
    consentRow: { flexDirection: "row", alignItems: "center" },
    consentTitle: { fontSize: 14, fontWeight: "700" },
    consentSub: { fontSize: 12, lineHeight: 17, marginTop: 3 },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    linkNote: { fontSize: 11.5, textAlign: "center", marginTop: 10 },
  });
}
