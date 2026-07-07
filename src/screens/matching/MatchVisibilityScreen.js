/**
 * D4 — Visibility & safety. Change who can see you, delete your matching data,
 * or leave matching for this event entirely.
 */
import React, { useState, useEffect } from "react";
import Icon from "../../components/Icon";
import { View, Text, StyleSheet, Alert, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { MatchHeader } from "./matchUi";
import {
  VISIBILITY_OPTIONS,
  getMyMatchProfile,
  updateMatchVisibility,
  leaveMatching,
} from "../../services/matchingService";

export default function MatchVisibilityScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { eventId } = route.params || {};
  const VIS_LABELS = {
    everyone: t("matching.visibility.everyone"),
    same_gender: t("matching.visibility.sameGender"),
    opposite_gender: t("matching.visibility.oppositeGender"),
    organizer: t("matching.visibility.organizerOnly"),
    hidden: t("matching.visibility.hidden"),
  };
  const [visibility, setVisibility] = useState("everyone");

  useEffect(() => {
    (async () => {
      const p = await getMyMatchProfile(eventId);
      if (p?.visibility) setVisibility(p.visibility);
    })();
  }, [eventId]);

  const choose = async (v) => {
    setVisibility(v);
    await updateMatchVisibility(eventId, { visibility: v });
  };

  const confirmLeave = () =>
    Alert.alert(
      t("matching.visibility.confirmTitle"),
      t("matching.visibility.confirmMsg"),
      [
        { text: t("matching.visibility.cancel"), style: "cancel" },
        {
          text: t("matching.visibility.leaveAndDelete"),
          style: "destructive",
          onPress: async () => {
            await leaveMatching(eventId);
            navigation.popToTop();
          },
        },
      ]
    );

  const styles = createStyles(colors);
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={t("matching.visibility.title")} onBack={() => navigation.goBack()} />
      <Text style={[styles.section, { color: colors.text }]}>{t("matching.visibility.whoCanSee")}</Text>
      {VISIBILITY_OPTIONS.map((v) => (
        <TouchableOpacity key={v} style={styles.row} onPress={() => choose(v)}>
          <Text style={[styles.rowText, { color: colors.text }]}>{VIS_LABELS[v]}</Text>
          {visibility === v && <Icon name="check" size={20} color={colors.primary} />}
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.danger} onPress={confirmLeave}>
        <Text style={[styles.dangerText, { color: colors.error || "#c25b5b" }]}>
          {t("matching.visibility.deleteAndLeave")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    section: { fontSize: 15, fontWeight: "700", paddingHorizontal: 24, marginBottom: 8, marginTop: 4 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowText: { fontSize: 15.5 },
    danger: { paddingHorizontal: 24, paddingVertical: 24, marginTop: 12 },
    dangerText: { fontSize: 15, fontWeight: "700" },
  });
}
