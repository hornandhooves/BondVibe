import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";

const EMERGENCY_NUMBER = "911";

const TIP_KEYS = [
  { icon: "users", key: "meetInPublic" },
  { icon: "user", key: "tellSomeone" },
  { icon: "lock", key: "keepInfoPrivate" },
  { icon: "heart", key: "trustInstincts" },
];

export default function SafetyCenterScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const s = createStyles(colors);

  const TIPS = TIP_KEYS.map((tip) => ({
    icon: tip.icon,
    title: t(`safetyCenter.tips.${tip.key}.title`),
    body: t(`safetyCenter.tips.${tip.key}.body`),
  }));

  function callEmergency() {
    Alert.alert(
      t("safetyCenter.callEmergencyTitle"),
      t("safetyCenter.callEmergencyMessage", { number: EMERGENCY_NUMBER }),
      [
        { text: t("safetyCenter.cancel"), style: "cancel" },
        { text: t("safetyCenter.callNow"), style: "destructive", onPress: () => Linking.openURL(`tel:${EMERGENCY_NUMBER}`) },
      ]
    );
  }

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>{t("safetyCenter.headerTitle")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* SOS button */}
        <TouchableOpacity style={s.sosButton} onPress={callEmergency} activeOpacity={0.8}>
          <Icon name="bell" size={28} color="#fff" />
          <View>
            <Text style={s.sosLabel}>{t("safetyCenter.sosLabel")}</Text>
            <Text style={s.sosSub}>{t("safetyCenter.sosSub")}</Text>
          </View>
        </TouchableOpacity>

        {/* Quick actions */}
        <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t("safetyCenter.quickActions")}</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={s.actionRow}
            onPress={() => navigation.navigate("Report", {})}
          >
            <View style={[s.actionIcon, { backgroundColor: colors.brandSoft }]}>
              <Icon name="report" size={18} color={colors.primary} />
            </View>
            <Text style={[s.actionLabel, { color: colors.text }]}>{t("safetyCenter.reportUser")}</Text>
            <Icon name="forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={s.actionRow}
            onPress={() => Linking.openURL("mailto:safety@kinlo.org")}
          >
            <View style={[s.actionIcon, { backgroundColor: colors.brandSoft }]}>
              <Icon name="message" size={18} color={colors.primary} />
            </View>
            <Text style={[s.actionLabel, { color: colors.text }]}>{t("safetyCenter.contactSafetyTeam")}</Text>
            <Icon name="forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Safety tips */}
        <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>{t("safetyCenter.safetyTips")}</Text>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {TIPS.map((tip, i) => (
            <View key={tip.title}>
              <View style={s.tipRow}>
                <View style={[s.actionIcon, { backgroundColor: colors.brandSoft }]}>
                  <Icon name={tip.icon} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.tipTitle, { color: colors.text }]}>{tip.title}</Text>
                  <Text style={[s.tipBody, { color: colors.textSecondary }]}>{tip.body}</Text>
                </View>
              </View>
              {i < TIPS.length - 1 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
            </View>
          ))}
        </View>

        <Text style={[s.footnote, { color: colors.textTertiary }]}>
          {t("safetyCenter.footnote")}
        </Text>
      </ScrollView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: "700" },
    content: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
    sosButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      backgroundColor: "#D92B3A",
      borderRadius: 18,
      padding: 20,
      marginBottom: 6,
    },
    sosLabel: { color: "#fff", fontSize: 17, fontWeight: "700" },
    sosSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      marginTop: 4,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 16,
    },
    actionIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    actionLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
    tipRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      padding: 16,
    },
    tipTitle: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
    tipBody: { fontSize: 13, lineHeight: 18 },
    footnote: { fontSize: 12, textAlign: "center", marginTop: 4 },
  });
}
