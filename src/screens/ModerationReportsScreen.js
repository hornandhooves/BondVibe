/**
 * KIN-117 — moderation triage queue (A1). Admin-only, same gate as
 * AdminDashboardScreen. Reads /reports directly (client-readable to admins
 * per firestore.rules isAdmin()) — no callable needed for the list itself;
 * only the state-changing actions on the detail screen go through
 * moderateReport. See src/services/moderationService.js for the query
 * shape (single orderBy(createdAt desc), status/type filtered in code —
 * zero composite indexes).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";
import Icon from "../components/Icon";
import useUserRole from "../hooks/useUserRole";
import { listReports, countReportsByStatus } from "../services/moderationService";

const STATUSES = ["open", "in_review", "resolved"];
const TYPES = ["user", "event", "general", "prohibited_content", "user_block"];
const TYPE_ICON = {
  user: "user", event: "calendar", general: "message",
  prohibited_content: "dollar", user_block: "block",
};

const ageMs = (createdAt) => {
  if (!createdAt) return null;
  if (typeof createdAt.toMillis === "function") return createdAt.toMillis();
  const ms = new Date(createdAt).getTime();
  return Number.isFinite(ms) ? ms : null;
};

// §1 rule 5: reason is either a known i18n key (report.reasons.*) or free
// prose (historical docs / user_block) — show it as-is when there's no
// matching key. Fallback is mandatory, never a raw "report.reasons.foo".
const reasonText = (t, reason) => {
  if (!reason) return null;
  const key = `report.reasons.${reason}`;
  const translated = t(key);
  return translated === key ? reason : translated;
};

// §1: the queue row's main text — details (the explanation) first, then the
// translated reason, then a truncated blocked-message preview.
const rowLabel = (r, t) => {
  if (r.details) return r.details;
  const reason = reasonText(t, r.reason);
  if (reason) return reason;
  if (r.content) return r.content.length > 140 ? `${r.content.slice(0, 140)}…` : r.content;
  return "";
};

export default function ModerationReportsScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { role, loading: roleLoading } = useUserRole();
  const isAdmin = role === "admin";

  const [status, setStatus] = useState("open");
  const [typeF, setTypeF] = useState(null);
  const [counts, setCounts] = useState({ open: null, in_review: null, resolved: null });
  const [reports, setReports] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (reset = true) => {
    if (reset) { setLoading(true); setError(false); }
    try {
      const page = await listReports({ status, type: typeF, cursorDoc: reset ? null : lastDoc });
      setReports((prev) => (reset ? page.reports : [...prev, ...page.reports]));
      setLastDoc(page.lastDoc);
      setHasMore(page.hasMore);
    } catch (_e) {
      if (reset) setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [status, typeF, lastDoc]);

  useEffect(() => {
    if (isAdmin) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, status, typeF]);

  useEffect(() => {
    if (!isAdmin) return;
    STATUSES.forEach((s) => {
      countReportsByStatus(s)
        .then((c) => setCounts((prev) => ({ ...prev, [s]: c })))
        .catch(() => {});
    });
  }, [isAdmin]);

  if (roleLoading || !isAdmin) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[TYPE.title, { color: colors.text }]}>{t("moderation.title")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setStatus(s)}
            style={[
              styles.tab,
              { borderColor: colors.border },
              status === s && { borderColor: colors.primary, backgroundColor: colors.brandSoft },
            ]}
          >
            <Text style={[TYPE.label, { color: status === s ? colors.primary : colors.textSecondary }]}>
              {t(`moderation.tabs.${s}`)}{counts[s] != null ? ` (${counts[s]})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {[null, ...TYPES].map((ty) => (
          <TouchableOpacity
            key={ty || "all"}
            onPress={() => setTypeF(ty)}
            style={[
              styles.chip,
              { borderColor: colors.border },
              typeF === ty && { borderColor: colors.primary, backgroundColor: colors.brandSoft },
            ]}
          >
            <Text style={[TYPE.caption, { color: typeF === ty ? colors.primary : colors.textSecondary }]}>
              {t(`moderation.typeChips.${ty || "all"}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>{t("moderation.loadError")}</Text>
          <TouchableOpacity onPress={() => load(true)} style={styles.retryBtn}>
            <Text style={{ color: colors.primary }}>{t("moderation.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>{t("moderation.queueEmpty")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {reports.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.row, { borderColor: colors.border }]}
              onPress={() => navigation.navigate("ModerationReportDetail", { reportId: r.id })}
            >
              <View style={[styles.typeBadge, { backgroundColor: colors.brandSoft }]}>
                <Icon name={TYPE_ICON[r.type] || "report"} size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[TYPE.bodySemibold, { color: colors.text }]} numberOfLines={2}>
                  {rowLabel(r, t)}
                </Text>
                {(r.targetName || r.targetUserId || r.targetEventId) && (
                  <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
                    {t("moderation.about", { name: r.targetName || "—" })}
                  </Text>
                )}
                {r.source === "server" && (
                  <Text style={[TYPE.caption, { color: colors.primary, marginTop: 2 }]}>
                    {t("moderation.serverBadge")}
                  </Text>
                )}
              </View>
              {(() => {
                const ms = ageMs(r.createdAt);
                const overdue = ms != null && Date.now() - ms > 48 * 3600 * 1000;
                return overdue ? (
                  <View style={[styles.overdueBadge, { backgroundColor: colors.warnSoft }]}>
                    <Text style={[TYPE.caption, { color: colors.warning }]}>{t("moderation.overdueBadge")}</Text>
                  </View>
                ) : null;
              })()}
            </TouchableOpacity>
          ))}
          {hasMore && (
            <TouchableOpacity
              onPress={() => { setLoadingMore(true); load(false); }}
              style={styles.loadMoreBtn}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={{ color: colors.primary }}>{t("moderation.loadMore")}</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
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
  tabsRow: { paddingHorizontal: SPACING.screen, gap: SPACING.sm, paddingBottom: SPACING.sm },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.pill,
    borderWidth: 1,
  },
  chipsRow: { paddingHorizontal: SPACING.screen, gap: SPACING.sm, paddingBottom: SPACING.md },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADII.pill,
    borderWidth: 1,
  },
  list: { paddingHorizontal: SPACING.screen, paddingBottom: SPACING.xxl, gap: SPACING.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.card,
    borderRadius: RADII.card,
    borderWidth: 1,
  },
  typeBadge: {
    width: 32,
    height: 32,
    borderRadius: RADII.tile,
    justifyContent: "center",
    alignItems: "center",
  },
  overdueBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADII.pill },
  retryBtn: { marginTop: SPACING.sm },
  loadMoreBtn: { alignItems: "center", padding: SPACING.md },
});
