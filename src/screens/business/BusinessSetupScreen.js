/**
 * BusinessSetupScreen — first-run setup for Kinlo for Business. Pick a vertical
 * preset (labels/defaults only, all-vertical) + name the business. Creates the
 * businesses/{bizId} doc + owner staff record.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import PlaceAutocomplete from "../../components/PlaceAutocomplete";
import { useTheme } from "../../contexts/ThemeContext";
import { createBusiness, getBusiness, updateBusiness, getMyBizId } from "../../services/businessService";
import { setServiceLocation } from "../../services/businessLocationService";
import { geocodeAddress } from "../../utils/geocode";
import { VERTICAL_IDS, DEFAULT_VERTICAL, verticalLabelKey } from "../../constants/businessVerticals";

export default function BusinessSetupScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState(DEFAULT_VERTICAL);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // The SAVED name, not the field. Titling with `name` would rewrite the header
  // on every keystroke — and blank it the moment the field is cleared.
  const [savedName, setSavedName] = useState("");
  // KIN-284: business-level address, distinct from a branch's own address
  // (BranchesScreen.js) — this is the one setServiceLocation gates on the
  // marketplace listing.
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    getBusiness().then((biz) => {
      if (biz) {
        setName(biz.name || "");
        setSavedName(biz.name || "");
        setVertical(biz.vertical || DEFAULT_VERTICAL);
        setAddress(biz.address || "");
        if (typeof biz.latitude === "number" && typeof biz.longitude === "number") {
          setCoords({ latitude: biz.latitude, longitude: biz.longitude });
        }
        setEditing(true);
      }
    });
  }, []);

  // Mirrors CreateEventScreen's own free-text fallback: a Places pick already
  // carries lat/lng; typed-with-no-suggestion (PlaceAutocomplete's
  // handleUseTyped) hands back only { description }, so geocode it to still
  // get coordinates.
  const onSelectAddress = async (place) => {
    setAddress(place.description || "");
    if (typeof place.latitude === "number" && typeof place.longitude === "number") {
      setCoords({ latitude: place.latitude, longitude: place.longitude });
    } else {
      setCoords(await geocodeAddress(place.description));
    }
  };

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert(t("business.setup.nameRequiredTitle"), t("business.setup.nameRequiredMsg"));
      return;
    }
    setSaving(true);
    try {
      const addressPatch = {
        address: address.trim() || null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      };
      if (editing) {
        await updateBusiness({ name: name.trim(), vertical, ...addressPatch });
      } else {
        await createBusiness({ name: name.trim(), vertical });
        if (address.trim()) await updateBusiness(addressPatch);
      }
      // KIN-284: computes the coarse/exact split for the marketplace listing
      // (setServiceLocation, functions/index.js) — bizId only exists AFTER
      // createBusiness resolves, so this runs after both branches, not inside
      // the create one.
      if (address.trim() && coords) {
        await setServiceLocation({ bizId: getMyBizId(), address: address.trim(), exactCoords: coords });
      }
      if (editing) navigation.goBack();
      else navigation.replace("BusinessHub");
    } catch (e) {
      setSaving(false);
      Alert.alert(t("business.common.errorTitle"), t("business.common.tryAgain"));
    }
  };

  const styles = createStyles(colors);
  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        {/* One screen creates AND edits, but the title only ever said "New
            business" — so editing an existing business announced you were making
            a second one. Prefer the business's own name: it confirms which one
            you're editing, which the generic "Edit business" doesn't. */}
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {editing
            ? savedName || t("business.setup.editTitle")
            : t("business.setup.title")}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("business.setup.intro")}</Text>

        <Text style={[styles.label, { color: colors.textTertiary }]}>{t("business.setup.nameLabel")}</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          value={name}
          onChangeText={setName}
          placeholder={t("business.setup.namePlaceholder")}
          placeholderTextColor={colors.textTertiary}
        />

        <Text style={[styles.label, { color: colors.textTertiary, marginTop: 20 }]}>
          {t("business.setup.verticalLabel")}
        </Text>
        <View style={styles.verticalGrid}>
          {VERTICAL_IDS.map((id) => {
            const active = vertical === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setVertical(id)}
                style={[
                  styles.vChip,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? `${colors.primary}18` : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.vText, { color: active ? colors.primary : colors.textSecondary }]}>
                  {t(verticalLabelKey(id))}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.presetHint, { color: colors.textTertiary }]}>{t("business.setup.presetHint")}</Text>

        <Text style={[styles.label, { color: colors.textTertiary, marginTop: 20 }]}>
          {t("business.setup.addressLabel")}
        </Text>
        <PlaceAutocomplete value={address} onSelect={onSelectAddress} />
        <Text style={[styles.presetHint, { color: colors.textTertiary }]}>{t("business.setup.addressHint")}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveText}>{editing ? t("business.setup.saveChanges") : t("business.setup.create")}</Text>
          )}
        </TouchableOpacity>
      </View>
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 24 },
    intro: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
    verticalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    vChip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
    vText: { fontSize: 13, fontWeight: "700" },
    presetHint: { fontSize: 12, lineHeight: 17, marginTop: 12 },
    footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 6 },
    saveBtn: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
    saveText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  });
}
