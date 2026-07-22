/**
 * Home birthday reminder (social gifting Board 2a). Shows people you follow whose
 * SHARED birthday (day+month, consented) is coming up, with a "Gift them an event"
 * CTA that opens the gifting flow. Renders nothing when there's nobody to show —
 * so it's safe to drop unconditionally into Home.
 */
import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";
import Icon from "./Icon";
import { getUpcomingBirthdays } from "../services/giftService";

const daysLabel = (t, n) =>
  n === 0 ? t("gifting.reminder.today")
    : n === 1 ? t("gifting.reminder.tomorrow")
      : t("gifting.reminder.inDays", { count: n });

const monthDay = (t, month, day) => `${day} ${t(`gifting.months.m${month}`)}`;

export default function BirthdayReminders({ navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    getUpcomingBirthdays(7)
      .then((r) => { if (alive) setItems(r.slice(0, 3)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {items.map((b) => (
        <View key={b.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[TYPE.eyebrow, { color: colors.primary }]}>
            {daysLabel(t, b.daysUntil).toUpperCase()}
          </Text>
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
              <Text style={[TYPE.title, { color: colors.primary }]}>
                {(b.name || "?").trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[TYPE.bodySemibold, { color: colors.text }]} numberOfLines={1}>
                {t("gifting.reminder.birthdayOf", { name: b.name })}
              </Text>
              <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
                {t("gifting.reminder.subtitle", { date: monthDay(t, b.birthday.month, b.birthday.day) })}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("Gifting", { recipientId: b.id, recipientName: b.name })}
            accessibilityRole="button"
          >
            <Icon name="gift" size={16} color={colors.onPrimary} />
            <Text style={[TYPE.label, { color: colors.onPrimary, marginLeft: 6 }]}>
              {t("gifting.reminder.cta")}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.md },
  card: { borderWidth: 1, borderRadius: RADII.card, padding: SPACING.lg, marginBottom: SPACING.sm },
  row: { flexDirection: "row", alignItems: "center", marginTop: SPACING.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: RADII.pill, paddingVertical: SPACING.sm, marginTop: SPACING.md },
});
