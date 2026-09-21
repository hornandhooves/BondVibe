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
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, AppState,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../../components/Icon";
import GradientBackground from "../../components/GradientBackground";
import BecomeHostGate from "../../components/BecomeHostGate";
import PlaceAutocomplete from "../../components/PlaceAutocomplete";
import SelectDropdown from "../../components/SelectDropdown";
import { useTheme } from "../../contexts/ThemeContext";
import { FONTS } from "../../constants/theme-tokens";
import useUserRole from "../../hooks/useUserRole";
import useCities from "../../hooks/useCities";
import { isApprovedHost } from "../../utils/hostGate";
import { geocodeAddress } from "../../utils/geocode";
import { createSessionType, updateSessionType, getSessionType } from "../../services/businessSessionsService";
import { getMyBizId, getBusiness, updateBusiness } from "../../services/businessService";
import { setServiceLocation } from "../../services/businessLocationService";
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
// KIN-286 · P4 — same pattern as CreateEventScreen's EVENT_DRAFT_KEY /
// DRAFT_SAVE_DEBOUNCE_MS (local to that file, so redefined here rather than
// imported).
const SERVICE_DRAFT_KEY = "serviceDraft";
const DRAFT_SAVE_DEBOUNCE_MS = 3000;
const DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

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
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const [locationMode, setLocationMode] = useState("at_business");
  const [bookingMode, setBookingMode] = useState("slot");
  const [price, setPrice] = useState("");
  const [planPackageId, setPlanPackageId] = useState(null);
  // KIN-292: holds the SELECTED CITY ID (SelectDropdown's own contract) —
  // SessionType.city stores the LABEL (MarketplaceExploreScreen's city
  // filter matches on the label, not the slug), so it's resolved via
  // getCityLabel() only at save time, never stored as the id.
  const [city, setCity] = useState("");

  const [hostPlans, setHostPlans] = useState([]);
  const [biz, setBiz] = useState(null);
  const [saving, setSaving] = useState(false);
  // KIN-292: the business's OWN studio address — not the service's, and
  // deliberately not part of the draft (see formStateRef/restoreDraft below).
  // Prefilled from `biz` in load(); editable inline via PlaceAutocomplete
  // when locationMode is "at_business".
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState(null);

  const { cities: cityOptions, allCities } = useCities();
  // KIN-295: resolves a STORED id (this service's own city, or a restored
  // draft's) against allCities (active + inactive) — never against
  // cityOptions (active only), or a service left on a city an admin has
  // since deactivated would lose its label and save() would block it with
  // cityRequired for the wrong reason. The dropdown at :582 still offers
  // only `cityOptions`: a host can't newly PICK an inactive city.
  const getCityLabel = (cityId) => allCities.find((loc) => loc.id === cityId)?.label || "";
  // KIN-292 fix: svc.city (the LABEL) can't be resolved to a dropdown id
  // inside the fetch effect below — useCities() starts with STATIC_CITIES
  // (src/utils/locations.js's fallback: only Tulum/Playa del Carmen/Cancún),
  // and the real config/cities catalog arrives later via its own Firestore
  // listener. Editing a service whose city isn't in that fallback would
  // resolve against an incomplete list and leave the dropdown blank forever
  // (cityRequired then blocks saving). The fetch effect just stashes the raw
  // label here; the effect right after it resolves label→id once cityOptions
  // is whatever it currently is, and re-tries whenever cityOptions changes.
  const [pendingCityLabel, setPendingCityLabel] = useState(null);

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
        setDescription(svc.description || "");
        setPhotos(Array.isArray(svc.photos) ? svc.photos : []);
        setLocationMode(svc.locationMode || "at_business");
        setBookingMode(svc.bookingMode || "slot");
        setPrice(svc.priceCents ? String(svc.priceCents / 100) : "");
        setPlanPackageId(svc.planPackageId || null);
        setPendingCityLabel(svc.city || null);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [editId]);

  // Resolves pendingCityLabel → a dropdown id as soon as a matching option
  // shows up in cityOptions — whether that's already true on the first run
  // (fallback happens to include it) or only once the real catalog snapshot
  // lands. Only fires while `city` is still empty, so it can never clobber a
  // choice the host has since made themselves.
  useEffect(() => {
    if (!pendingCityLabel || city) return;
    // KIN-295: allCities, not cityOptions — same reasoning as getCityLabel
    // above, the id being resolved here may belong to a since-deactivated
    // city.
    const match = allCities.find((loc) => loc.label === pendingCityLabel);
    if (match) setCity(match.id);
  }, [allCities, pendingCityLabel, city]);

  // KIN-286 · P4 — draft, mirroring CreateEventScreen's pattern exactly.
  // Create-only (step 4b): editing an existing service never reads or writes
  // this key, same as CreateEventScreen doesn't interfere with editing an
  // existing event.
  const formStateRef = useRef({});
  formStateRef.current = {
    name, vertical, durationMin, description, photos,
    locationMode, bookingMode, price, planPackageId, city,
  };
  const submittedRef = useRef(false);

  const persistDraft = useCallback(() => {
    if (editId) return Promise.resolve();
    const s = formStateRef.current;
    return AsyncStorage.setItem(
      SERVICE_DRAFT_KEY,
      JSON.stringify({ ...s, savedAt: Date.now() }),
    ).catch(() => {});
  }, [editId]);

  const restoreDraft = useCallback((d) => {
    if (typeof d.name === "string") setName(d.name);
    if (d.vertical) setVertical(d.vertical);
    if (typeof d.durationMin === "string") setDurationMin(d.durationMin);
    if (typeof d.description === "string") setDescription(d.description);
    if (Array.isArray(d.photos)) setPhotos(d.photos);
    if (typeof d.locationMode === "string") setLocationMode(d.locationMode);
    if (typeof d.bookingMode === "string") setBookingMode(d.bookingMode);
    if (typeof d.price === "string") setPrice(d.price);
    if (d.planPackageId) setPlanPackageId(d.planPackageId);
    if (typeof d.city === "string") setCity(d.city);
  }, []);

  // Restore-on-mount, same Alert resume/discard shape as CreateEventScreen —
  // this screen has no membership-plan-style detour, so unlike that screen
  // there's only one path (always ask, never silent-restore).
  useFocusEffect(
    useCallback(() => {
      if (editId) return;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(SERVICE_DRAFT_KEY);
          if (!raw) return;
          const d = JSON.parse(raw);
          const fresh = d.savedAt && Date.now() - d.savedAt < DRAFT_MAX_AGE_MS;
          if (!fresh) {
            await AsyncStorage.removeItem(SERVICE_DRAFT_KEY);
            return;
          }
          Alert.alert(
            t("services.publish.draft.resumeTitle"),
            t("services.publish.draft.resumeMsg"),
            [
              {
                text: t("services.publish.draft.discard"),
                style: "destructive",
                onPress: () => AsyncStorage.removeItem(SERVICE_DRAFT_KEY).catch(() => {}),
              },
              {
                text: t("services.publish.draft.resume"),
                onPress: async () => {
                  restoreDraft(d);
                  await AsyncStorage.removeItem(SERVICE_DRAFT_KEY).catch(() => {});
                },
              },
            ],
          );
        } catch {
          // ignore
        }
      })();
    }, [editId, restoreDraft, t])
  );

  // Back-out (header back / swipe) saves the in-progress form as a draft.
  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", () => {
      if (editId || submittedRef.current) return;
      const s = formStateRef.current;
      if (s.name?.trim()) persistDraft();
    });
    return unsub;
  }, [navigation, persistDraft, editId]);

  // Debounced autosave — the backstop for a kill/crash beforeRemove never
  // sees (KIN-153's reasoning, same as CreateEventScreen).
  useEffect(() => {
    if (editId || submittedRef.current) return;
    const s = formStateRef.current;
    if (!s.name?.trim()) return;
    const timer = setTimeout(persistDraft, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    name, vertical, durationMin, description, photos,
    locationMode, bookingMode, price, planPackageId, city, persistDraft, editId,
  ]);

  // AppState: save immediately on backgrounding (most real kills go through
  // background/inactive before terminating).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (editId || submittedRef.current) return;
      if (nextState !== "background" && nextState !== "inactive") return;
      const s = formStateRef.current;
      if (s.name?.trim()) persistDraft();
    });
    return () => sub.remove();
  }, [persistDraft, editId]);

  const load = useCallback(async () => {
    const [plans, b] = await Promise.all([
      getHostMembershipPlans(getMyBizId(), { activeOnly: true }).catch(() => []),
      getBusiness().catch(() => null),
    ]);
    setHostPlans(Array.isArray(plans) ? plans : []);
    setBiz(b);
    // KIN-292: prefill the inline studio-address field from the business
    // itself (not the draft — see formStateRef/restoreDraft).
    if (b) {
      setAddress(b.address || "");
      if (typeof b.latitude === "number" && typeof b.longitude === "number") {
        setCoords({ latitude: b.latitude, longitude: b.longitude });
      }
    }
  }, []);
  useFocusEffect(useCallback(() => { if (approved) load(); }, [approved, load]));

  const pickImages = async () => {
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

  // KIN-292: mirrors CreateEventScreen's own free-text fallback (grep
  // "geocodeAddress" there) via BusinessSetupScreen.js:63's exact pattern —
  // a Places pick already carries lat/lng; typed-with-no-suggestion
  // (PlaceAutocomplete's handleUseTyped) hands back only { description }, so
  // geocode it to still get coordinates.
  const onSelectAddress = async (place) => {
    setAddress(place.description || "");
    if (typeof place.latitude === "number" && typeof place.longitude === "number") {
      setCoords({ latitude: place.latitude, longitude: place.longitude });
    } else {
      setCoords(await geocodeAddress(place.description));
    }
  };

  const save = async () => {
    if (!name.trim()) return Alert.alert(t("services.publish.nameRequired"));
    if (!vertical) return Alert.alert(t("services.publish.categoryRequired"));
    const cityLabel = getCityLabel(city);
    if (!cityLabel) return Alert.alert(t("services.publish.cityRequired"));
    // Mirror the firestore.rules gate: an at-home service needs verified+insured.
    if (locationMode === "at_customer" && !(biz && biz.verified && biz.insured)) {
      return Alert.alert(t("services.publish.verifyBlock"));
    }
    setSaving(true);
    const bizId = getMyBizId();
    // Local, not React state: setBiz() below doesn't take effect until the
    // next render, so the businessLocationRequired check further down (same
    // function execution) needs its OWN synchronous handle on the freshest
    // biz, not the `biz` closure variable.
    let effectiveBiz = biz;
    try {
      // KIN-292: the studio address is the BUSINESS's own, synced here —
      // BEFORE the businessLocationRequired gate below and BEFORE
      // create/updateSessionType — whenever it changed, so a host who just
      // typed it on THIS screen doesn't hit a gate that only the (stale,
      // pre-sync) `biz` would fail. updateBusiness alone would NOT be enough:
      // it never writes area/approxCoords (functions/index.js:3189) — only
      // the setServiceLocation Cloud Function does, in its batch (lines
      // 3218-3244) — so the CF has to actually run.
      if (locationMode === "at_business" && address.trim() && address.trim() !== (biz?.address || "")) {
        await updateBusiness({
          address: address.trim(),
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
        });
        // setServiceLocation never throws — businessLocationService.js:30-38
        // catches internally and resolves {success:false, error} instead, so
        // a try/catch around this wouldn't see a failure. res.success is the
        // only signal (BusinessSetupScreen.js:95 ignores it today — a known
        // gap, not fixed here, see the report).
        const locRes = await setServiceLocation({ bizId, address: address.trim(), exactCoords: coords });
        if (!locRes.success) {
          setSaving(false);
          Alert.alert(t("services.publish.saveError"), locRes.error || "");
          return;
        }
        // Refresh both the React state (for the rest of the screen) and the
        // local handle this same call uses right below — setBiz() alone
        // wouldn't be visible until the next render.
        const freshBiz = await getBusiness(bizId).catch(() => null);
        if (freshBiz) {
          setBiz(freshBiz);
          effectiveBiz = freshBiz;
        }
      }

      // KIN-290: the business needs an exact location set (same field
      // ServiceDetailScreen.js:190 checks) before a service "at my studio" can
      // go live — otherwise KIN-284/288's gate has nothing to unlock. Reads
      // effectiveBiz (see above), so a host who just entered an address in
      // THIS save doesn't get blocked by their own stale state.
      if (locationMode === "at_business" && !(effectiveBiz && (effectiveBiz.area || effectiveBiz.approxCoords))) {
        setSaving(false);
        return Alert.alert(t("services.publish.businessLocationRequired"));
      }

      // Publishing sets publicListing:true implicitly — there is no toggle.
      const base = {
        name: name.trim(),
        capacityMax: 1,
        durationMin: parseInt(durationMin, 10) || 60,
        price,
        description: description.trim() || null,
        publicListing: true,
        vertical,
        locationMode,
        bookingMode,
        city: cityLabel,
        planPackageId: planPackageId || null,
      };
      let id = editId;
      if (editId) await updateSessionType(editId, { ...base });
      else id = (await createSessionType({ ...base, photos: [] })).id;

      // KIN-286 · P4: the core publish/save succeeded — clear the draft here
      // (before the best-effort photo upload below, same point CreateEventScreen
      // clears EVENT_DRAFT_KEY relative to its own image upload).
      submittedRef.current = true;
      await AsyncStorage.removeItem(SERVICE_DRAFT_KEY).catch(() => {});

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
            testID="service-name"
          />
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t("services.publish.category")}</Text>
          <View style={styles.chipsWrap}>
            {SERVICE_VERTICALS.map((v) => (
              <Chip key={v} active={vertical === v} label={t(`marketplace.vertical.${v}`)} onPress={() => setVertical(v)} testID={`cat-${v}`} />
            ))}
          </View>

          {/* DETAILS */}
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{t("services.publish.detailsTitle")}</Text>
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
            {photos.map((uri) => (
              <View key={uri} style={styles.photoWrap}>
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
          {/* KIN-292: the studio address is the BUSINESS's own (BusinessSetupScreen
              also has this field) — editable inline here so a host publishing an
              "at my studio" service doesn't have to leave this screen first. */}
          {locationMode === "at_business" && (
            <>
              <PlaceAutocomplete
                label={t("services.publish.studioAddressLabel")}
                value={address}
                onSelect={onSelectAddress}
              />
              <Text style={[styles.locationHint, { color: colors.textTertiary }]}>
                {t("services.publish.studioAddressHint")}
              </Text>
            </>
          )}
          <SelectDropdown
            label={t("services.publish.city")}
            value={city}
            onValueChange={setCity}
            options={cityOptions}
            placeholder={t("services.publish.city")}
            type="location"
          />

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
          {/* KIN-185 — paid placement. Only offered while EDITING: a service
              that hasn't been created yet has no id to feature, and the
              server refuses to promote one that isn't publicListing:true
              anyway, so offering it at create time would just be a dead
              button. The purchase itself lives in the shared PromoteEvent
              screen (same ladder, same charge, same webhook). */}
          {!!editId && (
            <TouchableOpacity
              style={[styles.featureRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
              activeOpacity={0.85}
              onPress={() =>
                navigation.navigate("PromoteEvent", {
                  bizId: getMyBizId(),
                  sessionTypeId: editId,
                  serviceName: name,
                })
              }
              testID="service-feature-cta"
            >
              <Icon name="ai" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>
                  {t("services.publish.featureCta")}
                </Text>
                <Text style={[styles.featureHint, { color: colors.textSecondary }]}>
                  {t("services.publish.featureHint")}
                </Text>
              </View>
              <Icon name="forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}

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

    durationBox: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 9, justifyContent: "center", marginBottom: 12 },
    durationLabel: { fontFamily: FONTS.bodyMedium, fontSize: 11 },
    durationInner: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 2 },
    durationInput: { fontFamily: FONTS.display, fontSize: 18, letterSpacing: -0.4, padding: 0, minWidth: 34 },
    durationUnit: { fontFamily: FONTS.bodyMedium, fontSize: 13 },
    locationHint: { fontFamily: FONTS.bodyMedium, fontSize: 12, marginTop: 8, marginBottom: 4, lineHeight: 16 },

    segment: { flex: 1, flexDirection: "row", borderWidth: 1, borderRadius: 13, padding: 3 },
    segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 10 },
    segmentTxt: { fontSize: 12.5, textAlign: "center" },

    photosRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    photoWrap: { width: 72, height: 72 },
    photo: { width: 72, height: 72, borderRadius: 12 },
    photoRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    photoAdd: { width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 3 },
    photoAddTxt: { fontFamily: FONTS.bodySemibold, fontSize: 11 },

    featureRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, marginTop: 22 },
    featureTitle: { fontFamily: FONTS.bodyExtra, fontSize: 14 },
    featureHint: { fontFamily: FONTS.bodyMedium, fontSize: 12, marginTop: 2, lineHeight: 16 },

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
