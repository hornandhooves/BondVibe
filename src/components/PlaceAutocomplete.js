/**
 * PlaceAutocomplete — tap-to-search venue picker backed by Google Places.
 *
 * Uses the classic Places REST API (the "Places API" enabled in Google Cloud):
 *   - Autocomplete:  /maps/api/place/autocomplete/json
 *   - Details:       /maps/api/place/details/json
 *
 * A session token is generated per search and reused across the autocomplete
 * calls + the final details call, so Google bills a single "per session" unit
 * (kept inside the free tier for our volume).
 *
 * onSelect receives: { description, address, latitude, longitude, placeId }
 * If the Places key is missing or a request fails, the field degrades to a
 * plain free-text entry (onSelect with only { description }).
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import Icon from "./Icon";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";

const PLACES_KEY =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
  "";

const AUTOCOMPLETE_URL =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

function makeSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function PlaceAutocomplete({
  value,
  onSelect,
  placeholder,
  label,
  // Optional controlled-open mode: when `open` is provided the parent drives
  // visibility (and no trigger field is rendered) — used to launch the search
  // from elsewhere, e.g. the chat "share location" prompt.
  open: openProp,
  onOpenChange,
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("placeAutocomplete.placeholder");
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const setOpen = (v) => (controlled ? onOpenChange?.(v) : setOpenState(v));
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const sessionToken = useRef(null);
  const debounceRef = useRef(null);

  const hasKey = !!PLACES_KEY;

  const openModal = () => setOpen(true);

  // Initialize a fresh search (session token + reset) each time the modal
  // opens — works for both the internal trigger and controlled-open.
  useEffect(() => {
    if (open) {
      sessionToken.current = makeSessionToken();
      setQuery(value || "");
      setPredictions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closeModal = () => {
    setOpen(false);
    setPredictions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const fetchPredictions = useCallback(async (text) => {
    if (!text || text.trim().length < 2) {
      setPredictions([]);
      return;
    }
    if (!hasKey) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        input: text,
        key: PLACES_KEY,
        sessiontoken: sessionToken.current,
        language: "en",
        // App is scoped to Mexico (Tulum / Playa del Carmen / Cancún).
        components: "country:mx",
      });
      const res = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`);
      const json = await res.json();
      if (json.status === "OK" || json.status === "ZERO_RESULTS") {
        setPredictions(json.predictions || []);
      } else {
        // REQUEST_DENIED / OVER_QUERY_LIMIT etc. — fail soft.
        console.warn("Places autocomplete:", json.status, json.error_message);
        setPredictions([]);
      }
    } catch (e) {
      console.warn("Places autocomplete error:", e?.message);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, [hasKey]);

  const onChangeQuery = (text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(text), 300);
  };

  const handlePick = async (prediction) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        place_id: prediction.place_id,
        key: PLACES_KEY,
        sessiontoken: sessionToken.current,
        language: "en",
        fields: "formatted_address,geometry,name",
      });
      const res = await fetch(`${DETAILS_URL}?${params.toString()}`);
      const json = await res.json();
      const r = json.result || {};
      const loc = r.geometry?.location || {};
      onSelect({
        description: prediction.description,
        address: r.formatted_address || prediction.description,
        name: r.name || prediction.structured_formatting?.main_text || "",
        latitude: typeof loc.lat === "number" ? loc.lat : null,
        longitude: typeof loc.lng === "number" ? loc.lng : null,
        placeId: prediction.place_id,
      });
    } catch (_e) {
      // Details failed — still keep the human-readable description.
      onSelect({ description: prediction.description });
    } finally {
      setLoading(false);
      closeModal();
    }
  };

  const handleUseTyped = () => {
    // No Places key, or user wants their exact text: keep it as free text.
    onSelect({ description: query.trim() });
    closeModal();
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const styles = createStyles(colors);

  return (
    <>
      {!controlled && (
        <>
          {!!label && <Text style={styles.label}>{label}</Text>}
          <TouchableOpacity
            style={styles.fieldButton}
            onPress={openModal}
            activeOpacity={0.7}
          >
            <Icon name="location"
              size={20}
              color={colors.textSecondary}
              style={{ marginRight: 12 }}
            />
            <Text
              style={[
                styles.fieldText,
                { color: value ? colors.text : colors.textTertiary },
              ]}
              numberOfLines={1}
            >
              {value || resolvedPlaceholder}
            </Text>
          </TouchableOpacity>
        </>
      )}

      <Modal
        visible={open}
        animationType="slide"
        transparent={false}
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.background }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal} style={styles.closeBtn}>
              <Icon name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{t("placeAutocomplete.searchVenue")}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.searchWrapper}>
            <Icon name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={resolvedPlaceholder}
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={onChangeQuery}
              autoFocus
              autoCorrect={false}
            />
            {loading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          {!hasKey && (
            <Text style={styles.hint}>
              {t("placeAutocomplete.hint")}
            </Text>
          )}

          <FlatList
            data={predictions}
            keyExtractor={(item) => item.place_id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => handlePick(item)}
              >
                <Icon name="location"
                  size={18}
                  color={colors.primary}
                  style={{ marginRight: 12, marginTop: 2 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowMain} numberOfLines={1}>
                    {item.structured_formatting?.main_text || item.description}
                  </Text>
                  {!!item.structured_formatting?.secondary_text && (
                    <Text style={styles.rowSecondary} numberOfLines={1}>
                      {item.structured_formatting.secondary_text}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
            ListFooterComponent={
              query.trim().length > 0 ? (
                <TouchableOpacity
                  style={styles.useTypedRow}
                  onPress={handleUseTyped}
                >
                  <Text style={styles.useTypedText}>
                    {t("placeAutocomplete.useTyped", { query: query.trim() })}
                  </Text>
                </TouchableOpacity>
              ) : null
            }
          />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
    },
    fieldButton: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceGlass,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    fieldText: { flex: 1, fontSize: 16 },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: Platform.OS === "ios" ? 60 : 20,
      paddingBottom: 16,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    closeBtn: { width: 40, height: 40, justifyContent: "center" },
    modalTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
    searchWrapper: {
      flexDirection: "row",
      alignItems: "center",
      margin: 16,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceGlass,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      paddingVertical: 12,
      marginLeft: 10,
    },
    hint: {
      fontSize: 13,
      color: colors.textSecondary,
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowMain: { fontSize: 16, color: colors.text, fontWeight: "500" },
    rowSecondary: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    useTypedRow: { paddingVertical: 16, paddingHorizontal: 20 },
    useTypedText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
  });
}
