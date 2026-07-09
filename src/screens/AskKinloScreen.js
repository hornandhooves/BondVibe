/**
 * AskKinloScreen — the conversational concierge (ai_features/11).
 * User bubbles = brand; AI bubbles = surface + inline grounded event cards
 * (only real eventIds, attached by the server) + suggestion chips.
 * Free taste: 3 questions/week (server-enforced) → Plus paywall.
 */
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { doc, getDoc } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db } from "../services/firebase";
import GradientBackground from "../components/GradientBackground";
import Icon from "../components/Icon";
import { useTheme } from "../contexts/ThemeContext";
import useKinloChat from "../hooks/useKinloChat";
import useAiOptIn from "../hooks/useAiOptIn";
import { TYPE, SPACING, RADII, BRAND, AI, ELEVATION } from "../constants/theme-tokens";

/** Inline event card attached to an AI reply (grounded eventId). */
function EventAttachment({ eventId, navigation }) {
  const { colors } = useTheme();
  const [ev, setEv] = useState(null);
  useEffect(() => {
    getDoc(doc(db, "events", eventId))
      .then((s) => s.exists() && setEv(s.data()))
      .catch(() => {});
  }, [eventId]);
  if (!ev) return null;
  const when = ev.date
    ? new Date(ev.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "";
  return (
    <TouchableOpacity
      style={[styles.attachment, { backgroundColor: colors.sunken, borderColor: colors.border }]}
      onPress={() => navigation.navigate("EventDetail", { eventId })}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.bodySemibold, { color: colors.text }]} numberOfLines={1}>
          {ev.title}
        </Text>
        <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
          {when}
          {ev.city ? ` · ${ev.city}` : ""}
        </Text>
      </View>
      <Icon name="forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

export default function AskKinloScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { aiOptIn } = useAiOptIn();
  const { messages, send, sending } = useKinloChat();
  const [input, setInput] = useState("");
  const listRef = useRef(null);
  const STARTER_CHIPS = [
    t("askKinlo.chips.weekend"),
    t("askKinlo.chips.planWeek"),
    t("askKinlo.chips.somethingNew"),
  ];

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, sending]);

  const submit = (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput("");
    send(q);
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        <View
          style={[
            styles.bubble,
            isUser
              ? { backgroundColor: colors.primary }
              : [{ backgroundColor: colors.surface, borderColor: colors.border }, styles.bubbleAi, ELEVATION.card],
          ]}
        >
          <Text style={[TYPE.body, { color: isUser ? "#FFFFFF" : colors.text }]}>{item.text}</Text>
          {(item.attachments || []).map((a) =>
            a.type === "event" ? (
              <EventAttachment key={a.eventId} eventId={a.eventId} navigation={navigation} />
            ) : null
          )}
          {item.needsPlus && (
            <TouchableOpacity
              style={[styles.plusCta, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate("PlusPaywall", { from: "ask_kinlo" })}
            >
              <Text style={[TYPE.label, { color: "#FFFFFF" }]}>{t("askKinlo.seeKinloPlus")}</Text>
            </TouchableOpacity>
          )}
        </View>
        {!isUser && (item.suggestions || []).length > 0 && (
          <View style={styles.chips}>
            {item.suggestions.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                onPress={() => submit(s)}
              >
                <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header — sparkle avatar + presence line */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <LinearGradient colors={AI.panel} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
          <Icon name="ai" size={18} color={AI.accent} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.title, { color: colors.text }]}>{t("askKinlo.title")}</Text>
          <Text style={[TYPE.caption, { color: colors.success }]}>{t("askKinlo.knowsCommunities")}</Text>
        </View>
      </View>

      {!aiOptIn ? (
        <View style={styles.optInPrompt}>
          <Icon name="ai" size={40} color={colors.textTertiary} />
          <Text style={[TYPE.body, styles.optInText, { color: colors.textSecondary }]}>
            {t("askKinlo.optInText")}
          </Text>
          <TouchableOpacity
            style={[styles.plusCta, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate("AiOptIn")}
          >
            <Text style={[TYPE.label, { color: "#FFFFFF" }]}>{t("askKinlo.turnOnCta")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={[TYPE.body, { color: colors.textSecondary, textAlign: "center" }]}>
                  {t("askKinlo.emptyText")}
                </Text>
                <View style={styles.chips}>
                  {STARTER_CHIPS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surfaceGlass }]}
                      onPress={() => submit(s)}
                    >
                      <Text style={[TYPE.caption, { color: colors.textSecondary }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            }
            ListFooterComponent={
              sending ? (
                <View style={styles.typing}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[TYPE.caption, { color: colors.textTertiary }]}>{t("askKinlo.thinking")}</Text>
                </View>
              ) : null
            }
          />

          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              testID="ask-kinlo-input"
              style={[TYPE.body, styles.input, { color: colors.text }]}
              placeholder={t("askKinlo.placeholder")}
              placeholderTextColor={colors.textTertiary}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => submit()}
              returnKeyType="send"
              editable={!sending}
            />
            <TouchableOpacity onPress={() => submit()} disabled={sending || !input.trim()} activeOpacity={0.85}>
              <LinearGradient
                colors={BRAND.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.sendBtn, (sending || !input.trim()) && { opacity: 0.5 }]}
              >
                <Icon name="send" size={18} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.screen,
    paddingTop: 60,
    paddingBottom: SPACING.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { padding: SPACING.screen, gap: SPACING.md, flexGrow: 1 },
  msgRow: { alignItems: "flex-start", gap: SPACING.sm },
  msgRowUser: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "85%",
    borderRadius: RADII.card,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  bubbleAi: { borderWidth: 1 },
  attachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADII.tile,
    borderWidth: 1,
    padding: SPACING.md,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: {
    borderWidth: 1,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  typing: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderTopWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  input: { flex: 1, paddingVertical: SPACING.sm },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  optInPrompt: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.lg,
    paddingHorizontal: SPACING.xxxl,
  },
  optInText: { textAlign: "center" },
  plusCta: {
    alignSelf: "center",
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
});
