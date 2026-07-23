/**
 * Admin — Payouts (escrow ledger). feat/admin-payouts-ui.
 * HANDOFF_diseno2_payouts.md · docs/DISENO_escrow_pagos.md.
 *
 * Reads/acts ONLY through the live admin callables (adminListPayouts /
 * adminReleasePayout / adminRefundPayout) — the paymentLedger is deny-all to
 * clients. The screen is admin-gated here as defense-in-depth; the real gate is
 * server-side in every callable. Money actions (Release / Refund) are
 * irreversible → explicit confirmation before each.
 *
 * a11y: secondary text uses the theme token (colors.textSecondary, AA) rather
 * than the old #9A94A6; state pills carry a readable size + tint.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, StyleSheet, SafeAreaView, TextInput,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";
import Icon from "../components/Icon";
import { formatCentavos } from "../utils/pricing";
import useUserRole from "../hooks/useUserRole";
import { listPayouts, releasePayout, refundPayout, setFrozen } from "../services/adminPayoutsService";
import { getRetentionHours, setRetentionHours, DEFAULT_RETENTION_HOURS } from "../services/payoutSettingsService";

const STATES = ["held", "released", "refunded", "reversed"];
const TYPES = ["event", "rental", "service", "tip", "membership", "gift"];
const TYPE_ICON = {
  event: "calendar", rental: "bike", service: "star", tip: "dollar",
  membership: "ticket", promotion: "star", gift: "gift",
};

const mapErr = (code, t) => {
  const s = `${code || ""}`;
  if (/payout_frozen/.test(s)) return t("adminPayouts.errFrozen");
  if (/not_releasable/.test(s)) return t("adminPayouts.errNotReleasable");
  if (/refund_failed/.test(s)) return t("adminPayouts.errRefundFailed");
  if (/not-found|not_found|Ledger not found/.test(s)) return t("adminPayouts.errNotFound");
  return t("adminPayouts.errGeneric");
};

export default function AdminPayoutsScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { role, loading: roleLoading } = useUserRole();
  const isAdmin = role === "admin";

  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [statusF, setStatusF] = useState(null); // ledger state filter
  const [typeF, setTypeF] = useState(null);
  const [busyId, setBusyId] = useState(null); // paymentIntentId being acted on

  const load = useCallback(async (reset = true) => {
    if (reset) { setLoading(true); setError(false); }
    try {
      const data = await listPayouts({
        status: statusF, type: typeF, cursor: reset ? null : cursor, limit: 25,
      });
      setRows((prev) => (reset ? data.payouts : [...prev, ...data.payouts]));
      setCursor(data.nextCursor || null);
    } catch (e) {
      if (reset) setError(true);
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [statusF, typeF, cursor]);

  useEffect(() => {
    if (isAdmin) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, statusF, typeF]);

  const doAction = (row, kind) => {
    const amount = formatCentavos(kind === "release" ? row.hostAmount : row.grossAmount);
    Alert.alert(
      t(kind === "release" ? "adminPayouts.releaseTitle" : "adminPayouts.refundTitle"),
      t(kind === "release" ? "adminPayouts.releaseBody" : "adminPayouts.refundBody", { amount }),
      [
        { text: t("adminPayouts.cancel"), style: "cancel" },
        {
          text: t(kind === "release" ? "adminPayouts.releaseYes" : "adminPayouts.refundYes"),
          style: "destructive",
          onPress: async () => {
            setBusyId(row.paymentIntentId);
            try {
              if (kind === "release") await releasePayout(row.paymentIntentId);
              else await refundPayout(row.paymentIntentId);
              Alert.alert(t(kind === "release" ? "adminPayouts.releasedOk" : "adminPayouts.refundedOk"));
              await load(true);
            } catch (e) {
              Alert.alert(t("adminPayouts.title"), mapErr(e?.message, t));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const doFreeze = (row) => {
    const freeze = !row.frozen;
    Alert.alert(
      t(freeze ? "adminPayouts.freezeTitle" : "adminPayouts.unfreezeTitle"),
      t(freeze ? "adminPayouts.freezeBody" : "adminPayouts.unfreezeBody"),
      [
        { text: t("adminPayouts.cancel"), style: "cancel" },
        {
          text: t(freeze ? "adminPayouts.freezeYes" : "adminPayouts.unfreezeYes"),
          onPress: async () => {
            setBusyId(row.paymentIntentId);
            try {
              await setFrozen(row.paymentIntentId, freeze);
              Alert.alert(t(freeze ? "adminPayouts.frozeOk" : "adminPayouts.unfrozeOk"));
              await load(true);
            } catch (e) {
              Alert.alert(t("adminPayouts.title"), mapErr(e?.message, t));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  if (!roleLoading && !isAdmin) {
    return (
      <SafeAreaView style={[st.fill, st.center, { backgroundColor: colors.background }]}>
        <Icon name="lock" size={28} color={colors.textTertiary} />
        <Text style={[TYPE.body, { color: colors.textSecondary, marginTop: 8 }]}>
          {t("adminPayouts.notAdmin")}
        </Text>
      </SafeAreaView>
    );
  }

  const Chip = ({ active, label, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[st.chip, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}
      accessibilityRole="button" accessibilityState={{ selected: active }}
    >
      <Text style={[TYPE.caption, { color: active ? colors.onPrimary : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );

  const stateTint = (state, frozen) => {
    if (frozen) return colors.warning;
    return { held: colors.warning, released: colors.success, refunded: colors.textSecondary, reversed: colors.error }[state] || colors.textSecondary;
  };

  return (
    <SafeAreaView style={[st.fill, { backgroundColor: colors.background }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} accessibilityLabel="Back">
          <Icon name="back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: SPACING.md }}>
          <Text style={[TYPE.title, { color: colors.text }]}>{t("adminPayouts.title")}</Text>
          <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{t("adminPayouts.subtitle")}</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={st.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
          <Chip active={!statusF} label={t("adminPayouts.all")} onPress={() => setStatusF(null)} />
          {STATES.map((s) => (
            <Chip key={s} active={statusF === s} label={t(`adminPayouts.state.${s}`)} onPress={() => setStatusF(statusF === s ? null : s)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
          <Chip active={!typeF} label={t("adminPayouts.all")} onPress={() => setTypeF(null)} />
          {TYPES.map((ty) => (
            <Chip key={ty} active={typeF === ty} label={t(`adminPayouts.type.${ty}`)} onPress={() => setTypeF(typeF === ty ? null : ty)} />
          ))}
        </ScrollView>
      </View>

      <RetentionCard t={t} colors={colors} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      ) : error ? (
        <View style={[st.center, { marginTop: 60 }]}>
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>{t("adminPayouts.loadError")}</Text>
          <TouchableOpacity onPress={() => load(true)} style={{ marginTop: 10 }}>
            <Text style={[TYPE.bodySemibold, { color: colors.primary }]}>{t("adminPayouts.loadMore")}</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <View style={[st.center, { marginTop: 60 }]}>
          <Text style={[TYPE.body, { color: colors.textSecondary }]}>{t("adminPayouts.empty")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.body}>
          {rows.map((r) => {
            const tint = stateTint(r.state, r.frozen);
            const canRelease = r.state === "held" && !r.frozen;
            const canRefund = r.state === "held" || r.state === "released";
            const showFreeze = r.state === "held" && !r.frozen;
            const showUnfreeze = r.frozen === true;
            const busy = busyId === r.paymentIntentId;
            return (
              <View key={r.paymentIntentId} style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={st.cardTop}>
                  {/* Type row (B3) */}
                  <View style={st.typeRow}>
                    <Icon name={TYPE_ICON[r.type] || "dollar"} size={15} color={colors.primary} />
                    <Text style={[TYPE.label, { color: colors.text, marginLeft: 6 }]}>
                      {t(`adminPayouts.type.${r.type}`, r.type || "")}
                    </Text>
                  </View>
                  <View style={[st.pill, { backgroundColor: tint + "22" }]}>
                    <Text style={[st.pillText, { color: tint }]}>
                      {r.frozen ? t("adminPayouts.state.frozen") : t(`adminPayouts.state.${r.state}`, r.state || "")}
                    </Text>
                  </View>
                </View>

                <View style={st.amounts}>
                  <Amount label={t("adminPayouts.gross")} value={formatCentavos(r.grossAmount)} colors={colors} />
                  <Amount label={t("adminPayouts.hostGets")} value={formatCentavos(r.hostAmount)} colors={colors} />
                  {r.hostDebtOwed > 0 && (
                    <Amount label={t("adminPayouts.debt")} value={formatCentavos(r.hostDebtOwed)} colors={colors} tone={colors.error} />
                  )}
                </View>
                <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
                  {t("adminPayouts.releasesOn")}: {r.releaseAt ? new Date(r.releaseAt).toLocaleDateString() : t("adminPayouts.onHold")}
                </Text>

                {(canRelease || canRefund || showFreeze || showUnfreeze) && (
                  <View style={st.actions}>
                    {canRelease && (
                      <TouchableOpacity
                        style={[st.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
                        onPress={() => doAction(r, "release")} disabled={busy}
                        accessibilityRole="button">
                        <Text style={[TYPE.label, { color: colors.onPrimary }]}>
                          {busy ? t("adminPayouts.releasing") : t("adminPayouts.release")}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {canRefund && (
                      <TouchableOpacity
                        style={[st.btn, st.btnGhost, { borderColor: colors.error, opacity: busy ? 0.6 : 1 }]}
                        onPress={() => doAction(r, "refund")} disabled={busy}
                        accessibilityRole="button">
                        <Text style={[TYPE.label, { color: colors.error }]}>
                          {busy ? t("adminPayouts.refunding") : t("adminPayouts.refund")}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {(showFreeze || showUnfreeze) && (
                      <TouchableOpacity
                        style={[st.btn, st.btnGhost, { borderColor: colors.warning, opacity: busy ? 0.6 : 1 }]}
                        onPress={() => doFreeze(r)} disabled={busy}
                        accessibilityRole="button">
                        <Text style={[TYPE.label, { color: colors.warning }]}>
                          {showUnfreeze ? t("adminPayouts.unfreeze") : t("adminPayouts.freeze")}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {cursor && (
            <TouchableOpacity
              style={[st.loadMore, { borderColor: colors.border }]}
              onPress={() => { setLoadingMore(true); load(false); }}
              disabled={loadingMore}
              accessibilityRole="button">
              {loadingMore
                ? <ActivityIndicator color={colors.primary} />
                : <Text style={[TYPE.bodySemibold, { color: colors.primary }]}>{t("adminPayouts.loadMore")}</Text>}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function RetentionCard({ t, colors }) {
  const [hours, setHours] = useState(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRetention = useCallback(async () => {
    try { setHours(await getRetentionHours()); } catch (_e) { setHours("err"); }
  }, []);
  useEffect(() => { loadRetention(); }, [loadRetention]);

  const startEdit = () => {
    setInput(String(typeof hours === "number" ? hours : DEFAULT_RETENTION_HOURS));
    setEditing(true);
  };

  const save = async () => {
    const n = Number(input);
    if (!Number.isFinite(n) || n < 0) {
      Alert.alert(t("adminPayouts.retentionTitle"), t("adminPayouts.retentionInvalid"));
      return;
    }
    setSaving(true);
    try {
      const saved = await setRetentionHours(n);
      setHours(saved);
      setEditing(false);
      Alert.alert(t("adminPayouts.retentionSavedOk"));
    } catch (_e) {
      Alert.alert(t("adminPayouts.retentionTitle"), t("adminPayouts.retentionSaveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[st.retCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={st.retTop}>
        <View style={{ flex: 1, paddingRight: SPACING.md }}>
          <Text style={[TYPE.label, { color: colors.text }]}>{t("adminPayouts.retentionTitle")}</Text>
          <Text style={[TYPE.caption, { color: colors.textSecondary, marginTop: 2 }]}>
            {hours === "err"
              ? t("adminPayouts.retentionLoadError")
              : hours === null
                ? t("adminPayouts.retentionLoading")
                : t("adminPayouts.retentionCurrent", { hours })}
          </Text>
        </View>
        {!editing && typeof hours === "number" && (
          <TouchableOpacity onPress={startEdit} accessibilityRole="button">
            <Text style={[TYPE.label, { color: colors.primary }]}>{t("adminPayouts.retentionEdit")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {editing && (
        <View style={{ marginTop: SPACING.sm }}>
          <View style={st.retEditRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              keyboardType="decimal-pad"
              editable={!saving}
              style={[st.retInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              accessibilityLabel={t("adminPayouts.retentionLabel")}
              placeholder={t("adminPayouts.retentionLabel")}
              placeholderTextColor={colors.textTertiary}
            />
            <TouchableOpacity
              style={[st.btn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1, flex: 0, paddingHorizontal: SPACING.lg }]}
              onPress={save} disabled={saving} accessibilityRole="button">
              <Text style={[TYPE.label, { color: colors.onPrimary }]}>
                {saving ? t("adminPayouts.retentionSaving") : t("adminPayouts.retentionSave")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.btn, st.btnGhost, { borderColor: colors.border, flex: 0, paddingHorizontal: SPACING.md }]}
              onPress={() => setEditing(false)} disabled={saving} accessibilityRole="button">
              <Text style={[TYPE.label, { color: colors.textSecondary }]}>{t("adminPayouts.cancel")}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[TYPE.caption, { color: colors.warning, marginTop: SPACING.sm }]}>
            {t("adminPayouts.retentionRisk")}
          </Text>
        </View>
      )}
    </View>
  );
}

const Amount = ({ label, value, colors, tone }) => (
  <View style={{ marginRight: SPACING.xl }}>
    <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[TYPE.bodySemibold, { color: tone || colors.text }]}>{value}</Text>
  </View>
);

const st = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.screen, paddingVertical: SPACING.md },
  filters: { paddingBottom: SPACING.sm },
  filterRow: { paddingHorizontal: SPACING.screen, gap: SPACING.sm, paddingVertical: SPACING.xs },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADII.pill, borderWidth: 1 },
  body: { paddingHorizontal: SPACING.screen, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: RADII.card, padding: SPACING.lg, marginBottom: SPACING.md },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeRow: { flexDirection: "row", alignItems: "center" },
  pill: { paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADII.pill },
  pillText: { fontFamily: TYPE.label.fontFamily, fontSize: 12, letterSpacing: 0.3 },
  amounts: { flexDirection: "row", flexWrap: "wrap", marginTop: SPACING.md, marginBottom: SPACING.xs },
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  btn: { flex: 1, borderRadius: RADII.pill, paddingVertical: SPACING.sm, alignItems: "center" },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1 },
  loadMore: { borderWidth: 1, borderRadius: RADII.pill, paddingVertical: SPACING.md, alignItems: "center", marginTop: SPACING.sm },
  retCard: { borderWidth: 1, borderRadius: RADII.card, padding: SPACING.lg, marginHorizontal: SPACING.screen, marginBottom: SPACING.md },
  retTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  retEditRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  retInput: { flex: 1, borderWidth: 1, borderRadius: RADII.pill, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: 15 },
});
