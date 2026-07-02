import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import DateField from "../components/DateField";
import {
  VEHICLE_TYPES,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  ensureProvider,
} from "../services/rentalService";
import { uploadVehiclePhotos } from "../services/storageService";

const TYPE_LABEL = { scooter: "Scooter", bike: "Bike", car: "Car" };

// Module-scope so the TextInput isn't remounted (and focus lost) on each render.
function Field({ label, c, st, ...props }) {
  return (
    <View style={st.field}>
      <Text style={[st.label, { color: c.textSecondary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.textTertiary}
        style={[st.input, { color: c.text, borderColor: c.border }]}
        {...props}
      />
    </View>
  );
}
const toCentavos = (pesos) => Math.round((parseFloat(pesos) || 0) * 100);
const toPesos = (centavos) => (centavos ? String(centavos / 100) : "");

export default function PublishVehicleScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { vehicleId } = route.params || {};
  const editing = !!vehicleId;

  const [type, setType] = useState("scooter");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [pickupLabel, setPickupLabel] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [deposit, setDeposit] = useState("");
  const [rangeKm, setRangeKm] = useState("");
  const [requiresLicense, setRequiresLicense] = useState(false);
  const [availFrom, setAvailFrom] = useState(null);
  const [availUntil, setAvailUntil] = useState(null);
  const [photos, setPhotos] = useState([]); // mix of remote URLs + local URIs
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    (async () => {
      const v = await getVehicle(vehicleId);
      if (v) {
        setType(v.type || "scooter");
        setTitle(v.title || "");
        setCity(v.city || "");
        setPickupLabel(v.pickupLabel || "");
        setPricePerDay(toPesos(v.pricePerDayCentavos));
        setDeposit(toPesos(v.depositCentavos));
        setRangeKm(v.rangeKm ? String(v.rangeKm) : "");
        setRequiresLicense(!!v.requiresLicense);
        setPhotos(Array.isArray(v.photos) ? v.photos : []);
        setAvailFrom(v.availableFrom ? new Date(v.availableFrom) : null);
        setAvailUntil(v.availableUntil ? new Date(v.availableUntil) : null);
      }
      setLoading(false);
    })();
  }, [editing, vehicleId]);

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to add pictures of your vehicle.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 1,
    });
    if (!result.canceled && result.assets) {
      const uris = result.assets.map((a) => a.uri);
      setPhotos((prev) => [...prev, ...uris].slice(0, 5));
    }
  };

  const removePhoto = (uri) => setPhotos((prev) => prev.filter((p) => p !== uri));

  const onSave = async () => {
    if (!title.trim()) return Alert.alert("Missing title", "Give your vehicle a name.");
    if (!city.trim()) return Alert.alert("Missing city", "Add the city where it's available.");
    if (photos.length === 0) {
      return Alert.alert("Add a photo", "Add at least one real photo of your vehicle.");
    }
    setSaving(true);
    try {
      const payload = {
        type,
        title: title.trim(),
        city: city.trim(),
        pickupLabel: pickupLabel.trim(),
        pricePerDayCentavos: toCentavos(pricePerDay),
        pricePerHourCentavos: Math.round(toCentavos(pricePerDay) / 8),
        depositCentavos: toCentavos(deposit),
        rangeKm: parseInt(rangeKm, 10) || 0,
        requiresLicense,
        availableFrom: availFrom ? availFrom.toISOString() : null,
        availableUntil: availUntil ? availUntil.toISOString() : null,
      };
      // Need the vehicle id to key the photo uploads.
      let id = vehicleId;
      if (!editing) {
        const providerId = await ensureProvider({ city: city.trim() });
        id = await createVehicle({ ...payload, providerId, photos: [] });
      }
      const photoUrls = await uploadVehiclePhotos(id, photos);
      await updateVehicle(id, { ...payload, photos: photoUrls });
      navigation.goBack();
    } catch (e) {
      Alert.alert("Couldn't save", e.message || "Try again.");
      setSaving(false);
    }
  };

  const onDelete = () => {
    Alert.alert("Remove vehicle?", "This will unpublish it from the marketplace.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteVehicle(vehicleId);
            navigation.goBack();
          } catch (e) {
            Alert.alert("Couldn't remove", e.message || "Try again.");
          }
        },
      },
    ]);
  };

  const styles = createStyles(colors, isDark);

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.back, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {editing ? "Edit vehicle" : "Publish a scooter"}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
        <View style={styles.chipsRow}>
          {VEHICLE_TYPES.map((t) => {
            const active = t === type;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setType(t)}
                style={[
                  styles.chip,
                  { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}22` : "transparent" },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? colors.primary : colors.textSecondary }]}>
                  {TYPE_LABEL[t]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {photos.map((uri) => (
            <View key={uri} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => removePhoto(uri)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.photoRemoveTxt}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 5 && (
            <TouchableOpacity
              style={[styles.photoAdd, { borderColor: colors.border }]}
              onPress={pickImages}
              activeOpacity={0.8}
            >
              <Text style={[styles.photoAddPlus, { color: colors.primary }]}>+</Text>
              <Text style={[styles.photoAddTxt, { color: colors.textTertiary }]}>Add photo</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        <Text style={[styles.photoHint, { color: colors.textTertiary }]}>
          Add real photos of your vehicle (up to 5). At least one is required.
        </Text>

        <Field c={colors} st={styles} label="Title" value={title} onChangeText={setTitle} placeholder="e.g. City scooter" />
        <Field c={colors} st={styles} label="City" value={city} onChangeText={setCity} placeholder="e.g. Mexico City" />
        <Field c={colors} st={styles} label="Pickup point" value={pickupLabel} onChangeText={setPickupLabel} placeholder="e.g. Insurgentes metro" />
        <Field c={colors} st={styles} label="Price per day (MXN)" value={pricePerDay} onChangeText={setPricePerDay} placeholder="0" keyboardType="numeric" />
        <Field
          c={colors}
          st={styles}
          label="Security deposit (MXN) — you collect this directly"
          value={deposit}
          onChangeText={setDeposit}
          placeholder="0"
          keyboardType="numeric"
        />
        <Field c={colors} st={styles} label="Range (km, optional)" value={rangeKm} onChangeText={setRangeKm} placeholder="0" keyboardType="numeric" />

        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: colors.text, marginBottom: 0 }]}>Requires a license</Text>
          <Switch
            value={requiresLicense}
            onValueChange={setRequiresLicense}
            trackColor={{ true: colors.primary }}
          />
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Availability window (optional)</Text>
        <View style={styles.datesRow}>
          <DateField
            label="Available from"
            value={availFrom}
            onChange={setAvailFrom}
            onClear={() => setAvailFrom(null)}
            placeholder="Any"
          />
          <DateField
            label="Available until"
            value={availUntil}
            onChange={setAvailUntil}
            onClear={() => setAvailUntil(null)}
            minimumDate={availFrom || undefined}
            placeholder="Any"
          />
        </View>
        <Text style={[styles.photoHint, { color: colors.textTertiary }]}>
          Leave blank to keep it always available. Riders can only book dates inside this window.
        </Text>

        <Text style={[styles.note, { color: colors.textTertiary }]}>
          You rent directly to riders and receive the full price you set. Kinlo adds a small
          service fee for the rider; the deposit, damage and theft are handled between you and the rider.
        </Text>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveTxt}>{editing ? "Save changes" : "Publish"}</Text>
          )}
        </TouchableOpacity>

        {editing && (
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.7}>
            <Text style={[styles.deleteTxt, { color: "#EF4444" }]}>Remove vehicle</Text>
          </TouchableOpacity>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12,
    },
    back: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: "800" },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    field: { marginBottom: 16 },
    label: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
    input: {
      borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
    },
    chipsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    chip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
    chipText: { fontSize: 14, fontWeight: "700" },
    photoRow: { flexDirection: "row", marginBottom: 8 },
    photoWrap: { marginRight: 10, position: "relative" },
    photo: { width: 92, height: 92, borderRadius: 12, backgroundColor: isDark ? "#222" : "#eee" },
    photoRemove: {
      position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12,
      backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center",
    },
    photoRemoveTxt: { color: "#fff", fontSize: 16, fontWeight: "800", lineHeight: 18 },
    photoAdd: {
      width: 92, height: 92, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed",
      alignItems: "center", justifyContent: "center",
    },
    photoAddPlus: { fontSize: 26, fontWeight: "800" },
    photoAddTxt: { fontSize: 11, marginTop: 2 },
    photoHint: { fontSize: 12, marginBottom: 16 },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, marginBottom: 8 },
    datesRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
    note: { fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 20 },
    saveBtn: { borderRadius: 26, paddingVertical: 16, alignItems: "center", justifyContent: "center", minHeight: 54 },
    saveTxt: { color: "#fff", fontSize: 16, fontWeight: "800" },
    deleteBtn: { alignItems: "center", paddingVertical: 16, marginTop: 8 },
    deleteTxt: { fontSize: 15, fontWeight: "700" },
  });
}
