/**
 * A3 + A4 — Match profile (Matchmaking v2). Prefilled from the account; the
 * attendee sets the expanded, STRUCTURED profile — energy, group preference,
 * interests, funny tags (fixed catalog, each with its own Kinlo icon), languages,
 * learning, a short bio + intent + icebreaker + visibility — then saves an opt-in
 * profile. No free-text tags, no emoji: every tag is a catalog id rendered via
 * i18n + Icon.js.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { doc, getDoc } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db } from "../../services/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import Icon from "../../components/Icon";
import { MatchHeader, PrimaryButton, Chip } from "./matchUi";
import {
  saveMatchProfile,
  getMyMatchProfile,
  MATCH_TYPE_COLORS,
  VISIBILITY_OPTIONS,
} from "../../services/matchingService";
import {
  INTERESTS,
  FUNNY_TAGS,
  LANGUAGES,
  LEARNING,
  INDUSTRIES,
  GROUP_PREFS,
  DEFAULT_ENERGY,
  isProfileComplete,
} from "../../constants/matchTags";

const ENERGY_STEPS = [0, 25, 50, 75, 100];

export default function MatchProfileScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { eventId, eventTitle } = route.params || {};

  const [types, setTypes] = useState([]);
  const [bio, setBio] = useState("");
  const [profession, setProfession] = useState("");
  const [interests, setInterests] = useState([]); // catalog ids
  const [funnyTags, setFunnyTags] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [learning, setLearning] = useState([]);
  const [energy, setEnergy] = useState({ ...DEFAULT_ENERGY });
  const [groupPref, setGroupPref] = useState(null);
  const [pro, setPro] = useState({ role: "", industry: null, offer: "", seek: "" });
  const [lookingFor, setLookingFor] = useState([]);
  const [icebreaker, setIcebreaker] = useState("");
  const [visibility, setVisibility] = useState("everyone");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [eSnap, existing] = await Promise.all([
        getDoc(doc(db, "events", eventId)),
        getMyMatchProfile(eventId),
      ]);
      const evTypes = eSnap.exists() ? eSnap.data()?.matching?.types || [] : [];
      setTypes(evTypes);
      if (existing) {
        setBio(existing.bio || "");
        setProfession(existing.profession || "");
        setInterests(Array.isArray(existing.interests) ? existing.interests : []);
        setFunnyTags(existing.funnyTags || []);
        setLanguages(existing.languages || []);
        setLearning(existing.learning || []);
        setEnergy(existing.energy || { ...DEFAULT_ENERGY });
        setGroupPref(existing.groupPref || null);
        setPro({ role: "", industry: null, offer: "", seek: "", ...(existing.pro || {}) });
        setLookingFor(existing.lookingFor?.length ? existing.lookingFor : evTypes);
        setIcebreaker(existing.icebreaker || "");
        setVisibility(existing.visibility || "everyone");
      } else {
        setLookingFor(evTypes);
      }
    })();
  }, [eventId]);

  const toggleIn = (setter) => (id) =>
    setter((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const onSave = async () => {
    const draft = { lookingFor, interests, funnyTags, energy, groupPref };
    if (!isProfileComplete(draft)) {
      Alert.alert(t("matching.profile.incompleteTitle"), t("matching.profile.incompleteMsg"));
      return;
    }
    setSaving(true);
    const res = await saveMatchProfile(eventId, {
      bio: bio.trim(),
      profession: profession.trim(),
      interests,
      funnyTags,
      languages,
      learning,
      energy,
      groupPref,
      pro: {
        role: pro.role.trim(),
        industry: pro.industry,
        offer: pro.offer.trim(),
        seek: pro.seek.trim(),
      },
      lookingFor,
      icebreaker: icebreaker.trim(),
      visibility,
      available: true,
    });
    setSaving(false);
    if (!res.success) {
      Alert.alert(t("matching.profile.couldntSaveTitle"), res.error || t("matching.profile.tryAgain"));
      return;
    }
    navigation.replace("MatchGrid", { eventId, eventTitle });
  };

  const s = createStyles(colors);
  const label = (txt) => <Text style={s.label}>{txt}</Text>;

  const catalogChips = (ids, catalog, labelPrefix, onToggle) => (
    <View style={s.chips}>
      {catalog.map((id) => (
        <Chip
          key={id}
          label={t(`matchmaking.${labelPrefix}.${id}`)}
          selected={ids.includes(id)}
          onPress={() => onToggle(id)}
        />
      ))}
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <MatchHeader title={t("matching.profile.title")} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.field}>
          {label(t("matching.profile.shortBio"))}
          <TextInput
            style={[s.input, s.textarea]}
            value={bio}
            onChangeText={setBio}
            placeholder={t("matching.profile.bioPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            multiline
          />
        </View>

        {/* Energy — two axes (P0). Segmented 0–100 (pure JS, no native slider). */}
        {label(t("matching.profile.energyLabel"))}
        <EnergyAxis
          s={s}
          colors={colors}
          low={t("matching.profile.energyChill")}
          high={t("matching.profile.energyAdventurous")}
          value={energy.adventure}
          onChange={(v) => setEnergy((e) => ({ ...e, adventure: v }))}
        />
        <EnergyAxis
          s={s}
          colors={colors}
          low={t("matching.profile.energyIntrovert")}
          high={t("matching.profile.energyExtrovert")}
          value={energy.social}
          onChange={(v) => setEnergy((e) => ({ ...e, social: v }))}
        />

        {label(t("matching.profile.groupPrefLabel"))}
        <View style={s.chips}>
          {GROUP_PREFS.map((g) => (
            <Chip key={g} label={t(`matchmaking.groupPref.${g}`)} selected={groupPref === g} onPress={() => setGroupPref(g)} />
          ))}
        </View>

        {label(t("matching.profile.interestsLabel"))}
        {catalogChips(interests, INTERESTS, "interest", toggleIn(setInterests))}

        {/* Funny tags — fixed catalog, each with its own Kinlo icon + type accent. */}
        {label(t("matching.profile.funnyTagsLabel"))}
        <View style={s.chips}>
          {FUNNY_TAGS.map((tag) => {
            const active = funnyTags.includes(tag.id);
            const c = MATCH_TYPE_COLORS[tag.type] || MATCH_TYPE_COLORS.friend;
            return (
              <TouchableOpacity
                key={tag.id}
                onPress={() => toggleIn(setFunnyTags)(tag.id)}
                activeOpacity={0.8}
                style={[
                  s.tagChip,
                  {
                    backgroundColor: active ? c.bg : colors.surfaceGlass,
                    borderColor: active ? c.fg : colors.border,
                  },
                ]}
              >
                <Icon name={tag.icon} size={15} color={active ? c.fg : colors.textSecondary} />
                <Text style={[s.tagChipText, { color: active ? c.fg : colors.textSecondary }]}>
                  {t(`matchmaking.funnyTag.${tag.id}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {label(t("matching.profile.languagesLabel"))}
        {catalogChips(languages, LANGUAGES, "language", toggleIn(setLanguages))}

        {label(t("matching.profile.learningLabel"))}
        {catalogChips(learning, LEARNING, "learning", toggleIn(setLearning))}

        <Text style={[s.label, { marginTop: 6 }]}>{t("matching.profile.lookingForLabel")}</Text>
        <View style={s.chips}>
          {(types.length ? types : ["friend", "professional", "romantic"]).map((ty) => {
            const c = MATCH_TYPE_COLORS[ty] || {};
            return (
              <Chip
                key={ty}
                label={t(`matchmaking.type.${ty}`)}
                selected={lookingFor.includes(ty)}
                onPress={() => toggleIn(setLookingFor)(ty)}
                fg={c.fg}
                bg={c.bg}
              />
            );
          })}
        </View>

        {/* Professional details (optional — powers professional-mode affinity). */}
        {label(t("matching.profile.proLabel"))}
        <TextInput
          style={s.input}
          value={pro.role}
          onChangeText={(v) => setPro((p) => ({ ...p, role: v }))}
          placeholder={t("matching.profile.proRolePlaceholder")}
          placeholderTextColor={colors.textTertiary}
        />
        <View style={[s.chips, { marginTop: 10 }]}>
          {INDUSTRIES.map((id) => (
            <Chip
              key={id}
              label={t(`matchmaking.industry.${id}`)}
              selected={pro.industry === id}
              onPress={() => setPro((p) => ({ ...p, industry: p.industry === id ? null : id }))}
            />
          ))}
        </View>

        <View style={[s.field, { marginTop: 14 }]}>
          {label(t("matching.profile.icebreaker"))}
          <TextInput
            style={[s.input, s.textarea]}
            value={icebreaker}
            onChangeText={setIcebreaker}
            placeholder={t("matching.profile.icebreakerPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            multiline
          />
        </View>

        {label(t("matching.profile.whoCanSee"))}
        <View style={s.chips}>
          {VISIBILITY_OPTIONS.map((v) => (
            <Chip
              key={v}
              label={t(`matching.profile.vis${v === "everyone" ? "Everyone" : v === "same_gender" ? "SameGender" : "OppositeGender"}`)}
              selected={visibility === v}
              onPress={() => setVisibility(v)}
            />
          ))}
        </View>
      </ScrollView>
      <View style={s.footer}>
        <PrimaryButton label={t("matching.profile.saveAndSee")} onPress={onSave} loading={saving} />
      </View>
    </View>
  );
}

/** Segmented energy axis (0–100 in 5 steps). Pure JS — no native slider module. */
function EnergyAxis({ s, colors, low, high, value, onChange }) {
  return (
    <View style={s.energyAxis}>
      <View style={s.energyDots}>
        {ENERGY_STEPS.map((step) => {
          const active = value === step;
          return (
            <TouchableOpacity
              key={step}
              onPress={() => onChange(step)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[
                s.energyDot,
                {
                  backgroundColor: active ? colors.primary : "transparent",
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={s.energyLabels}>
        <Text style={[s.energyLabel, { color: colors.textSecondary }]}>{low}</Text>
        <Text style={[s.energyLabel, { color: colors.textSecondary }]}>{high}</Text>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 24, paddingBottom: 24 },
    field: { marginBottom: 18 },
    label: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 10 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceGlass,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    textarea: { minHeight: 72, textAlignVertical: "top" },
    chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
    tagChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1.5,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 8,
      marginBottom: 8,
    },
    tagChipText: { fontSize: 13, fontWeight: "700" },
    energyAxis: { marginBottom: 16 },
    energyDots: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
    energyDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
    energyLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
    energyLabel: { fontSize: 12, fontWeight: "600" },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 8 },
  });
}
