/**
 * A2 — Consent. Four plain-language points the attendee must accept before a
 * match profile is created. Accepting proceeds to the profile (A3), where the
 * consent timestamp is recorded.
 */
import React from "react";
import Icon from "../../components/Icon";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { MatchHeader, PrimaryButton, SecondaryButton } from "./matchUi";

export default function MatchConsentScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { eventId, eventTitle } = route.params || {};
  const POINTS = [
    { icon: "hide", title: t("matching.consent.point1Title"), body: t("matching.consent.point1Body") },
    { icon: "lock", title: t("matching.consent.point2Title"), body: t("matching.consent.point2Body") },
    { icon: "privacy", title: t("matching.consent.point3Title"), body: t("matching.consent.point3Body") },
    { icon: "report", title: t("matching.consent.point4Title"), body: t("matching.consent.point4Body") },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={t("matching.consent.beforeYouJoin")} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.lead, { color: colors.textSecondary }]}>
          {t("matching.consent.lead")}
        </Text>
        {POINTS.map(({ icon, title, body }) => (
          <View key={title} style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}>
              <Icon name={icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.rowBody, { color: colors.textSecondary }]}>
                {body}
              </Text>
            </View>
          </View>
        ))}
        <Text style={[styles.legal, { color: colors.textTertiary }]}>
          {t("matching.consent.legal")}
        </Text>
      </ScrollView>
      <View style={styles.actions}>
        <PrimaryButton
          label={t("matching.consent.agree")}
          onPress={() =>
            navigation.replace("MatchProfile", { eventId, eventTitle })
          }
        />
        <SecondaryButton label={t("matching.consent.notNow")} onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  lead: { fontSize: 15, lineHeight: 21, marginBottom: 20 },
  row: { flexDirection: "row", marginBottom: 20, gap: 14 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 16, fontWeight: "700", marginBottom: 3 },
  rowBody: { fontSize: 13.5, lineHeight: 19 },
  legal: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  actions: { paddingHorizontal: 24, paddingBottom: 28, gap: 6 },
});
