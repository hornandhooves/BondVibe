/**
 * PublishServiceScreen — publish a service to the Kinlo marketplace (Services P0/P1).
 *
 * Reached from the Services tab's "Publish service" FAB (host mode) and from
 * "My services" → Edit. A "service" is a public SessionType (`publicListing:true`)
 * under businesses/{bizId}/sessionTypes — the SAME model the CRM's private
 * sessions use, minus the toggle: publishing from here always sets
 * publicListing:true (there is no "list on marketplace" switch — publishing IS
 * the action). Non-approved hosts hit the become-a-host gate in-place (mirrors
 * MyFleetScreen), because firestore.rules require an approved host to create a
 * public listing and a verified + insured business for at-home (at_customer)
 * services. The UI mirrors that gate; the server is the guarantee.
 */
import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import BecomeHostGate from "../../components/BecomeHostGate";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import useUserRole from "../../hooks/useUserRole";
import { isApprovedHost } from "../../utils/hostGate";
import { createSessionType, updateSessionType, getSessionType } from "../../services/businessSessionsService";
import { getMyBizId, getBusiness } from "../../services/businessService";
import { getHostMembershipPlans } from "../../services/membershipService";
import { SERVICE_VERTICALS } from "../../services/marketplaceService";
import { uploadServicePhotos } from "../../services/storageService";

/** The 3-benefit invitation shown to a not-yet-approved host (mock screen 4). */
export function ServiceHostGate({ navigation, onBack }) {
  const { t } = useTranslation();
  return (
    <BecomeHostGate
      navigation={navigation}
      onBack={onBack}
      title={t("services.gate.title")}
      body={t("services.gate.body")}
      ctaLabel={t("services.gate.cta")}
      note={t("services.gate.note")}
      benefits={[
        { icon: "tag", text: t("services.gate.benefitList") },
        { icon: "events", text: t("services.gate.benefitEvents") },
        { icon: "dollar", text: t("services.gate.benefitStripe") },
      ]}
    />
  );
}

const MAX_PHOTOS = 5;
// E2E (Maestro): the native image picker is non-deterministic, so a test build
// (EXPO_PUBLIC_E2E=1) skips it and adds a fixed bundled asset — see .maestro/README.
const E2E = process.env.EXPO_PUBLIC_E2E === "1";

export default function PublishServiceScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { role, hostApproved, loading: roleLoading } = useUserRole();
  const approved = isApprovedHost({ role, hostApproved });

  // Edit mode passes only the id (serviceId) — never the whole object, so React
  // Navigation state stays serializable and deep-link-safe. No serviceId = create.
  const editId = route?.params?.serviceId || null;
  const [loading, setLoading] = useState(!!editId);

  const [name, setName] = useState("");
  const [vertical, setVertical] = useState(null);
  const [durationMin, setDurationMin] = useState("60");
  const [capacityMax, setCapacityMax] = useState(1);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const [locationMode, setLocationMode] = useState("at_business");
  const [bookingMode, setBookingMode] = useState("slot");
  const [price, setPrice] = useState("");
  const [planPackageId, setPlanPackageId] = useState(null);
  const [city, setCity] = useState("");

  const [hostPlans, setHostPlans] = useState([]);
  const [biz, setBiz] = useState(null);
  const [saving, setSaving] = useState(false);

  // Fetch the service being edited once, by id, then populate the form.
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    getSessionType(editId)
      .then((svc) => {
        if (!alive || !svc) return;
        setName(svc.name || "");
        setVertical(svc.vertical || null);
        setDurationMin(String(svc.durationMin || 60));
        setCapacityMax(svc.capacityMax || 1);
        setDescription(svc.description || "");
        setPhotos(Array.isArray(svc.photos) ? svc.photos : []);
        setLocationMode(svc.locationMode || "at_business");
        setBookingMode(svc.bookingMode || "slot");
        setPrice(svc.priceCents ? String(svc.priceCents / 100) : "");
        setPlanPackageId(svc.planPackageId || null);
        setCity(svc.city || "");
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [editId]);

  const load = useCallback(async () => {
    const [plans, b] = await Promise.all([
      getHostMembershipPlans(getMyBizId(), { activeOnly: true }).catch(() => []),
      getBusiness().catch(() => null),
    ]);
    setHostPlans(Array.isArray(plans) ? plans : []);
    setBiz(b);
  }, []);
  useFocusEffect(useCallback(() => { if (approved) load(); }, [approved, load]));

  const pickImages = async () => {
    if (E2E) {
      // Deterministic stub: add a fixed bundled asset instead of the OS picker.
      const uri = Image.resolveAssetSource(require("../../../assets/icon.png")).uri;
      setPhotos((prev) => [...prev, uri].slice(0, MAX_PHOTOS));
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS,
      quality: 1,
    });
    if (!result.canceled && result.assets) {
      const uris = result.assets.map((a) => a.uri);
      setPhotos((prev) => [...prev, ...uris].slice(0, MAX_PHOTOS));
    }
  };
  const removePhoto = (uri) => setPhotos((prev) => prev.filter((p) => p !== uri));

  const capKind = capacityMax <= 1 ? "one" : "group";
  const GROUP_DEFAULT = 8, GROUP_MIN = 2, GROUP_MAX = 20;
  const setCap = (kind) => setCapacityMax(kind === "one" ? 1 : capacityMax > 1 ? capacityMax : GROUP_DEFAULT);
  const stepCap = (delta) => setCapacityMax((c) => Math.min(GROUP_MAX, Math.max(GROUP_MIN, c + delta)));

  const save = async () => {
    if (!name.trim()) return Alert.alert(t("services.publish.nameRequired"));
    if (!vertical) return Alert.alert(t("services.publish.categoryRequired"));
    // Mirror the firestore.rules gate: an at-home service needs verified+insured.
    if (locationMode === "at_customer" && !(biz && biz.verified && biz.insured)) {
      return Alert.alert(t("services.publish.verifyBlock"));
    }
    setSaving(true);
    const bizId = getMyBizId();
    // Publishing sets publicListing:true implicitly — there is no toggle.
    const base = {
      name: name.trim(),
      capacityMax,
      durationMin: parseInt(durationMin, 10) || 60,
      price,
      description: description.trim() || null,
      publicListing: true,
      vertical,
      locationMode,
      bookingMode,
      city: city.trim(),
      planPackageId: planPackageId || null,
    };
    try {
      let id = editId;
      if (editId) await updateSessionType(editId, { ...base });
      else id = (await createSessionType({ ...base, photos: [] })).id;

      // Best-effort photo upload — an undeployed storage rule (the service-photos
      // path is new in P1) must never block publishing. On failure the listing is
      // still live; we just tell the host their photos didn't make it.
      let photosFailed = false;
      try {
        const urls = await uploadServicePhotos(bizId, id, photos);
        await updateSessionType(id, { photos: urls });
      } catch (e) {
        console.warn("service photo upload failed:", e?.message);
        photosFailed = photos.some((p) => !/^https?:\/\//.test(p));
      }

      const done = () => navigation.goBack();
      if (photosFailed) {
        Alert.alert(t("services.publish.published"), t("services.publish.photosFailed"), [{ text: "OK", onPress: done }]);
      } else {
        Alert.alert(
          t(editId ? "services.publish.saved" : "services.publish.published"),
          t(editId ? "services.publish.savedMsg" : "services.publish.publishedMsg"),
          [{ text: "OK", onPress: done }]
        );
      }
    } catch (e) {
      Alert.alert(t("services.publish.saveError"), e?.message || "");
      setSaving(false);
    }
  };

  const styles = createStyles(colors, isDark);
  const inputStyle = { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text };

  if (!roleLoading && !approved) {
    return (
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ServiceHostGate navigation={navigation} onBack={() => navigation.goBack()} />
      </>
    );
  }

  // Fetching the service being edited (edit-by-id).
  if (loading) {
    return (
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  const Chip = ({ active, label, onPress, testID }) => (
    <TouchableOpacity
      onPress={onPress}
      testID={testID}
      style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.brandSoft : "transparent" }]}
    >
      <Text style={[styles.chipTxt, { color: active ? colors.primary : colors.textSecondary, fontFamily: active ? FONTS.bodyBold : FONTS.bodySemibold }]}>{label}</Text>
    </TouchableOpacity>
  );

  const Segment = ({ options, value, onChange }) => (
    <View style={[styles.segment, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            style={[styles.segmentItem, active && { backgroundColor: colors.brandSoft }]}
            onPress={() => onChange(o.key)}
            testID={o.testID}
          >
            <Text style={[styles.segmentTxt, { color: active ? colors.primary : colors.textSecondary, fontFamily: active ? FONTS.bodyBold : FONTS.bodySemibold }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hit}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.title, { color: colors.text }]}>{t("services.publish.title")}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t("services.publish.subtitle")}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* WHAT ARE YOU OFFERING? */}
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("services.publish.whatTitle")}</Text>
          <TextInput
            style={[styles.input, inputStyle]}
            value={name}
            onChangeText={setName}
            placeholder={t("services.publish.namePlaceholder")}
            placeholderTextColor={colors.textTertiary}
            testID="publish.name"
          />
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("services.publish.category")}</Text>
          <View style={styles.chipsWrap}>
            {SERVICE_VERTICALS.map((v) => (
              <Chip key={v} active={vertical === v} label={t(`marketplace.vertical.${v}`)} onPress={() => setVertical(v)} testID={`cat-${v}`} />
            ))}
          </View>

          {/* DETAILS */}
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("services.publish.detailsTitle")}</Text>
          <View style={styles.detailsRow}>
            <View style={[styles.durationBox, inputStyle]}>
              <Text style={[styles.durationLabel, { color: colors.textTertiary }]}>{t("services.publish.duration")}</Text>
              <View style={styles.durationInner}>
                <TextInput
                  style={[styles.durationInput, { color: colors.text }]}
                  value={durationMin}
                  onChangeText={setDurationMin}
                  keyboardType="number-pad"
                  testID="service-duration"
                />
                <Text style={[styles.durationUnit, { color: colors.textSecondary }]}>{t("services.publish.durationUnit")}</Text>
              </View>
            </View>
            <Segment
              options={[
                { key: "one", label: t("services.publish.capOne"), testID: "cap-one" },
                { key: "group", label: t("services.publish.capGroup"), testID: "cap-group" },
              ]}
              value={capKind}
              onChange={setCap}
            />
          </View>
          {/* Group size is explicit (S-obs-3): never persist an invented 8 silently. */}
          {capKind === "group" && (
            <View style={[styles.stepperRow, inputStyle]}>
              <Text style={[styles.stepperLabel, { color: colors.text }]}>{t("services.publish.groupSize")}</Text>
              <View style={styles.stepperCtrls}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: colors.border }, capacityMax <= GROUP_MIN && { opacity: 0.4 }]}
                  onPress={() => stepCap(-1)}
                  disabled={capacityMax <= GROUP_MIN}
                  testID="cap-minus"
                >
                  <Text style={[styles.stepperSign, { color: colors.text }]}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.stepperValue, { color: colors.text }]} testID="cap-value">{capacityMax}</Text>
                <TouchableOpacity
                  style={[styles.stepperBtn, { borderColor: colors.border }, capacityMax >= GROUP_MAX && { opacity: 0.4 }]}
                  onPress={() => stepCap(1)}
                  disabled={capacityMax >= GROUP_MAX}
                  testID="cap-plus"
                >
                  <Text style={[styles.stepperSign, { color: colors.text }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <TextInput
            style={[styles.input, styles.textarea, inputStyle]}
            value={description}
            onChangeText={setDescription}
            placeholder={t("services.publish.descPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            multiline
            testID="service-desc"
          />
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("services.publish.photos")}</Text>
          <View style={styles.photosRow}>
            {photos.map((uri, i) => (
              <View key={uri} style={styles.photoWrap} testID={`publish.photo.${i}`}>
                <Image source={{ uri }} style={styles.photo} />
                <TouchableOpacity style={[styles.photoRemove, { backgroundColor: colors.background }]} onPress={() => removePhoto(uri)}>
                  <Icon name="close" size={13} color={colors.text} />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <TouchableOpacity style={[styles.photoAdd, { borderColor: colors.border }]} onPress={pickImages} testID="service-add-photo">
                <Icon name="camera" size={18} color={colors.primary} />
                <Text style={[styles.photoAddTxt, { color: colors.textTertiary }]}>{t("services.publish.addPhoto")}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* WHERE DOES IT HAPPEN? */}
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("services.publish.whereTitle")}</Text>
          <View style={styles.chipsWrap}>
            <Chip active={locationMode === "at_business"} label={t("services.publish.locBusiness")} onPress={() => setLocationMode("at_business")} testID="loc-business" />
            <Chip active={locationMode === "at_customer"} label={t("services.publish.locCustomer")} onPress={() => setLocationMode("at_customer")} testID="loc-customer" />
            <Chip active={locationMode === "online"} label={t("services.publish.locOnline")} onPress={() => setLocationMode("online")} testID="loc-online" />
          </View>
          {locationMode === "at_customer" && (
            <View style={[styles.amberNote, { backgroundColor: colors.warnSoft }]}>
              <Icon name="alert" size={15} color={colors.warning} />
              <Text style={[styles.amberTxt, { color: colors.warning }]}>{t("services.publish.verifyNote")}</Text>
            </View>
          )}

          {/* BOOKING & PRICE */}
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("services.publish.bookingTitle")}</Text>
          <Segment
            options={[
              { key: "slot", label: t("services.publish.bookSlot"), testID: "book-slot" },
              { key: "quote", label: t("services.publish.bookQuote"), testID: "book-quote" },
            ]}
            value={bookingMode}
            onChange={setBookingMode}
          />
          {bookingMode === "slot" && (
            <View style={[styles.priceRow, inputStyle]}>
              <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>{t("services.publish.price")}</Text>
              <View style={styles.priceInner}>
                <Text style={[styles.priceCurrency, { color: colors.text }]}>$</Text>
                <TextInput
                  style={[styles.priceInput, { color: colors.text }]}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                  testID="service-price"
                />
              </View>
            </View>
          )}
          {hostPlans.length > 0 && (
            <View style={styles.creditsBlock}>
              <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 0 }]}>{t("services.publish.acceptCredits")}</Text>
              <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>{t("services.publish.linkPlanOptional")}</Text>
              <View style={styles.chipsWrap}>
                <Chip active={!planPackageId} label={t("services.publish.noPlan")} onPress={() => setPlanPackageId(null)} testID="plan-none" />
                {hostPlans.map((p) => (
                  <Chip key={p.id} active={planPackageId === p.id} label={p.name} onPress={() => setPlanPackageId(p.id)} testID={`plan-${p.id}`} />
                ))}
              </View>
            </View>
          )}
          <TextInput
            style={[styles.input, inputStyle, { marginTop: 12 }]}
            value={city}
            onChangeText={setCity}
            placeholder={t("services.publish.city")}
            placeholderTextColor={colors.textTertiary}
            testID="service-city"
          />
          <View style={{ height: 12 }} />
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primary }]}
            activeOpacity={0.9}
            onPress={save}
            disabled={saving}
            testID="service-publish-cta"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaTxt}>{t(editId ? "services.publish.saveCta" : "services.publish.publishCta")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 18, paddingTop: 60, paddingBottom: 10 },
    title: { fontFamily: FONTS.display, fontSize: 22, letterSpacing: -0.4 },
    subtitle: { fontFamily: FONTS.bodyMedium, fontSize: 13, marginTop: 3, lineHeight: 18 },
    content: { paddingHorizontal: 18, paddingBottom: 24 },

    sectionLabel: { fontFamily: FONTS.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 22, marginBottom: 10 },
    fieldLabel: { fontFamily: FONTS.bodyExtra, fontSize: 14, marginTop: 14, marginBottom: 8 },
    fieldHint: { fontFamily: FONTS.bodyMedium, fontSize: 12, marginTop: -4, marginBottom: 8 },

    input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, fontFamily: FONTS.bodyMedium, fontSize: 15 },
    textarea: { minHeight: 84, textAlignVertical: "top", marginTop: 0 },

    chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
    chipTxt: { fontSize: 13 },

    detailsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
    stepperLabel: { fontFamily: FONTS.bodySemibold, fontSize: 14 },
    stepperCtrls: { flexDirection: "row", alignItems: "center", gap: 14 },
    stepperBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    stepperSign: { fontFamily: FONTS.display, fontSize: 20, lineHeight: 22 },
    stepperValue: { fontFamily: FONTS.display, fontSize: 18, letterSpacing: -0.4, minWidth: 26, textAlign: "center" },
    durationBox: { flex: 1, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 9, justifyContent: "center" },
    durationLabel: { fontFamily: FONTS.bodyMedium, fontSize: 11 },
    durationInner: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 2 },
    durationInput: { fontFamily: FONTS.display, fontSize: 18, letterSpacing: -0.4, padding: 0, minWidth: 34 },
    durationUnit: { fontFamily: FONTS.bodyMedium, fontSize: 13 },

    segment: { flex: 1, flexDirection: "row", borderWidth: 1, borderRadius: 13, padding: 3 },
    segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 10 },
    segmentTxt: { fontSize: 12.5, textAlign: "center" },

    photosRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    photoWrap: { width: 72, height: 72 },
    photo: { width: 72, height: 72, borderRadius: 12 },
    photoRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    photoAdd: { width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 3 },
    photoAddTxt: { fontFamily: FONTS.bodySemibold, fontSize: 11 },

    amberNote: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
    amberTxt: { flex: 1, fontFamily: FONTS.bodySemibold, fontSize: 12.5, lineHeight: 17 },

    priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 },
    priceLabel: { fontFamily: FONTS.bodySemibold, fontSize: 14 },
    priceInner: { flexDirection: "row", alignItems: "center", gap: 3 },
    priceCurrency: { fontFamily: FONTS.display, fontSize: 17, letterSpacing: -0.5 },
    priceInput: { fontFamily: FONTS.display, fontSize: 17, letterSpacing: -0.5, padding: 0, minWidth: 70, textAlign: "right" },

    creditsBlock: { marginTop: 16 },

    footer: { borderTopWidth: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: Platform.OS === "ios" ? 30 : 16 },
    cta: {
      height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
      shadowColor: "#7C3AED", shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
    },
    ctaTxt: { color: "#fff", fontFamily: FONTS.bodyExtra, fontSize: 16, letterSpacing: -0.2 },
  });
}
