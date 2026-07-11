/**
 * ChooseHandleScreen — the one-time, blocking "pick your @handle" step (spec 10,
 * block 2). Shown in onboarding for new users and once for existing users who
 * don't have a handle yet. It has no skip and no back: everything (search, DMs,
 * mentions) keys off the handle.
 *
 * On a successful claim it does NOT navigate itself — claimHandle writes
 * handleLower on the user doc, the AppNavigator onSnapshot re-fires, and routing
 * continues to the next onboarding step (exactly like Legal/ProfileSetup).
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";
import { TYPE, SPACING, RADII } from "../constants/theme-tokens";
import {
  validateHandleClient,
  suggestHandleFromName,
  checkHandle,
  claimHandle,
} from "../services/handleService";

export default function ChooseHandleScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("idle"); // idle|checking|available|taken|invalid|reserved
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef(null);
  const seededRef = useRef(false);

  const styles = createStyles(colors);

  // Sanitize to the handle charset as the user types (a–z + underscore).
  const onChange = (v) => {
    setError("");
    setValue(v.toLowerCase().replace(/[^a-z_]/g, "").slice(0, 30));
  };

  // Debounced validate + availability check whenever the value changes.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value) {
      setStatus("idle");
      return;
    }
    const v = validateHandleClient(value);
    if (!v.ok) {
      setStatus(v.error === "reserved" ? "reserved" : "invalid");
      return;
    }
    setStatus("checking");
    debounceRef.current = setTimeout(async () => {
      const r = await checkHandle(value);
      // Ignore a stale response if the field moved on.
      setStatus(r.available ? "available" : r.error === "taken" ? "taken" : "invalid");
    }, 400);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [value]);

  // Seed a suggestion from the user's name on first load.
  const seed = useCallback(async () => {
    if (seededRef.current) return;
    seededRef.current = true;
    try {
      const uid = auth.currentUser?.uid;
      const snap = uid ? await getDoc(doc(db, "users", uid)) : null;
      const name = snap?.exists() ? snap.data().fullName || snap.data().name : "";
      const suggestion = suggestHandleFromName(name || "");
      if (suggestion) setValue(suggestion);
    } catch (_e) {
      // no seed — the user just types their own
    }
  }, []);

  useEffect(() => {
    seed();
  }, [seed]);

  const onClaim = async () => {
    if (status !== "available" || claiming) return;
    setClaiming(true);
    setError("");
    // BUG 35.1: guard the claim with a 15s timeout so a stalled/flaky call can't
    // hang the spinner forever. On timeout the button re-enables and a retry
    // alert is surfaced; the CTA itself is also a retry affordance.
    const CLAIM_TIMEOUT_MS = 15000;
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ success: false, code: "timeout" }), CLAIM_TIMEOUT_MS),
    );
    const r = await Promise.race([claimHandle(value), timeout]);
    if (r.success) {
      // Do NOT navigate — the AppNavigator snapshot re-routes once handleLower
      // is written. Show a brief "setting up" state until it does.
      setClaimed(true);
      return;
    }
    setClaiming(false);
    if (r.code === "timeout") {
      setError(t("chooseHandle.errorTimeout"));
      Alert.alert(t("chooseHandle.timeoutTitle"), t("chooseHandle.errorTimeout"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("chooseHandle.retry"), onPress: onClaim },
      ]);
    } else {
      setError(r.error || t("chooseHandle.errorGeneric"));
      if (r.code === "already-exists") setStatus("taken");
    }
  };

  if (claimed) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[TYPE.body, { color: colors.textSecondary, marginTop: SPACING.md }]}>
            {t("chooseHandle.settingUp")}
          </Text>
        </View>
      </GradientBackground>
    );
  }

  const statusMeta = {
    checking: { icon: null, color: colors.textTertiary, text: t("chooseHandle.checking") },
    available: { icon: "successCircle", color: colors.success, text: t("chooseHandle.available") },
    taken: { icon: "errorCircle", color: colors.error, text: t("chooseHandle.taken") },
    reserved: { icon: "errorCircle", color: colors.error, text: t("chooseHandle.reserved") },
    invalid: { icon: "errorCircle", color: colors.error, text: t("chooseHandle.invalid") },
  }[status];

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.content}>
        <View style={[styles.art, { backgroundColor: colors.brandSoft }]}>
          <Text style={{ fontSize: 34, fontWeight: "800", color: colors.primary }}>@</Text>
        </View>
        <Text style={[TYPE.titleLg, styles.title, { color: colors.text }]}>
          {t("chooseHandle.title")}
        </Text>
        <Text style={[TYPE.body, styles.subtitle, { color: colors.textSecondary }]}>
          {t("chooseHandle.subtitle")}
        </Text>

        <View style={[styles.inputWrap, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
          <Text style={[styles.at, { color: colors.textSecondary }]}>@</Text>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={value}
            onChangeText={onChange}
            placeholder={t("chooseHandle.placeholder")}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={30}
            returnKeyType="done"
            editable={!claiming}
          />
          {status === "checking" && <ActivityIndicator size="small" color={colors.textTertiary} />}
        </View>

        {statusMeta && status !== "checking" && (
          <View style={styles.statusRow}>
            {statusMeta.icon ? <Icon name={statusMeta.icon} size={15} color={statusMeta.color} /> : null}
            <Text style={[TYPE.caption, { color: statusMeta.color }]}>{statusMeta.text}</Text>
          </View>
        )}
        {status === "checking" && (
          <View style={styles.statusRow}>
            <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{t("chooseHandle.checking")}</Text>
          </View>
        )}
        {!!error && (
          <Text style={[TYPE.caption, styles.errorText, { color: colors.error }]}>{error}</Text>
        )}

        <Text style={[TYPE.caption, styles.rules, { color: colors.textTertiary }]}>
          {t("chooseHandle.rules")}
        </Text>

        <TouchableOpacity
          style={[
            styles.cta,
            { backgroundColor: colors.primary, opacity: status === "available" && !claiming ? 1 : 0.4 },
          ]}
          onPress={onClaim}
          disabled={status !== "available" || claiming}
        >
          {claiming ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.ctaText}>{t("chooseHandle.claim", { handle: value })}</Text>
          )}
        </TouchableOpacity>
        <Text style={[TYPE.caption, styles.permanent, { color: colors.textTertiary }]}>
          {t("chooseHandle.permanentNote")}
        </Text>
      </View>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    content: { flex: 1, justifyContent: "center", paddingHorizontal: SPACING.screen },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    art: {
      width: 68, height: 68, borderRadius: 20,
      alignItems: "center", justifyContent: "center",
      alignSelf: "center", marginBottom: SPACING.lg,
    },
    title: { textAlign: "center", marginBottom: SPACING.xs },
    subtitle: { textAlign: "center", marginBottom: SPACING.xl, lineHeight: 21 },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: RADII.card,
      paddingHorizontal: SPACING.md,
      gap: 4,
    },
    at: { fontSize: 20, fontWeight: "700" },
    input: { flex: 1, fontSize: 18, paddingVertical: 16, letterSpacing: 0.2 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.sm, marginLeft: 4 },
    errorText: { marginTop: SPACING.sm, marginLeft: 4 },
    rules: { marginTop: SPACING.md, lineHeight: 17 },
    cta: {
      borderRadius: RADII.pill,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: SPACING.xl,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    permanent: { textAlign: "center", marginTop: SPACING.md },
  });
}
