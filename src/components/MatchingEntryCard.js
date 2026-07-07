/**
 * MatchingEntryCard — the Community Matching entry point on an event.
 *
 * Implements the §3 gating: it shows the right state and CTA and hides the grid
 * until the window opens (B2 locked → countdown; open → grid; closed → people
 * you met). Hosts get a manage/upsell entry. Destination screens (A1–E4) are
 * registered in Block 2.4; this card only decides what to surface.
 */
import React from "react";
import Icon from "./Icon";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { usePremium } from "../hooks/usePremium";
import { useMatchingWindow } from "../hooks/useMatchingWindow";
import { MATCH_TYPE_COLORS } from "../services/matchingService";

function formatCountdown(ms, t) {
  if (ms <= 0) return t("matchingEntryCard.now");
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

export default function MatchingEntryCard({ event, isHost }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { isPremium } = usePremium();
  const { state, msUntilOpen, isOpen, isLocked, isClosed, enabled } =
    useMatchingWindow(event);
  const styles = createStyles(colors);
  const eventId = event?.id;

  // Not set up yet: only the host sees an entry (to add it / upsell to Pro).
  if (!enabled) {
    if (!isHost) return null;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() =>
          navigation.navigate(
            isPremium ? "HostMatchingControls" : "ProUpsell",
            { eventId }
          )
        }
      >
        <View style={styles.iconWrap}>
          <Icon name="ai" size={22} color={colors.primary} />
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t("matchingEntryCard.addTitle")}</Text>
            {!isPremium && (
              <View style={styles.proBadge}>
                <Icon name="pro" size={11} color="#fff" />
                <Text style={styles.proText}>{t("matchingEntryCard.proBadge")}</Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>
            {t("matchingEntryCard.addSubtitle")}
          </Text>
        </View>
        <Icon name="forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  }

  // Enabled — pick copy + destination by window state.
  const meta = isLocked
    ? {
        icon: <Icon name="lock" size={22} color={colors.primary} />,
        title: t("matchingEntryCard.lockedTitle"),
        subtitle: t("matchingEntryCard.lockedSubtitle", {
          countdown: formatCountdown(msUntilOpen, t),
        }),
        route: "MatchingLocked",
      }
    : isOpen
    ? {
        icon: <Icon name="users" size={22} color={colors.primary} />,
        title: t("matchingEntryCard.openTitle"),
        subtitle: t("matchingEntryCard.openSubtitle"),
        route: "MatchGrid",
      }
    : {
        icon: <Icon name="users" size={22} color={colors.textSecondary} />,
        title: t("matchingEntryCard.closedTitle"),
        subtitle: t("matchingEntryCard.closedSubtitle"),
        route: "PeopleYouMet",
      };

  const types = Array.isArray(event?.matching?.types) ? event.matching.types : [];

  return (
    <View>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate(meta.route, { eventId })}
      >
        <View style={styles.iconWrap}>{meta.icon}</View>
        <View style={styles.body}>
          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.subtitle}>{meta.subtitle}</Text>
          {types.length > 0 && (
            <View style={styles.chipsRow}>
              {types.map((matchType) => {
                const c = MATCH_TYPE_COLORS[matchType] || {
                  fg: colors.primary,
                  bg: colors.surfaceGlass,
                };
                return (
                  <View key={matchType} style={[styles.chip, { backgroundColor: c.bg }]}>
                    <Text style={[styles.chipText, { color: c.fg }]}>{matchType}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
        <Icon name="forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>

      {isHost && (
        <TouchableOpacity
          style={styles.manageRow}
          onPress={() =>
            navigation.navigate("HostMatchingControls", { eventId })
          }
        >
          <Text style={[styles.manageText, { color: colors.primary }]}>
            {t("matchingEntryCard.manage")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.primary}15`,
      marginRight: 14,
    },
    body: { flex: 1 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { fontSize: 16, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
    chip: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    chipText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
    proBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    proText: { color: "#fff", fontSize: 11, fontWeight: "800" },
    manageRow: { paddingVertical: 10, alignItems: "center" },
    manageText: { fontSize: 14, fontWeight: "600" },
  });
}
