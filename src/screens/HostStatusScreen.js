import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { FONTS } from "../constants/theme-tokens";
import Icon from "../components/Icon";

/**
 * "Your host status" — the paid host's review state, made visible.
 *
 * The wait itself isn't the problem; the silence was. A paid application used to
 * disappear into an admin queue with no acknowledgement and no estimate, so the
 * only way to find out was to keep opening the app.
 *
 * What's actually under review is MONEY, not hosting: free events, community and
 * members work from the moment they chose paid. The screen leads with that, so
 * the wait doesn't read as "you can't start yet".
 *
 * Live, not a snapshot: it subscribes to the user doc, so an admin approving
 * moves the timeline and swaps in the payouts CTA without a relaunch.
 */
export default function HostStatusScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      setError(true);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        setUser(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (e) => {
        console.warn("host status listener failed:", e?.message);
        setError(true);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // Applied is always done (they're here). Review is the admin's hostApproved
  // flag. Payouts only opens once review clears — it's what review gates.
  const approved = user?.hostApproved === true;
  const payoutsDone = user?.hostConfig?.canCreatePaidEvents === true;
  const step = payoutsDone ? 2 : approved ? 2 : 1;

  const steps = [
    { key: "applied", state: "done" },
    { key: "reviewing", state: approved ? "done" : "current" },
    {
      key: "payouts",
      state: payoutsDone ? "done" : approved ? "current" : "todo",
    },
  ];

  const dismiss = async () => {
    try {
      // A UI bookmark, not state the server cares about — and hostConfig is
      // server-owned now, so it lives at the top level where rules allow it.
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        hostWelcomeSeen: true,
      });
    } catch (e) {
      console.warn("hostWelcomeSeen not saved:", e?.message);
    }
    navigation.replace("MainTabs", { screen: "HomeTab" });
  };

  const s = createStyles(colors);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.header, { color: colors.text }]}>{t("hostStatus.header")}</Text>

        {/* Status card */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.cardHead}>
            <View style={[s.cardIcon, { backgroundColor: colors.warnSoft }]}>
              <Icon name={approved ? "check" : "clock"} size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: colors.text }]}>
                {approved ? t("hostStatus.approvedTitle") : t("hostStatus.reviewTitle")}
              </Text>
              <Text style={[s.cardMeta, { color: colors.warning }]}>
                {loading
                  ? t("hostStatus.loading")
                  : error
                  ? t("hostStatus.statusUnavailable")
                  : approved
                  ? t("hostStatus.approvedMeta")
                  : t("hostStatus.reviewMeta")}
              </Text>
            </View>
          </View>

          {/* Timeline: Applied → Reviewing → Payouts */}
          <View style={s.timeline}>
            {steps.map((st, i) => (
              <React.Fragment key={st.key}>
                <View style={s.node}>
                  <View
                    style={[
                      s.dot,
                      st.state === "done" && { backgroundColor: colors.success },
                      st.state === "current" && {
                        backgroundColor: colors.warning,
                        borderWidth: 3,
                        borderColor: colors.warnSoft,
                      },
                      st.state === "todo" && { backgroundColor: colors.border },
                    ]}
                  >
                    {st.state === "done" && (
                      <Icon name="check" size={11} color={colors.onPrimary} />
                    )}
                  </View>
                  <Text
                    style={[
                      s.nodeLabel,
                      {
                        color:
                          st.state === "todo" ? colors.textTertiary : colors.text,
                        fontFamily:
                          st.state === "current" ? FONTS.bodyBold : FONTS.bodyMedium,
                      },
                    ]}
                  >
                    {t(`hostStatus.step.${st.key}`)}
                  </Text>
                </View>
                {i < steps.length - 1 && (
                  <View
                    style={[
                      s.connector,
                      {
                        backgroundColor:
                          steps[i].state === "done" ? colors.success : colors.border,
                      },
                    ]}
                  />
                )}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* The point: hosting already works. */}
        <View style={[s.meanwhile, { backgroundColor: colors.successBg }]}>
          <Icon name="check" size={16} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={[s.meanwhileTitle, { color: colors.success }]}>
              {t("hostStatus.meanwhileTitle")}
            </Text>
            <Text style={[s.meanwhileBody, { color: colors.success }]}>
              {t("hostStatus.meanwhileBody")}
            </Text>
          </View>
        </View>

        <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
          {t("hostStatus.whatsNext")}
        </Text>
        {["next1", "next2", "next3"].map((k, i) => (
          <View key={k} style={s.nextRow}>
            <Text style={[s.nextNum, { color: colors.primary }]}>{i + 1}</Text>
            <Text style={[s.nextText, { color: colors.text }]}>
              {t(`hostStatus.${k}`)}
            </Text>
          </View>
        ))}

        {/* Payouts only becomes actionable once review clears — offering it
            earlier would send them into Stripe for an account we can't enable. */}
        {approved && !payoutsDone && (
          <TouchableOpacity
            onPress={() => navigation.navigate("StripeConnect")}
            activeOpacity={0.9}
            style={[s.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={[s.ctaText, { color: colors.onPrimary }]}>
              {t("hostStatus.connectPayouts")}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={dismiss}
          activeOpacity={0.85}
          style={[s.secondary, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Text style={[s.secondaryText, { color: colors.text }]}>
            {t("hostStatus.exploreMeanwhile")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 20 },
    header: {
      fontFamily: FONTS.display,
      fontSize: 24,
      letterSpacing: -0.5,
      marginBottom: 20,
    },
    // Flat card: 1px border, no shadow (design system §3).
    card: { borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 14 },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    cardIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    cardTitle: { fontFamily: FONTS.display, fontSize: 16.5, letterSpacing: -0.3 },
    cardMeta: { fontFamily: FONTS.bodySemibold, fontSize: 12.5, marginTop: 2 },
    timeline: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginTop: 20,
      paddingHorizontal: 4,
    },
    node: { alignItems: "center", width: 74 },
    dot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    nodeLabel: { fontSize: 11.5, marginTop: 7, textAlign: "center" },
    connector: { flex: 1, height: 2, marginTop: 10 },
    meanwhile: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      borderRadius: 14,
      padding: 14,
      marginBottom: 24,
    },
    meanwhileTitle: { fontFamily: FONTS.bodyBold, fontSize: 13.5, marginBottom: 3 },
    meanwhileBody: { fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 18 },
    sectionLabel: {
      fontFamily: FONTS.bodyBold,
      fontSize: 11.5,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      marginBottom: 12,
    },
    nextRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
    nextNum: { fontFamily: FONTS.display, fontSize: 13, width: 14 },
    nextText: { fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 19, flex: 1 },
    cta: {
      borderRadius: 27,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 12,
    },
    ctaText: { fontFamily: FONTS.bodyExtra, fontSize: 16, letterSpacing: 0.2 },
    secondary: {
      borderWidth: 1,
      borderRadius: 27,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 12,
    },
    secondaryText: { fontFamily: FONTS.bodySemibold, fontSize: 15 },
  });
}
