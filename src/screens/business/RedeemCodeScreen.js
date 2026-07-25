/**
 * RedeemCodeScreen (attendee) — enter a host's guest code to link your Kinlo
 * account to their business and unlock your check-in pass. Server does the link
 * (redeemBusinessGuestCode); success shows the pass QR.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import BusinessPassCard from "../../components/business/BusinessPassCard";
import { useTheme } from "../../contexts/ThemeContext";
import { redeemGuestCode } from "../../services/businessPassService";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";

export default function RedeemCodeScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [pass, setPass] = useState(null);
  const { loading: busy, run } = useAsyncLoad(false);

  const onRedeem = () => {
    setError(null);
    return run(async () => {
      try {
        const res = await redeemGuestCode(code);
        if (res.ok) {
          setPass({ bizId: res.bizId, memberId: res.memberId, businessName: res.businessName, memberName: res.memberName });
        } else {
          setError(
            res.error === "invalid"
              ? t("business.redeem.invalid")
              : res.error === "in_use"
              ? t("business.redeem.inUse")
              : t("business.redeem.failed")
          );
        }
      } catch (e) {
        setError(t("business.redeem.failed"));
      }
    });
  };

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t("business.redeem.title")}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {pass ? (
            <>
              <View style={[styles.successPill, { backgroundColor: `${colors.success}18` }]}>
                <Icon name="successCircle" size={18} color={colors.success} />
                <Text style={[styles.successText, { color: colors.success }]}>{t("business.redeem.linked")}</Text>
              </View>
              <BusinessPassCard pass={pass} />
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.doneText}>{t("business.redeem.done")}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("business.redeem.intro")}</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase())}
                placeholder="RITMO-7F3K"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {!!error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
              <TouchableOpacity
                style={[styles.redeemBtn, { backgroundColor: code.trim() ? colors.primary : colors.border, opacity: busy ? 0.6 : 1 }]}
                onPress={onRedeem}
                disabled={!code.trim() || busy}
              >
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.redeemText}>{t("business.redeem.redeem")}</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
    headerTitle: { fontSize: 18, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    intro: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 15, fontSize: 18, fontWeight: "700", letterSpacing: 1, textAlign: "center" },
    error: { fontSize: 13, marginTop: 10, textAlign: "center" },
    redeemBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginTop: 18 },
    redeemText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    successPill: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, marginBottom: 18 },
    successText: { fontSize: 13.5, fontWeight: "700" },
    doneBtn: { height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginTop: 20 },
    doneText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
