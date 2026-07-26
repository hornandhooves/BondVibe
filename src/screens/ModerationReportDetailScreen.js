/**
 * KIN-117 — report detail + resolve (A2). Admin-only (reached only from
 * ModerationReportsScreen / a report_new notification, both already gated).
 *
 * §1 rule 2: the "who reported" block is derived from `type` — prohibited_content's
 * reporterId is the message's AUTHOR (the infractor), never labeled "Reportó".
 * Both "take case" and "resolve" go through the single admin-gated
 * moderateReport callable so reviewedBy/reviewedAt are always server-stamped
 * from the caller's own token.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, SafeAreaView,
  Image, TextInput, Modal, Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";
import Icon from "../components/Icon";
import { getReport, getUserName, takeReportCase, resolveReportCase } from "../services/moderationService";

const RESOLUTIONS = ["action_taken", "no_violation", "duplicate"];
const RESOLUTION_KEY = {
  action_taken: "resolutionActionTaken",
  no_violation: "resolutionNoViolation",
  duplicate: "resolutionDuplicate",
};

export default function ModerationReportDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { reportId } = route.params || {};

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reporterName, setReporterName] = useState(null);
  const [targetName, setTargetName] = useState(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resolution, setResolution] = useState(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!reportId) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const r = await getReport(reportId);
      if (!r) { setError(true); return; }
      setReport(r);
      // §1 rule 3: targetName only exists on reportUserOrEvent docs — resolve
      // it for user_block (never invent it; honest-null if the user is gone).
      const [rName, tName] = await Promise.all([
        getUserName(r.reporterId),
        r.targetUserId && !r.targetName ? getUserName(r.targetUserId) : Promise.resolve(r.targetName || null),
      ]);
      setReporterName(rName);
      setTargetName(tName);
    } catch (_e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  const reasonLabel = () => {
    if (!report || !report.reason) return null;
    const key = `report.reasons.${report.reason}`;
    const translated = t(key);
    return translated === key ? report.reason : translated;
  };

  const onTakeCase = async () => {
    setBusy(true);
    try {
      await takeReportCase(reportId);
      await load();
    } catch (_e) {
      Alert.alert(t("moderation.detail.takeCaseError"));
    } finally {
      setBusy(false);
    }
  };

  const onResolve = async () => {
    if (!resolution) return;
    setBusy(true);
    try {
      await resolveReportCase(reportId, resolution, notes.trim());
      setSheetOpen(false);
      await load();
    } catch (_e) {
      Alert.alert(t("moderation.detail.resolveError"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !report) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="back" size={26} color={colors.text} />
          </TouchableOpacity>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.centerFill}>
          <Text style={{ color: colors.textSecondary }}>{t("moderation.loadError")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isProhibited = report.type === "prohibited_content";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[TYPE.title, { color: colors.text }]}>{t("moderation.detail.title")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { borderColor: colors.border }]}>
          <Text style={[TYPE.body, { color: colors.text }]}>
            {isProhibited
              ? t("moderation.detectedAuto", { name: reporterName || t("moderation.unknownReporter") })
              : t("moderation.reportedBy", { name: reporterName || t("moderation.unknownReporter") })}
          </Text>
          <Text style={[TYPE.caption, { color: colors.textSecondary, marginTop: 4 }]}>
            {t("moderation.confidential")}
          </Text>
        </View>

        {report.reason ? (
          <View style={styles.section}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>
              {t("moderation.detail.reasonLabel")}
            </Text>
            <Text style={[TYPE.body, { color: colors.text }]}>{reasonLabel()}</Text>
          </View>
        ) : null}

        {report.details ? (
          <View style={styles.section}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>
              {t("moderation.detail.detailsLabel")}
            </Text>
            <Text style={[TYPE.body, { color: colors.text }]}>{report.details}</Text>
          </View>
        ) : null}

        {report.content ? (
          <View style={styles.section}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>
              {t("moderation.detail.contentLabel")}
            </Text>
            <Text style={[TYPE.body, { color: colors.text }]}>{report.content}</Text>
          </View>
        ) : null}

        {report.evidenceUrl ? (
          <View style={styles.section}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>
              {t("moderation.detail.evidenceLabel")}
            </Text>
            {imageFailed ? (
              <Text style={{ color: colors.textSecondary }}>{t("moderation.detail.evidenceLoadError")}</Text>
            ) : (
              <View>
                <Image
                  source={{ uri: report.evidenceUrl }}
                  style={styles.evidenceImage}
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => { setImageLoading(false); setImageFailed(true); }}
                />
                {imageLoading && (
                  <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.primary} />
                )}
              </View>
            )}
          </View>
        ) : null}

        {(report.targetUserId || report.targetEventId) ? (
          <View style={styles.section}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>
              {t("moderation.detail.targetLabel")}
            </Text>
            <Text style={[TYPE.body, { color: colors.text }]}>{targetName || "—"}</Text>
            <View style={styles.targetLinksRow}>
              {report.targetUserId ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate("UserProfile", { userId: report.targetUserId })}
                >
                  <Text style={{ color: colors.primary }}>{t("moderation.detail.viewProfile")}</Text>
                </TouchableOpacity>
              ) : null}
              {report.targetEventId ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate("EventDetail", { eventId: report.targetEventId })}
                >
                  <Text style={{ color: colors.primary }}>{t("moderation.detail.viewEvent")}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {report.status === "open" ? (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.primary, borderWidth: 1 }]}
              onPress={onTakeCase}
              disabled={busy}
            >
              <Text style={{ color: colors.primary }}>{t("moderation.detail.takeCase")}</Text>
            </TouchableOpacity>
          ) : null}
          {report.status !== "resolved" ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => setSheetOpen(true)}
              disabled={busy}
            >
              <Text style={{ color: colors.onPrimary }}>{t("moderation.detail.resolve")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[TYPE.titleLg, { color: colors.text }]}>
              {t("moderation.detail.resolveSheetTitle")}
            </Text>
            {RESOLUTIONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.resolutionOption,
                  { borderColor: colors.border },
                  resolution === r && { borderColor: colors.primary, backgroundColor: colors.brandSoft },
                ]}
                onPress={() => setResolution(r)}
              >
                <Text style={{ color: colors.text }}>{t(`moderation.detail.${RESOLUTION_KEY[r]}`)}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[styles.notesInput, { borderColor: colors.border, color: colors.text }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("moderation.detail.notesPlaceholder")}
              placeholderTextColor={colors.textSecondary}
              multiline
            />
            <View style={styles.sheetActionsRow}>
              <TouchableOpacity onPress={() => setSheetOpen(false)} style={styles.sheetBtn}>
                <Text style={{ color: colors.textSecondary }}>{t("moderation.detail.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onResolve}
                style={[styles.sheetBtn, { backgroundColor: colors.primary }]}
                disabled={!resolution || busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={{ color: colors.onPrimary }}>{t("moderation.detail.submit")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerFill: { flex: 1, justifyContent: "center", alignItems: "center", gap: SPACING.md },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.screen,
    paddingVertical: SPACING.lg,
  },
  content: { paddingHorizontal: SPACING.screen, paddingBottom: SPACING.xxl, gap: SPACING.lg },
  card: { padding: SPACING.card, borderRadius: RADII.card, borderWidth: 1 },
  section: { gap: SPACING.xs },
  evidenceImage: { width: "100%", height: 220, borderRadius: RADII.card, backgroundColor: "#00000010" },
  targetLinksRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm },
  actionsRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.md },
  actionBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADII.button,
    alignItems: "center",
  },
  sheetOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    borderTopLeftRadius: RADII.sheet,
    borderTopRightRadius: RADII.sheet,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  resolutionOption: { padding: SPACING.md, borderRadius: RADII.card, borderWidth: 1 },
  notesInput: {
    borderWidth: 1,
    borderRadius: RADII.card,
    padding: SPACING.md,
    minHeight: 80,
    textAlignVertical: "top",
  },
  sheetActionsRow: { flexDirection: "row", gap: SPACING.md },
  sheetBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADII.button,
    alignItems: "center",
  },
});
