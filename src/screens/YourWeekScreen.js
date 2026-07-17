/**
 * YourWeekScreen — the Weekly Digest ritual (ai_features/14, mockup 05).
 * Intentionally a DARK AI surface in both themes (§3.1): greeting, grounded
 * narrative, and "picked for you" events with Go actions.
 * (Kinlo Credits are omitted until a credits system exists — flagged gap.)
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { doc, getDoc } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db } from "../services/firebase";
import Icon from "../components/Icon";
import { getWeeklyDigest } from "../services/digestService";
import { TYPE, SPACING, RADII, BRAND, AI } from "../constants/theme-tokens";
import { formatDate } from "../utils/formatDate";

function PickRow({ pick, navigation }) {
  const { t } = useTranslation();
  const [ev, setEv] = useState(null);
  useEffect(() => {
    getDoc(doc(db, "events", pick.eventId))
      .then((s) => s.exists() && setEv(s.data()))
      .catch(() => {});
  }, [pick.eventId]);
  if (!ev) return null;
  const when = ev.date
    ? formatDate(new Date(ev.date), { weekday: "short", month: "short", day: "numeric" })
    : "";
  return (
    <View style={styles.pickRow}>
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.bodySemibold, { color: "#FFFFFF" }]} numberOfLines={1}>
          {ev.title}
        </Text>
        <Text style={[TYPE.caption, { color: AI.textOnDark }]}>{when}</Text>
      </View>
      <TouchableOpacity
        style={styles.goBtn}
        onPress={() => navigation.navigate("EventDetail", { eventId: pick.eventId })}
      >
        <Text style={[TYPE.label, { color: "#FFFFFF" }]}>
          {pick.cta === "remind" ? t("yourWeek.remindCta") : t("yourWeek.goCta")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function YourWeekScreen({ navigation }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ loading: true, data: null, needsPlus: false });

  useEffect(() => {
    getWeeklyDigest().then((res) =>
      setState({
        loading: false,
        data: res.ok ? res.data : null,
        needsPlus: res.needsPlus === true,
      })
    );
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: AI.bg }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={[TYPE.eyebrow, { color: AI.accent }]}>{t("yourWeek.headerEyebrow")}</Text>
        <View style={{ width: 26 }} />
      </View>

      {state.loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={AI.accent} />
      ) : !state.data ? (
        <View style={styles.emptyWrap}>
          <Icon name="ai" size={40} color={AI.accent} />
          <Text style={[TYPE.body, styles.emptyText, { color: AI.textOnDark }]}>
            {state.needsPlus
              ? t("yourWeek.needsPlusText")
              : t("yourWeek.emptyText")}
          </Text>
          {state.needsPlus && (
            <TouchableOpacity onPress={() => navigation.navigate("PlusPaywall", { from: "weekly_digest" })}>
              <LinearGradient
                colors={BRAND.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cta}
              >
                <Text style={[TYPE.label, { color: "#FFFFFF" }]}>{t("yourWeek.seeKinloPlus")}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[TYPE.display, { color: "#FFFFFF" }]}>{state.data.greeting}</Text>

          <LinearGradient
            colors={AI.panel}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.narrativeCard}
          >
            <Text style={[TYPE.body, { color: AI.textOnDark }]}>{state.data.narrative}</Text>
          </LinearGradient>

          {(state.data.picks || []).length > 0 && (
            <View style={styles.picks}>
              <Text style={[TYPE.eyebrow, { color: AI.accent }]}>{t("yourWeek.pickedForYou")}</Text>
              {state.data.picks.map((p) => (
                <PickRow key={p.eventId} pick={p} navigation={navigation} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.screen,
    paddingTop: 60,
    paddingBottom: SPACING.md,
  },
  content: { padding: SPACING.screen, gap: SPACING.lg, paddingBottom: SPACING.xxxl },
  narrativeCard: { borderRadius: RADII.cardLg, padding: SPACING.card },
  picks: { gap: SPACING.md },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: RADII.card,
    padding: SPACING.card,
  },
  goBtn: {
    backgroundColor: "rgba(199,146,234,0.25)",
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.lg,
    paddingHorizontal: SPACING.xxxl,
  },
  emptyText: { textAlign: "center" },
  cta: {
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
});
