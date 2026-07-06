/**
 * C4 — Kinlo Plus paywall. Shown when a free attendee reaches the event's match
 * cap. Routes to the Plus checkout (E3).
 */
import React from "react";
import Icon from "../../components/Icon";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { PrimaryButton, SecondaryButton } from "./matchUi";

export default function PlusPaywallScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { eventId, eventTitle, maxMatches } = route.params || {};

  const styles = createStyles(colors);
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.center}>
        <View style={[styles.badge, { backgroundColor: `${colors.primary}15` }]}>
          <Icon name="infinity" size={44} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {maxMatches && maxMatches > 0
            ? `You reached your ${maxMatches} matches`
            : "You reached your match limit"}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Keep meeting people with Kinlo Plus — unlimited matches at every event.
        </Text>

        <View style={styles.perks}>
          {[
            "Unlimited matches",
            "Priority in the grid",
            "Cancel anytime",
          ].map((p) => (
            <View key={p} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="check" size={14} color={colors.success} />
              <Text style={[styles.perk, { color: colors.text }]}>{p}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label="Get Kinlo Plus"
          onPress={() =>
            navigation.replace("PlusCheckout", { eventId, eventTitle })
          }
        />
        <SecondaryButton label="Maybe later" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
    badge: {
      width: 92,
      height: 92,
      borderRadius: 46,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    title: { fontSize: 24, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 },
    subtitle: { fontSize: 15, textAlign: "center", lineHeight: 22, marginTop: 12 },
    perks: { marginTop: 28, gap: 10, alignSelf: "stretch", paddingHorizontal: 20 },
    perk: { fontSize: 15, fontWeight: "600" },
    footer: { paddingHorizontal: 24, paddingBottom: 28, gap: 6 },
  });
}
