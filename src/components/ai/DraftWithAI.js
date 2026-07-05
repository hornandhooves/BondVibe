/**
 * DraftWithAI — Host Copilot entry (ai_features/12): type an idea, Claude
 * drafts the event (title/description) + price suggestion + turnout
 * prediction grounded in the host's past events. "Use draft" prefills the
 * form via onApply. Pro-gated server-side (1 free draft, then needs_pro).
 */
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../Icon";
import AICard, { AIText } from "../AICard";
import { useTheme } from "../../contexts/ThemeContext";
import { callClaude } from "../../services/claudeService";
import { TYPE, SPACING, RADII, BRAND, ELEVATION } from "../../constants/theme-tokens";

export default function DraftWithAI({ onApply, navigation, placeholder = "Just type the idea…" }) {
  const { colors } = useTheme();
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [needsPro, setNeedsPro] = useState(false);
  const [failed, setFailed] = useState(false);

  const generate = async () => {
    const text = idea.trim();
    if (!text || busy) return;
    setBusy(true);
    setFailed(false);
    const res = await callClaude("host_copilot", { idea: text });
    if (res.ok) setDraft(res.data);
    else if (res.needsPro) setNeedsPro(true);
    else setFailed(true);
    setBusy(false);
  };

  if (needsPro) {
    return (
      <AICard eyebrow="Host Copilot" style={styles.block}>
        <AIText>You've used your free AI draft. Kinlo Pro drafts every event for you.</AIText>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate("ProUpsell", { from: "host_copilot" })}
        >
          <Text style={[TYPE.label, styles.ctaText]}>See Kinlo Pro</Text>
        </TouchableOpacity>
      </AICard>
    );
  }

  return (
    <View style={styles.block}>
      {!draft && (
        <AICard eyebrow="Host Copilot">
          <AIText>Describe the event in one line — I'll draft the rest from your history.</AIText>
          <TextInput
            testID="copilot-idea"
            style={[TYPE.body, styles.input]}
            placeholder={placeholder}
            placeholderTextColor="rgba(230,221,242,0.5)"
            value={idea}
            onChangeText={setIdea}
            editable={!busy}
          />
          <TouchableOpacity onPress={generate} disabled={busy || !idea.trim()} activeOpacity={0.85}>
            <LinearGradient
              colors={BRAND.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.cta, (busy || !idea.trim()) && { opacity: 0.5 }]}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={[TYPE.label, styles.ctaText]}>Draft with AI</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
          {failed && (
            <AIText style={{ opacity: 0.7 }}>AI drafting is taking a break — try again in a moment.</AIText>
          )}
        </AICard>
      )}

      {draft && (
        <View style={[styles.draftCard, ELEVATION.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.eyebrowRow}>
            <Icon name="ai" size={14} color={colors.primary} />
            <Text style={[TYPE.eyebrow, { color: colors.primary }]}>Claude drafted this</Text>
          </View>
          <Text style={[TYPE.title, { color: colors.text }]}>{draft.title}</Text>
          <Text style={[TYPE.body, { color: colors.textSecondary }]} numberOfLines={5}>
            {draft.description}
          </Text>

          {(draft.priceSuggestion || draft.turnoutPrediction) && (
            <View style={styles.tiles}>
              {draft.priceSuggestion && (
                <View style={[styles.tile, { backgroundColor: colors.sunken }]}>
                  <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Suggested price</Text>
                  <Text style={[TYPE.title, { color: colors.text }]}>
                    ${draft.priceSuggestion.amount}
                  </Text>
                  <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                    {draft.priceSuggestion.rationale}
                  </Text>
                </View>
              )}
              {draft.turnoutPrediction && (
                <View style={[styles.tile, { backgroundColor: colors.sunken }]}>
                  <Text style={[TYPE.caption, { color: colors.textTertiary }]}>Predicted turnout</Text>
                  <Text style={[TYPE.title, { color: colors.text }]}>
                    ~{draft.turnoutPrediction.expected}
                    {draft.turnoutPrediction.capacity ? `/${draft.turnoutPrediction.capacity}` : ""}
                  </Text>
                  <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                    {draft.turnoutPrediction.basis} (estimate)
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: colors.primary }]}
              onPress={() => onApply(draft)}
              testID="copilot-use-draft"
            >
              <Text style={[TYPE.label, styles.ctaText]}>Use draft</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.regen} onPress={() => setDraft(null)}>
              <Text style={[TYPE.label, { color: colors.textTertiary }]}>Regenerate</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: SPACING.lg },
  input: {
    color: "#FFFFFF",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: RADII.tile,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  cta: {
    alignSelf: "flex-start",
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 130,
  },
  ctaText: { color: "#FFFFFF" },
  draftCard: { borderRadius: RADII.card, borderWidth: 1, padding: SPACING.card, gap: SPACING.sm },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tiles: { flexDirection: "row", gap: SPACING.sm },
  tile: { flex: 1, borderRadius: RADII.tile, padding: SPACING.md, gap: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: SPACING.lg },
  regen: { paddingVertical: SPACING.sm },
});
