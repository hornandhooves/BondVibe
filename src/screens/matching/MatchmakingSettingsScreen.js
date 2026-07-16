/**
 * Matchmaking settings (P4) — the one place to control v2 participation:
 *   • Participate (master switch; off = paused, profile kept)
 *   • Cross-community discovery (opt-in; default = only shared communities)
 *   • Kinlo Plus / free-week status (the paid unlock after the trial)
 *   • "Stopped suggesting" list (matchExclusions — NOT blocks)
 *   • Turn off & delete match profile (destructive: leaveMatchmaking)
 *
 * The score/gate are server-truth; this screen only flips the user's own flags.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import Icon from "../../components/Icon";
import { MatchHeader } from "./matchUi";
import { useSubscriptions } from "../../hooks/useEntitlement";
import { toMillis } from "../../utils/curatedGate";
import {
  getMatchmaking,
  setMatchmakingEnabled,
  setCrossCommunity,
  leaveMatchmaking,
} from "../../services/matchingService";
import { getExclusions, clearExclusions } from "../../services/curatedService";

export default function MatchmakingSettingsScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isPlus } = useSubscriptions();
  const [mm, setMm] = useState(null);
  const [excluded, setExcluded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, ex] = await Promise.all([getMatchmaking(), getExclusions()]);
    setMm(m || {});
    setExcluded(ex.length);
    setLoading(false);
  }, []);
  React.useEffect(() => navigation.addListener("focus", load), [navigation, load]);

  const wrap = async (fn) => {
    setSaving(true);
    try {
      await fn();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const s = createStyles(colors);
  const consented = mm && mm.consentAt != null;
  const enabled = mm?.enabled !== false;
  const crossCommunity = mm?.crossCommunity === true;
  const trialEndsMs = toMillis(mm?.freeTrialEndsAt);
  const now = Date.now();
  const daysLeft = trialEndsMs ? Math.ceil((trialEndsMs - now) / 86400000) : null;

  const planLine = isPlus
    ? t("matchmaking.settings.plusActive")
    : daysLeft != null && daysLeft > 0
      ? t("matchmaking.settings.trialLeft", { count: daysLeft })
      : t("matchmaking.settings.trialOver");

  const confirmLeave = () =>
    Alert.alert(
      t("matchmaking.settings.disableTitle"),
      t("matchmaking.settings.disableMsg"),
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("matchmaking.settings.disableConfirm"),
          style: "destructive",
          onPress: () => wrap(async () => { await leaveMatchmaking(); navigation.goBack(); }),
        },
      ]
    );

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <MatchHeader title={t("matchmaking.settings.title")} onBack={() => navigation.goBack()} />
        <ActivityIndicator style={{ marginTop: 48 }} color="#7C3AED" />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={t("matchmaking.settings.title")} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {!consented ? (
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.rowTitle, { color: colors.text }]}>{t("matchmaking.settings.notInTitle")}</Text>
            <Text style={[s.rowSub, { color: colors.textSecondary }]}>{t("matchmaking.settings.notInBody")}</Text>
            <TouchableOpacity style={s.cta} onPress={() => navigation.navigate("MatchConsent", {})}>
              <Text style={s.ctaText}>{t("matchmaking.curated.setUp")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Participate + cross-community */}
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ToggleRow
                title={t("matchmaking.settings.participate")}
                sub={enabled ? t("matchmaking.settings.participateOn") : t("matchmaking.settings.participateOff")}
                value={enabled}
                disabled={saving}
                onChange={(v) => wrap(() => setMatchmakingEnabled(v))}
                colors={colors}
              />
              <ToggleRow
                title={t("matchmaking.settings.crossCommunity")}
                sub={t("matchmaking.settings.crossCommunitySub")}
                value={crossCommunity}
                disabled={saving || !enabled}
                onChange={(v) => wrap(() => setCrossCommunity(v))}
                colors={colors}
                last
              />
            </View>

            {/* Plus / trial */}
            <TouchableOpacity
              style={[s.card, s.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              activeOpacity={isPlus ? 1 : 0.8}
              onPress={() => !isPlus && navigation.navigate("PlusPaywall", { source: "settings" })}
            >
              <View style={s.planIcon}>
                <Icon name={isPlus ? "star" : "lock"} size={20} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { color: colors.text }]}>{t("matchmaking.settings.membership")}</Text>
                <Text style={[s.rowSub, { color: colors.textSecondary }]}>{planLine}</Text>
              </View>
              {!isPlus && <Icon name="forward" size={20} color={colors.textTertiary} />}
            </TouchableOpacity>

            {/* Discover */}
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <LinkRow title={t("matchmaking.curated.title")} onPress={() => navigation.navigate("CuratedSet")} colors={colors} />
              <LinkRow title={t("matchmaking.groups.title")} onPress={() => navigation.navigate("MatchGroups")} colors={colors} last />
            </View>

            {/* Stopped suggesting */}
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: colors.text }]}>{t("matchmaking.settings.excluded")}</Text>
                  <Text style={[s.rowSub, { color: colors.textSecondary }]}>
                    {t("matchmaking.settings.excludedCount", { count: excluded })}
                  </Text>
                </View>
                {excluded > 0 && (
                  <TouchableOpacity onPress={() => wrap(clearExclusions)} disabled={saving}>
                    <Text style={[s.action, { color: "#7C3AED" }]}>{t("matchmaking.settings.clear")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Danger */}
            <TouchableOpacity style={s.danger} onPress={confirmLeave} disabled={saving}>
              <Text style={s.dangerText}>{t("matchmaking.settings.disable")}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ToggleRow({ title, sub, value, onChange, disabled, colors, last }) {
  const s = createStyles(colors);
  return (
    <View style={[s.row, !last && s.rowDivider, { borderColor: colors.border }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[s.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[s.rowSub, { color: colors.textSecondary }]}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: "#7C3AED" }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function LinkRow({ title, onPress, colors, last }) {
  const s = createStyles(colors);
  return (
    <TouchableOpacity style={[s.row, !last && s.rowDivider, { borderColor: colors.border }]} onPress={onPress}>
      <Text style={[s.rowTitle, { color: colors.text, flex: 1 }]}>{title}</Text>
      <Icon name="forward" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, marginBottom: 14 },
    planCard: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
    planIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EDE4FC", alignItems: "center", justifyContent: "center" },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 15 },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
    rowTitle: { fontFamily: FONTS.bodyBold, fontSize: 15 },
    rowSub: { fontFamily: FONTS.bodyMedium, fontSize: 12.5, lineHeight: 17, marginTop: 3 },
    action: { fontFamily: FONTS.bodyBold, fontSize: 13.5 },
    cta: { marginTop: 14, marginBottom: 4, height: 46, borderRadius: 23, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
    ctaText: { fontFamily: FONTS.bodyBold, fontSize: 15, color: "#fff" },
    danger: { alignItems: "center", paddingVertical: 16, marginTop: 4 },
    dangerText: { fontFamily: FONTS.bodyBold, fontSize: 14.5, color: "#E4483B" },
  });
}
