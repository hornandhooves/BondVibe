import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import EventCreatedModal from "../components/EventCreatedModal";
import SelectDropdown from "../components/SelectDropdown";
import PlaceAutocomplete from "../components/PlaceAutocomplete";
import EventImagePicker from "../components/EventImagePicker";
import Icon from "../components/Icon";
import {
  EVENT_CATEGORIES,
  EVENT_LANGUAGES,
} from "../utils/eventCategories";
import useCities from "../hooks/useCities";
import { uploadEventImages } from "../services/storageService";
import { getHostMembershipPlans } from "../services/membershipService";
import { createClass, updateClass, getClass } from "../services/businessClassesService";
import { checkInstructorAvailability, AGENDA_ITEM_KIND } from "../services/businessAgendaService";
import { getMyBizId } from "../services/businessService";
import InstructorPicker from "../components/business/InstructorPicker";
import { buildEventSearchKeywords } from "../utils/eventSearch";
import { checkAccountStatus } from "../services/stripeConnectService";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import RecurrenceModal from "../components/RecurrenceModal";
import { generateRecurringDates, getRecurrenceSummary } from "../utils/recurrenceUtils";
import DraftWithAI from "../components/ai/DraftWithAI";
import DurationWheelModal, { formatDuration } from "../components/DurationWheelModal";

// Recurrence handled by modal

// AsyncStorage key for the in-progress event draft (preserved across the
// "create a membership plan" detour so the host never loses their data).
const EVENT_DRAFT_KEY = "eventDraft";

export default function CreateEventScreen({ navigation, route }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();

  // A "class" reuses this exact screen (kinlo_business/06 FIX 2): mode:'class' +
  // an instructor + weekly-by-default recurrence. Everything else (two-tier
  // pricing, images, membership credits) is identical to an event. Classes save
  // through businessClassesService; events through the events collection.
  const mode = route?.params?.mode === "class" || route?.params?.kind === "class" ? "class" : "event";
  const isClass = mode === "class";
  const editClassId = route?.params?.editClassId || null; // class edit (FIX 7)

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("social");
  const [selectedLanguages, setSelectedLanguages] = useState(["es", "en"]);
  const [selectedCity, setSelectedCity] = useState("tulum");

  // Initialize with tomorrow's date and default time — or a prefill from the
  // Agenda "+" (date + tapped hour), when opened from there (kinlo_business/07).
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(19, 0, 0, 0); // 7 PM
  const prefillStart = route?.params?.prefillStart ? new Date(route.params.prefillStart) : null;

  const [eventDate, setEventDate] = useState(prefillStart || tomorrow);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(tomorrow);

  // Recurrence state
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const [recurrenceConfig, setRecurrenceConfig] = useState({
    type: "none",
    selectedDays: [],
    weekOfMonth: "first",
    monthlyMode: "dayOfWeek",
    dayOfMonth: 1,
    lunarPhase: "full",
    startDate: null,
    endDate: (() => {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 3);
      return endDate.toISOString();
    })(),
    eventCount: 1,
    summary: t("createEvent.oneTimeEvent"),
    previewDates: [],
  });

  const [locationDetail, setLocationDetail] = useState("");
  // Full street address behind the venue name (BUG 3). The field shows the venue
  // NAME ("Estudio VIVO"); this keeps the formatted address for maps/deep-link.
  const [venueAddress, setVenueAddress] = useState("");
  // Coordinates + place id captured from the Google Places picker (optional;
  // when present they let attendees open a precise pin in Maps).
  const [locationCoords, setLocationCoords] = useState(null); // { latitude, longitude }
  const [placeId, setPlaceId] = useState(null);
  const [maxPeople, setMaxPeople] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("180"); // 3h default
  const [showDurationModal, setShowDurationModal] = useState(false);
  // Feature-at-creation: when on, we route the host to the paid promotion flow
  // right after the event is created (featured is set server-side only).
  const [featureAfterCreate, setFeatureAfterCreate] = useState(false);
  const [createdEventId, setCreatedEventId] = useState(null);
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState("");
  // Two-tier pricing (kinlo_business/05 §B): when ON and Paid, the host sets a
  // Local and a General price. `price` stays the canonical General price for
  // backward-compat; `priceLocal` is additive. Locals are charged the local rate.
  const [twoTier, setTwoTier] = useState(false);
  const [priceLocal, setPriceLocal] = useState(""); // MXN integer
  const [priceGeneral, setPriceGeneral] = useState(""); // MXN integer
  // The instructor/staff running it (a staff uid). Required for a class,
  // optional for an event — persisted so the item lands on their Agenda.
  const [instructorUid, setInstructorUid] = useState(route?.params?.instructorUid || "");
  const [instructorName, setInstructorName] = useState("");
  const [loading, setLoading] = useState(false);
  const [eventImages, setEventImages] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdEventTitle, setCreatedEventTitle] = useState("");
  const [createdEventsCount, setCreatedEventsCount] = useState(1);

  // User profile state for Stripe validation
  const [userProfile, setUserProfile] = useState(null);

  // Membership: whether this event can be attended with a membership credit.
  const [acceptsMembership, setAcceptsMembership] = useState(false);
  const [checkingPlans, setCheckingPlans] = useState(false);

  // BUG 27: whether the event is listed in Discover/search (default on =
  // preserves today's behavior). BUG 27.1: the scheduling classification the
  // Agenda uses for the item's category/color. "blocked" (OOO) forces private.
  const [listedPublicly, setListedPublicly] = useState(true);
  const [agendaType, setAgendaType] = useState("general");
  const isBlocked = agendaType === "blocked";
  // A blocked/OOO slot is never public, regardless of the toggle.
  const effectiveListedPublicly = isBlocked ? false : listedPublicly;

  // Filter out "all" from locations for create event
  const { cities: cityOptions } = useCities();

  // Load the user profile — refreshed on every focus so returning from the
  // Stripe Connect screen picks up the latest hostConfig/canCreatePaidEvents.
  const loadUserProfile = useCallback(async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) {
        setUserProfile(userDoc.data());
        return userDoc.data();
      }
    } catch (error) {
      console.error("Error loading user profile:", error);
    }
    return null;
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserProfile();
    }, [loadUserProfile])
  );

  // Class setup (kinlo_business/06 FIX 2/3): default the instructor to the owner
  // and default the recurrence to weekly on the start day. The InstructorPicker
  // loads the staff list itself.
  useEffect(() => {
    if (!isClass) return;
    setInstructorUid((cur) => cur || auth.currentUser?.uid || "");
    setRecurrenceConfig((cfg) =>
      cfg.type === "none"
        ? { ...cfg, type: "weekly", selectedDays: [eventDate.getDay()] }
        : cfg
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClass]);

  // Editing an existing class (FIX 7): load it and prefill the form.
  useEffect(() => {
    if (!editClassId) return;
    (async () => {
      const c = await getClass(editClassId);
      if (!c) return;
      setTitle(c.title || "");
      setDescription(c.description || "");
      if (c.category) setSelectedCategory(c.category);
      if (Array.isArray(c.languages) && c.languages.length) setSelectedLanguages(c.languages);
      if (c.city) setSelectedCity(c.city);
      if (c.location) setLocationDetail(c.location);
      if (Array.isArray(c.images)) setEventImages(c.images);
      setMaxPeople(String(c.capacity || 12));
      setDurationMinutes(String(c.durationMin || 60));
      if (c.instructorUid) setInstructorUid(c.instructorUid);
      if (c.instructorName) setInstructorName(c.instructorName);
      if (c.acceptsMembership) setAcceptsMembership(true);
      if (c.price > 0 || c.twoTier) {
        setIsFree(false);
        if (c.twoTier) {
          setTwoTier(true);
          setPriceLocal(c.priceLocal != null ? String(c.priceLocal) : "");
          setPriceGeneral(String(c.price || ""));
        } else {
          setPrice(String(c.price || ""));
        }
      }
      // Time from the class; recurrence from its weekdays (or one-off date).
      const [h, mn] = String(c.time || "18:00").split(":").map((n) => parseInt(n, 10) || 0);
      const base = c.date ? new Date(c.date) : new Date(eventDate);
      base.setHours(h, mn, 0, 0);
      setEventDate(base);
      if (Array.isArray(c.weekdays) && c.weekdays.length) {
        setRecurrenceConfig((cfg) => ({ ...cfg, type: "weekly", selectedDays: c.weekdays }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editClassId]);

  // Whether the host may create paid events, self-healing a stale flag: if the
  // flag is false but a Stripe account exists, refresh the real status once and
  // re-check. Fixes hosts wrongly blocked after completing/onboarding Stripe.
  const canCreatePaidNow = async () => {
    if (userProfile?.hostConfig?.canCreatePaidEvents) return true;
    if (userProfile?.stripeConnect?.accountId) {
      await checkAccountStatus(auth.currentUser.uid).catch(() => {});
      const fresh = await loadUserProfile();
      return !!fresh?.hostConfig?.canCreatePaidEvents;
    }
    return false;
  };

  // BUG 30 Gap C: keep a live snapshot of the form so the beforeRemove listener
  // can persist a draft with the LATEST values (no stale-closure risk), and a
  // flag so we don't save a draft after a successful create.
  const formStateRef = useRef({});
  formStateRef.current = {
    title, description, selectedCategory, selectedLanguages, selectedCity,
    eventDate, recurrenceConfig, locationDetail, venueAddress, locationCoords,
    placeId, durationMinutes, maxPeople, isFree, price, eventImages,
    acceptsMembership, agendaType, listedPublicly,
  };
  const submittedRef = useRef(false);

  // Persist the in-progress form. `reason` distinguishes the membership-plan
  // detour (silent auto-restore) from a plain back-out (offer Resume/Discard).
  const persistDraft = useCallback((reason) => {
    const s = formStateRef.current;
    return AsyncStorage.setItem(
      EVENT_DRAFT_KEY,
      JSON.stringify({
        ...s,
        eventDate: s.eventDate?.toISOString?.() || null,
        reason,
        savedAt: Date.now(),
      }),
    ).catch(() => {});
  }, []);

  // Restore an in-progress event draft so the host never loses captured data.
  const restoreDraft = useCallback((d) => {
    if (typeof d.title === "string") setTitle(d.title);
    if (typeof d.description === "string") setDescription(d.description);
    if (d.selectedCategory) setSelectedCategory(d.selectedCategory);
    if (Array.isArray(d.selectedLanguages)) setSelectedLanguages(d.selectedLanguages);
    if (d.selectedCity) setSelectedCity(d.selectedCity);
    if (d.eventDate) setEventDate(new Date(d.eventDate));
    if (d.recurrenceConfig) setRecurrenceConfig(d.recurrenceConfig);
    if (typeof d.locationDetail === "string") setLocationDetail(d.locationDetail);
    if (typeof d.venueAddress === "string") setVenueAddress(d.venueAddress);
    if (d.locationCoords) setLocationCoords(d.locationCoords);
    if (d.placeId) setPlaceId(d.placeId);
    if (typeof d.durationMinutes === "string") setDurationMinutes(d.durationMinutes);
    if (typeof d.maxPeople === "string") setMaxPeople(d.maxPeople);
    if (typeof d.isFree === "boolean") setIsFree(d.isFree);
    if (typeof d.price === "string") setPrice(d.price);
    if (Array.isArray(d.eventImages)) setEventImages(d.eventImages);
    if (typeof d.acceptsMembership === "boolean") setAcceptsMembership(d.acceptsMembership);
    if (typeof d.agendaType === "string") setAgendaType(d.agendaType);
    if (typeof d.listedPublicly === "boolean") setListedPublicly(d.listedPublicly);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(EVENT_DRAFT_KEY);
          if (!raw) return;
          const d = JSON.parse(raw);
          const fresh = d.savedAt && Date.now() - d.savedAt < 2 * 60 * 60 * 1000;
          if (!fresh) {
            await AsyncStorage.removeItem(EVENT_DRAFT_KEY);
            return;
          }
          // Membership-plan detour → silent auto-restore (round-trip, expected).
          // A plain back-out → ask before clobbering a fresh form (Gap C).
          if (d.reason === "backout") {
            Alert.alert(
              t("createEvent.draft.resumeTitle"),
              t("createEvent.draft.resumeMsg"),
              [
                {
                  text: t("createEvent.draft.discard"),
                  style: "destructive",
                  onPress: () => AsyncStorage.removeItem(EVENT_DRAFT_KEY).catch(() => {}),
                },
                {
                  text: t("createEvent.draft.resume"),
                  onPress: async () => {
                    restoreDraft(d);
                    await AsyncStorage.removeItem(EVENT_DRAFT_KEY).catch(() => {});
                  },
                },
              ],
            );
          } else {
            restoreDraft(d);
            await AsyncStorage.removeItem(EVENT_DRAFT_KEY);
          }
        } catch (e) {
          // ignore
        }
      })();
    }, [restoreDraft, t])
  );

  // BUG 30 Gap C: backing out of Create Event (header back / swipe) saves the
  // in-progress form as a draft so progress isn't lost — unless a create just
  // succeeded (submittedRef) or the form is effectively empty. Navigating to a
  // pushed sub-screen (e.g. the membership detour) doesn't pop this screen, so
  // beforeRemove doesn't fire there — that path saves its own draft.
  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", () => {
      const s = formStateRef.current;
      const hasContent = !!(s.title?.trim() || s.description?.trim());
      if (!submittedRef.current && hasContent) {
        persistDraft("backout");
      }
    });
    return unsub;
  }, [navigation, persistDraft]);

  const formatDate = (date) => {
    const options = { month: "short", day: "numeric", year: "numeric" };
    return date.toLocaleDateString("en-US", options);
  };

  const formatTime = (date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    const minutesStr = minutes.toString().padStart(2, "0");
    return `${hour12}:${minutesStr} ${ampm}`;
  };

  // Get city label from id
  const getCityLabel = (cityId) => {
    const city = cityOptions.find((loc) => loc.id === cityId);
    return city?.label || cityId;
  };

  // Date picker handlers
  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "set" && selectedDate) {
        setEventDate(selectedDate);
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const confirmDateSelection = () => {
    setEventDate(tempDate);
    setShowDatePicker(false);
  };

  // Time picker handlers
  const onTimeChange = (event, selectedTime) => {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
      if (event.type === "set" && selectedTime) {
        const newDate = new Date(eventDate);
        newDate.setHours(selectedTime.getHours());
        newDate.setMinutes(selectedTime.getMinutes());
        setEventDate(newDate);
      }
    } else {
      if (selectedTime) {
        setTempDate(selectedTime);
      }
    }
  };

  const confirmTimeSelection = () => {
    const newDate = new Date(eventDate);
    newDate.setHours(tempDate.getHours());
    newDate.setMinutes(tempDate.getMinutes());
    setEventDate(newDate);
    setShowTimePicker(false);
  };

  // Toggle "accept membership credits". Requires the host to have at least one
  // active membership plan; otherwise invite them to create one first.
  const handleToggleMembership = async () => {
    if (acceptsMembership) {
      setAcceptsMembership(false);
      return;
    }
    setCheckingPlans(true);
    try {
      const plans = await getHostMembershipPlans(auth.currentUser.uid, {
        activeOnly: true,
      });
      if (plans.length === 0) {
        Alert.alert(
          t("createEvent.membershipPlansAlert.title"),
          t("createEvent.membershipPlansAlert.msg"),
          [
            { text: t("createEvent.membershipPlansAlert.notNow"), style: "cancel" },
            {
              text: t("createEvent.membershipPlansAlert.createPlan"),
              onPress: async () => {
                // Persist the in-progress event so the detour to create a
                // membership plan doesn't lose it (silent-restore on return).
                await persistDraft("membership");
                navigation.navigate("MembershipPlans", { fromEventCreation: true });
              },
            },
          ]
        );
        return;
      }
      setAcceptsMembership(true);
    } finally {
      setCheckingPlans(false);
    }
  };

  // Handle price change with Stripe validation. `setter` defaults to setPrice so
  // existing single-price usage is unchanged; the two-tier inputs pass their own
  // setter to reuse the SAME Stripe guard (kinlo_business/05 §B).
  const handlePriceChange = (priceText, setter = setPrice) => {
    const priceNumber = parseInt(priceText) || 0;

    if (priceNumber > 0) {
      const canCreatePaid = userProfile?.hostConfig?.canCreatePaidEvents;

      if (!canCreatePaid) {
        const hasStripeAccount = !!userProfile?.stripeConnect?.accountId;
        Alert.alert(
          hasStripeAccount ? t("createEvent.stripe.verificationPendingTitle") : t("createEvent.stripe.accountRequiredTitle"),
          hasStripeAccount
            ? t("createEvent.stripe.verificationPendingMsg")
            : t("createEvent.stripe.accountRequiredMsg"),
          [
            { text: t("createEvent.cancel"), style: "cancel" },
            {
              text: hasStripeAccount ? t("createEvent.stripe.checkStatus") : t("createEvent.stripe.connectStripe"),
              onPress: () => navigation.navigate("StripeConnect"),
            },
          ]
        );
        return;
      }
    }

    setter(priceText);
  };

  // Generate recurring dates handled by recurrenceUtils

  const handleCreateEvent = async (skipAvailabilityCheck = false, skipDatesIso = null) => {
    console.log("✨ Create Event clicked");

    // Validation
    if (!title.trim()) {
      Alert.alert(t("createEvent.validation.missingInfoTitle"), t("createEvent.validation.missingTitleMsg"));
      return;
    }
    if (!description.trim()) {
      Alert.alert(t("createEvent.validation.missingInfoTitle"), t("createEvent.validation.missingDescriptionMsg"));
      return;
    }
    if (isClass && !instructorUid) {
      Alert.alert(t("createEvent.validation.missingInfoTitle"), t("createEvent.validation.missingInstructorMsg"));
      return;
    }
    if (!locationDetail.trim()) {
      Alert.alert(
        t("createEvent.validation.missingInfoTitle"),
        t("createEvent.validation.missingVenueMsg")
      );
      return;
    }
    // A blocked/OOO slot needs no capacity or price (BUG 27.1) — relax those.
    if (!isBlocked && (!maxPeople || parseInt(maxPeople) < 1)) {
      Alert.alert(t("createEvent.validation.invalidMaxPeopleTitle"), t("createEvent.validation.invalidMaxPeopleMsg"));
      return;
    }
    if (!isBlocked && !isFree && twoTier) {
      if (!priceLocal || parseInt(priceLocal, 10) <= 0 || !priceGeneral || parseInt(priceGeneral, 10) <= 0) {
        Alert.alert(
          t("createEvent.validation.invalidPriceTitle"),
          t("createEvent.twoTier.invalidMsg")
        );
        return;
      }
    } else if (!isBlocked && !isFree && (!price || parseFloat(price) <= 0)) {
      Alert.alert(
        t("createEvent.validation.invalidPriceTitle"),
        t("createEvent.validation.invalidPriceMsg")
      );
      return;
    }

    // Validate paid events require Stripe (self-heals a stale flag).
    const eventPrice = parseInt(price) || 0;
    if (eventPrice > 0) {
      const canCreatePaid = await canCreatePaidNow();
      if (!canCreatePaid) {
        Alert.alert(
          t("createEvent.stripe.cannotCreatePaidTitle"),
          t("createEvent.stripe.cannotCreatePaidMsg"),
          [
            { text: t("createEvent.cancel"), style: "cancel" },
            {
              text: t("createEvent.stripe.goToSettings"),
              onPress: () => navigation.navigate("StripeConnect"),
            },
          ]
        );
        return;
      }
    }

    // Validate datetime is in the future
    if (eventDate <= new Date()) {
      Alert.alert(
        t("createEvent.validation.invalidDateTitle"),
        t("createEvent.validation.invalidDateMsg")
      );
      return;
    }

    // Validate recurrence end date
    if (recurrenceConfig.type !== "none" && new Date(recurrenceConfig.endDate) <= eventDate) {
      Alert.alert(
        t("createEvent.validation.invalidEndDateTitle"),
        t("createEvent.validation.invalidEndDateMsg")
      );
      return;
    }

    // Instructor availability (BUG 6 / 30) — warn-and-allow before writing.
    // Validate EACH recurrence occurrence (Gap B), not just the first date, so a
    // series that clashes on some dates surfaces a per-date summary. Blocked/OOO
    // slots now count (Gap A). Warn-and-allow throughout.
    const isRecurringSubmit = recurrenceConfig.type !== "none";
    const occurrences = isRecurringSubmit
      ? generateRecurringDates(eventDate, recurrenceConfig)
      : [eventDate];
    // An unassigned event lands on the OWNER's agenda day (businessAgendaService
    // treats instructorUid === bizId as the owner, and unassigned items fall to
    // that day). So when no instructor is picked, check the owner's day (bizId)
    // — otherwise event-vs-event conflicts on the owner's calendar were never
    // detected (the check only ran when an instructor was assigned). The
    // out-of-hours warning stays tied to an explicitly-assigned instructor to
    // avoid spurious working-hours warnings for casual event creation.
    const ownerUid = getMyBizId();
    const checkUid = instructorUid || ownerUid;
    if (!skipAvailabilityCheck && checkUid) {
      const durationMin = parseInt(durationMinutes, 10) || 180;
      const hm = (d) => { const x = new Date(d); return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };
      // Probe up to a horizon so a long/unbounded series stays snappy.
      const probe = occurrences.slice(0, 26);
      const conflicts = [];
      for (const occ of probe) {
        const avail = await checkInstructorAvailability({ instructorUid: checkUid, instructorName, start: occ, durationMin });
        if (avail.conflict && avail.conflictItem) {
          conflicts.push({ date: occ, item: avail.conflictItem });
        } else if (instructorUid && avail.outOfHours && avail.workingHours) {
          conflicts.push({ date: occ, outOfHours: avail.workingHours });
        }
      }

      if (conflicts.length > 0) {
        // Single (non-recurring) event → the existing Cancel / Book anyway prompt.
        if (!isRecurringSubmit) {
          const c = conflicts[0];
          const msgs = [];
          if (c.item) {
            const isBlocked = c.item.kind === AGENDA_ITEM_KIND.BLOCKED;
            msgs.push(t(isBlocked ? "business.agenda.conflictBlockedMsg" : "business.agenda.conflictMsg", {
              name: instructorName || t("business.agenda.you"),
              title: c.item.title,
              range: `${hm(c.item.start)}–${hm(c.item.end)}`,
            }));
          }
          if (c.outOfHours) {
            msgs.push(t("business.agenda.outOfHoursMsg", { start: c.outOfHours.start, end: c.outOfHours.end }));
          }
          Alert.alert(t("business.agenda.placementWarnTitle"), msgs.join("\n\n"), [
            { text: t("business.common.cancel"), style: "cancel" },
            { text: t("business.agenda.continueAnyway"), onPress: () => handleCreateEvent(true) },
          ]);
          return;
        }

        // Recurring → per-date summary + Book anyway / Skip conflicting / Go back.
        const fmtDate = (d) =>
          new Date(d).toLocaleDateString(i18n.language, { weekday: "short", month: "short", day: "numeric" });
        const lines = conflicts.map((c) =>
          c.item
            ? `${fmtDate(c.date)} · ${c.item.title} ${hm(c.item.start)}`
            : `${fmtDate(c.date)} · ${t("createEvent.recurringConflict.outOfHours")}`,
        );
        const skipIso = conflicts.map((c) => c.date.toISOString());
        const cleanCount = occurrences.length - conflicts.length;
        const buttons = [
          { text: t("createEvent.recurringConflict.bookAnyway"), onPress: () => handleCreateEvent(true) },
        ];
        if (cleanCount > 0) {
          buttons.push({ text: t("createEvent.recurringConflict.skip"), onPress: () => handleCreateEvent(true, skipIso) });
        }
        buttons.push({ text: t("createEvent.recurringConflict.goBack"), style: "cancel" });
        Alert.alert(
          t("createEvent.recurringConflict.title"),
          t("createEvent.recurringConflict.summary", { count: conflicts.length, total: occurrences.length }) +
            "\n\n" + lines.join("\n"),
          buttons,
        );
        return;
      }
    }

    setLoading(true);
    console.log("📅 Creating event...");

    try {
      // Fetch user data for hostName
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.data();

      const user = auth.currentUser;
      if (!user) {
        Alert.alert(t("createEvent.validation.genericErrorTitle"), t("createEvent.validation.notLoggedInMsg"));
        setLoading(false);
        return;
      }

      // Build full location string: "Venue, City"
      const fullLocation = `${locationDetail.trim()}, ${getCityLabel(
        selectedCity
      )}`;

      // Generate recurrence group ID if recurring
      const recurrenceGroupId =
        recurrenceConfig.type !== "none"
          ? `recurrence_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`
          : null;

      // Get all dates for recurring events
      let eventDates =
        recurrenceConfig.type !== "none"
          ? generateRecurringDates(eventDate, recurrenceConfig)
          : [eventDate];

      // BUG 30 Gap B: "Skip conflicting dates" — omit the occurrences the host
      // chose to skip (regeneration is deterministic, so ISO strings match).
      if (Array.isArray(skipDatesIso) && skipDatesIso.length) {
        const skip = new Set(skipDatesIso);
        eventDates = eventDates.filter((d) => !skip.has(d.toISOString()));
      }

      console.log(`📅 Creating ${eventDates.length} event(s)...`);

      // Limit to prevent too many events
      if (eventDates.length > 52) {
        Alert.alert(
          t("createEvent.validation.tooManyEventsTitle"),
          t("createEvent.validation.tooManyEventsMsg")
        );
        setLoading(false);
        return;
      }

      // Base event data
      const baseEventData = {
        title: title.trim(),
        description: description.trim(),
        category: selectedCategory,
        languages: selectedLanguages,
        city: selectedCity,
        location: fullLocation,
        // Make the event searchable in discovery immediately (kinlo_business/07
        // FIX 9) — the onEventWritten trigger also maintains this on edits.
        // BUG 27: only publicly-listed events carry searchKeywords; private
        // ones write an empty array so they never surface in discovery/search.
        searchKeywords: effectiveListedPublicly
          ? buildEventSearchKeywords({
              title: title.trim(),
              location: fullLocation,
              city: selectedCity,
              category: selectedCategory,
            })
          : [],
        // BUG 27 / 27.1: visibility + agenda classification persisted on the doc.
        listedPublicly: effectiveListedPublicly,
        agendaType,
        // Optional precise pin from the Places picker (null when typed free-text).
        locationCoords: locationCoords || null,
        placeId: placeId || null,
        // Full street address kept behind the venue name (BUG 3) for maps.
        venueAddress: venueAddress || null,
        // Event length in minutes (drives the "after event" matching window).
        durationMinutes: parseInt(durationMinutes, 10) || 180,
        maxPeople: parseInt(maxPeople) || 0,
        // General price stays canonical (everything that reads `price` keeps
        // working). `priceLocal`/`twoTier` are additive (kinlo_business/05 §B).
        price: isFree ? 0 : twoTier ? parseInt(priceGeneral, 10) : parseFloat(price),
        priceLocal: !isFree && twoTier ? parseInt(priceLocal, 10) : null,
        twoTier: !isFree && twoTier,
        currency: "MXN",
        // Instructor binding (kinlo_business/06 FIX 3): persist on the event too
        // (optional) so it can land on that staff member's Agenda.
        kind: mode,
        instructorUid: instructorUid || null,
        instructorName: instructorName || null,
        hostName:
          userData?.fullName ||
          userData?.name ||
          userData?.displayName ||
          t("eventDetail.defaultHostName"),
        creatorId: user.uid,
        acceptsMembership: acceptsMembership,
        creditCost: 1,
        attendees: [],
        participantCount: 0,
        status: "active",
        isRecurring: recurrenceConfig.type !== "none",
        recurrenceType: recurrenceConfig.type !== "none" ? recurrenceConfig.type : null,
        recurrenceGroupId: recurrenceGroupId,
        recurrenceEndDate: recurrenceConfig.type !== "none" ? recurrenceConfig.endDate : null,
        recurrenceConfig: recurrenceConfig.type !== "none" ? {
          selectedDays: recurrenceConfig.selectedDays,
          weekOfMonth: recurrenceConfig.weekOfMonth,
          monthlyMode: recurrenceConfig.monthlyMode,
          dayOfMonth: recurrenceConfig.dayOfMonth,
          lunarPhase: recurrenceConfig.lunarPhase,
        } : null,
      };

      // A class saves through the classes service (kinlo_business/06 FIX 2), with
      // the full event-shaped payload. Recurrence weekdays → the class schedule.
      if (isClass) {
        const pad2 = (n) => String(n).padStart(2, "0");
        const weekdays = recurrenceConfig.type !== "none" && Array.isArray(recurrenceConfig.selectedDays)
          ? recurrenceConfig.selectedDays
          : [];
        const classPayload = {
          title: title.trim(),
          description: description.trim(),
          category: selectedCategory,
          languages: selectedLanguages,
          city: selectedCity,
          location: fullLocation,
          instructorUid: instructorUid || null,
          instructorName: instructorName || null,
          weekdays,
          date: weekdays.length === 0 ? eventDate.toISOString() : null,
          time: `${pad2(eventDate.getHours())}:${pad2(eventDate.getMinutes())}`,
          durationMin: parseInt(durationMinutes, 10) || 60,
          capacity: parseInt(maxPeople, 10) || 12,
          price: baseEventData.price,
          priceLocal: baseEventData.priceLocal,
          twoTier: baseEventData.twoTier,
          currency: "MXN",
          acceptsMembership,
          creditCost: 1,
          // BUG 27 / 27.1: carry visibility + agenda classification (mirrors
          // the event payload).
          listedPublicly: effectiveListedPublicly,
          agendaType,
        };
        // Edit updates the existing class (FIX 7); otherwise create a new one.
        let created = null;
        if (editClassId) await updateClass(editClassId, classPayload);
        else created = await createClass(classPayload);
        const classId = editClassId || created.id;
        if (eventImages.length > 0) {
          try {
            const urls = await uploadEventImages(classId, eventImages);
            await updateClass(classId, { images: urls });
          } catch (imageError) {
            console.error("⚠️ Class image upload failed:", imageError);
          }
        }
        submittedRef.current = true;
        await AsyncStorage.removeItem(EVENT_DRAFT_KEY).catch(() => {});
        setCreatedEventTitle(title.trim());
        setCreatedEventsCount(1);
        setShowSuccessModal(true);
        setLoading(false);
        return;
      }

      // Create events
      if (eventDates.length === 1) {
        const eventData = {
          ...baseEventData,
          date: eventDates[0].toISOString(),
          images: [], // Will be updated after upload
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const eventDocRef = await addDoc(collection(db, "events"), eventData);
        setCreatedEventId(eventDocRef.id);

        // Upload images if any
        if (eventImages.length > 0) {
          console.log(`📸 Uploading ${eventImages.length} images...`);
          try {
            const imageUrls = await uploadEventImages(
              eventDocRef.id,
              eventImages
            );
            await updateDoc(eventDocRef, { images: imageUrls });
            console.log("✅ Images uploaded and saved to event");
          } catch (imageError) {
            console.error("⚠️ Error uploading images:", imageError);
            // Event was created, just images failed - don't block
            Alert.alert(
              t("createEvent.validation.partialSuccessTitle"),
              t("createEvent.validation.partialSuccessMsg")
            );
          }
        }
      } else {
        // For recurring events, only add images to the first event
        const batchSize = 500;
        let firstEventId = null;

        for (let i = 0; i < eventDates.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = eventDates.slice(i, i + batchSize);

          chunk.forEach((date, index) => {
            const eventRef = doc(collection(db, "events"));
            if (i === 0 && index === 0) {
              firstEventId = eventRef.id;
            }
            const eventData = {
              ...baseEventData,
              date: date.toISOString(),
              images: [], // Will be updated for first event
              eventIndex: i + index + 1,
              totalInSeries: eventDates.length,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            batch.set(eventRef, eventData);
          });

          await batch.commit();
        }

        // Upload images and apply to ALL recurring events
        if (eventImages.length > 0 && firstEventId) {
          console.log(
            `📸 Uploading ${eventImages.length} images for recurring series...`
          );
          try {
            const imageUrls = await uploadEventImages(
              firstEventId,
              eventImages
            );
            
            // Update ALL events in the series with the same images
            const seriesQuery = query(
              collection(db, "events"),
              where("recurrenceGroupId", "==", recurrenceGroupId)
            );
            const seriesSnapshot = await getDocs(seriesQuery);
            
            const updateBatch = writeBatch(db);
            seriesSnapshot.docs.forEach((docSnap) => {
              updateBatch.update(docSnap.ref, { images: imageUrls });
            });
            await updateBatch.commit();
            
            console.log(`✅ Images uploaded and applied to ${seriesSnapshot.docs.length} events`);
          } catch (imageError) {
            console.error("⚠️ Error uploading images:", imageError);
          }
        }
        // Feature-at-create promotes the first event of the series.
        setCreatedEventId(firstEventId);
      }

      // Event created — drop any saved draft (and suppress the back-out save).
      submittedRef.current = true;
      await AsyncStorage.removeItem(EVENT_DRAFT_KEY).catch(() => {});

      setCreatedEventTitle(title.trim());
      setCreatedEventsCount(eventDates.length);
      setShowSuccessModal(true);
    } catch (error) {
      console.error("❌ Error creating event:", error);
      Alert.alert(t("createEvent.validation.genericErrorTitle"), t("createEvent.validation.createFailedMsg"));
    } finally {
      setLoading(false);
    }
  };

  // iOS Date Picker Modal
  const renderIOSDatePicker = () => (
    <Modal
      visible={showDatePicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowDatePicker(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.pickerModal,
            { backgroundColor: isDark ? "#1a1a2e" : "#ffffff" },
          ]}
        >
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowDatePicker(false)}>
              <Text
                style={[styles.pickerCancel, { color: colors.textSecondary }]}
              >
                {t("createEvent.cancel")}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              {t("createEvent.selectDate")}
            </Text>
            <TouchableOpacity onPress={confirmDateSelection}>
              <Text style={[styles.pickerDone, { color: colors.primary }]}>
                {t("createEvent.done")}
              </Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="spinner"
            onChange={onDateChange}
            minimumDate={new Date()}
            textColor={colors.text}
            themeVariant={isDark ? "dark" : "light"}
            style={styles.iosPicker}
          />
        </View>
      </View>
    </Modal>
  );

  // iOS Time Picker Modal
  const renderIOSTimePicker = () => (
    <Modal
      visible={showTimePicker}
      transparent
      animationType="slide"
      onRequestClose={() => setShowTimePicker(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.pickerModal,
            { backgroundColor: isDark ? "#1a1a2e" : "#ffffff" },
          ]}
        >
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowTimePicker(false)}>
              <Text
                style={[styles.pickerCancel, { color: colors.textSecondary }]}
              >
                {t("createEvent.cancel")}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              {t("createEvent.selectTime")}
            </Text>
            <TouchableOpacity onPress={confirmTimeSelection}>
              <Text style={[styles.pickerDone, { color: colors.primary }]}>
                {t("createEvent.done")}
              </Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={tempDate}
            mode="time"
            display="spinner"
            onChange={onTimeChange}
            textColor={colors.text}
            themeVariant={isDark ? "dark" : "light"}
            style={styles.iosPicker}
          />
        </View>
      </View>
    </Modal>
  );

  // iOS End Date Picker Modal
  
  const styles = createStyles(colors);

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Icon name="back" size={28} color={colors.text} type="ui" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isClass ? (editClassId ? t("createEvent.editClassTitle") : t("createEvent.classHeaderTitle")) : t("createEvent.headerTitle")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Host Copilot (ai_features/12): idea → full draft + price/turnout */}
        <DraftWithAI
          navigation={navigation}
          onApply={(d) => {
            setTitle(d.title);
            setDescription(d.description);
            if (d.priceSuggestion?.amount) {
              setIsFree(false);
              setPrice(String(d.priceSuggestion.amount));
            }
          }}
        />

        {/* Type — drives the Agenda category/color (BUG 27.1). "Blocked time"
            (OOO) makes the event private automatically. */}
        <SelectDropdown
          label={t("createEvent.agendaType.label")}
          value={agendaType}
          onValueChange={setAgendaType}
          options={[
            { id: "general", label: t("createEvent.agendaType.general") },
            { id: "group_session", label: t("createEvent.agendaType.group_session") },
            { id: "private_session", label: t("createEvent.agendaType.private_session") },
            { id: "blocked", label: t("createEvent.agendaType.blocked") },
          ]}
          placeholder={t("createEvent.agendaType.placeholder")}
        />

        {/* Title */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>{t("createEvent.titleLabel")}</Text>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder={t("createEvent.titlePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={title}
              onChangeText={setTitle}
            />
          </View>
        </View>

        {/* Event Images */}
        <EventImagePicker
          images={eventImages}
          onImagesChange={setEventImages}
        />

        {/* Description */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>
            {t("createEvent.descriptionLabel")}
          </Text>
          <View
            style={[
              styles.textAreaWrapper,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              style={[styles.textArea, { color: colors.text }]}
              placeholder={t("createEvent.descriptionPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
          <Text style={[styles.charCount, { color: colors.textTertiary }]}>
            {description.length}/500
          </Text>
        </View>

        {/* Instructor (kinlo_business/06 FIX 3) — required for a class, optional
            for an event. Binds the item to a staff member for the Agenda. */}
        <InstructorPicker
          value={instructorUid}
          onChange={(uid, name) => { setInstructorUid(uid); setInstructorName(name); }}
          label={isClass ? t("createEvent.instructorLabel") : t("createEvent.instructorOptionalLabel")}
          placeholder={t("createEvent.instructorPlaceholder")}
          t={t}
        />

        {/* Category Dropdown */}
        <SelectDropdown
          label={t("createEvent.communityLabel")}
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          options={EVENT_CATEGORIES}
          placeholder={t("createEvent.selectCommunity")}
          type="category"
        />

        {/* Language Dropdown (Multi-select) */}
        <SelectDropdown
          label={t("createEvent.languagesLabel")}
          value={selectedLanguages}
          onValueChange={setSelectedLanguages}
          options={EVENT_LANGUAGES}
          placeholder={t("createEvent.selectLanguages")}
          type="language"
          multiSelect
        />

        {/* City Dropdown */}
        <SelectDropdown
          label={t("createEvent.cityLabel")}
          value={selectedCity}
          onValueChange={setSelectedCity}
          options={cityOptions}
          placeholder={t("createEvent.selectCity")}
          type="location"
        />

        {/* Specific Location/Venue — Google Places search (autofills address) */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>
            {t("createEvent.venueLabel")}
          </Text>
          <PlaceAutocomplete
            value={locationDetail}
            placeholder={t("createEvent.venuePlaceholder")}
            onSelect={(place) => {
              // Show the venue NAME in the field (BUG 3); keep the full address
              // separately for the map/deep-link. Free-text has no name → the
              // typed text is both the display and there's no distinct address.
              const displayName = place.name || place.address || place.description || "";
              setLocationDetail(displayName);
              setVenueAddress(
                place.address && place.address !== displayName ? place.address : ""
              );
              if (
                typeof place.latitude === "number" &&
                typeof place.longitude === "number"
              ) {
                setLocationCoords({
                  latitude: place.latitude,
                  longitude: place.longitude,
                });
              } else {
                setLocationCoords(null);
              }
              setPlaceId(place.placeId || null);
            }}
          />
        </View>

        {/* Event Frequency */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>{t("createEvent.eventFrequency")}</Text>
          <TouchableOpacity
            style={[
              styles.recurrenceButton,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: recurrenceConfig.type !== "none" ? colors.primary : colors.border,
                borderWidth: recurrenceConfig.type !== "none" ? 2 : 1,
              },
            ]}
            onPress={() => setShowRecurrenceModal(true)}
          >
            <View style={styles.recurrenceButtonContent}>
              <Icon
                name="calendar"
                size={20}
                color={recurrenceConfig.type !== "none" ? colors.primary : colors.textSecondary}
                type="ui"
              />
              <View style={styles.recurrenceButtonText}>
                <Text
                  style={[
                    styles.recurrenceLabel,
                    { color: recurrenceConfig.type !== "none" ? colors.primary : colors.text },
                  ]}
                >
                  {recurrenceConfig.type === "none" ? t("createEvent.oneTime") : recurrenceConfig.summary}
                </Text>
              </View>
            </View>
            <Icon name="chevronRight" size={20} color={colors.textSecondary} type="ui" />
          </TouchableOpacity>
        </View>

        {/* Date and Time */}
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              {recurrenceConfig.type !== "none" ? t("createEvent.startDateLabel") : t("createEvent.dateLabel")}
            </Text>
            <TouchableOpacity
              style={[
                styles.pickerButton,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                setTempDate(eventDate);
                setShowDatePicker(true);
              }}
            >
              <Text style={[styles.pickerText, { color: colors.text }]}>
                {formatDate(eventDate)}
              </Text>
              <Icon
                name="calendar"
                size={20}
                color={colors.textSecondary}
                type="ui"
              />
            </TouchableOpacity>
          </View>

          <View style={[styles.field, { flex: 1, marginLeft: 8 }]}>
            <Text style={[styles.label, { color: colors.text }]}>{t("createEvent.timeLabel")}</Text>
            <TouchableOpacity
              style={[
                styles.pickerButton,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                setTempDate(eventDate);
                setShowTimePicker(true);
              }}
            >
              <Text style={[styles.pickerText, { color: colors.text }]}>
                {formatTime(eventDate)}
              </Text>
              <Icon
                name="clock"
                size={20}
                color={colors.textSecondary}
                type="ui"
              />
            </TouchableOpacity>
          </View>
        </View>

        

        {/* Free/Paid Toggle */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>{t("createEvent.eventType")}</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                {
                  backgroundColor: isFree
                    ? `${colors.primary}33`
                    : colors.surfaceGlass,
                  borderColor: isFree ? colors.primary : colors.border,
                  borderWidth: isFree ? 2 : 1,
                },
              ]}
              onPress={() => {
                setIsFree(true);
                setPrice("");
                setAcceptsMembership(false);
              }}
            >
              <Icon
                name="gift"
                size={20}
                color={isFree ? colors.primary : colors.text}
                type="ui"
              />
              <Text
                style={[
                  styles.toggleLabel,
                  { color: isFree ? colors.primary : colors.text },
                ]}
              >
                {t("createEvent.free")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toggleButton,
                {
                  backgroundColor: !isFree
                    ? `${colors.primary}33`
                    : colors.surfaceGlass,
                  borderColor: !isFree ? colors.primary : colors.border,
                  borderWidth: !isFree ? 2 : 1,
                },
              ]}
              onPress={() => setIsFree(false)}
            >
              <Icon
                name="dollar"
                size={20}
                color={!isFree ? colors.primary : colors.text}
                type="ui"
              />
              <Text
                style={[
                  styles.toggleLabel,
                  { color: !isFree ? colors.primary : colors.text },
                ]}
              >
                {t("createEvent.paid")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Two-tier pricing (kinlo_business/05 §B) — only for paid events */}
        {!isFree && (
          <View style={styles.field}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setTwoTier((v) => !v)}
              style={[
                styles.membershipToggle,
                {
                  backgroundColor: twoTier ? `${colors.primary}1A` : colors.surfaceGlass,
                  borderColor: twoTier ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.label, { color: colors.text, marginBottom: 2 }]}>
                  {t("createEvent.twoTier.label")}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {t("createEvent.twoTier.hint")}
                </Text>
              </View>
              <View style={[styles.switchTrack, { backgroundColor: twoTier ? colors.primary : colors.border }]}>
                <View style={[styles.switchKnob, { alignSelf: twoTier ? "flex-end" : "flex-start" }]} />
              </View>
            </TouchableOpacity>

            {twoTier && (
              <View style={[styles.row, { marginTop: 12, marginBottom: 0 }]}>
                <View style={[styles.field, { flex: 1, marginRight: 8, marginBottom: 0 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>{t("createEvent.twoTier.localLabel")}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                    <Icon name="location" size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                    <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: 14, marginRight: 6 }}>MX$</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="80"
                      placeholderTextColor={colors.textTertiary}
                      value={priceLocal}
                      onChangeText={(txt) => handlePriceChange(txt, setPriceLocal)}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>
                </View>
                <View style={[styles.field, { flex: 1, marginLeft: 8, marginBottom: 0 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>{t("createEvent.twoTier.generalLabel")}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: colors.surfaceGlass, borderColor: colors.border }]}>
                    <Icon name="globe" size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
                    <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: 14, marginRight: 6 }}>MX$</Text>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="120"
                      placeholderTextColor={colors.textTertiary}
                      value={priceGeneral}
                      onChangeText={(txt) => handlePriceChange(txt, setPriceGeneral)}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Accept membership credits — only for paid events */}
        <View style={styles.field}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleToggleMembership}
            disabled={checkingPlans || isFree}
            style={[
              styles.membershipToggle,
              {
                backgroundColor:
                  acceptsMembership && !isFree
                    ? `${colors.primary}1A`
                    : colors.surfaceGlass,
                borderColor:
                  acceptsMembership && !isFree ? colors.primary : colors.border,
                opacity: isFree ? 0.5 : 1,
              },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.label, { color: colors.text, marginBottom: 2 }]}>
                {t("createEvent.acceptMembershipCredits")}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {isFree
                  ? t("createEvent.membershipOnlyPaid")
                  : t("createEvent.membershipLetMembers")}
              </Text>
            </View>
            {checkingPlans ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View
                style={[
                  styles.switchTrack,
                  {
                    backgroundColor:
                      acceptsMembership && !isFree ? colors.primary : colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.switchKnob,
                    {
                      alignSelf:
                        acceptsMembership && !isFree ? "flex-end" : "flex-start",
                    },
                  ]}
                />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* List event publicly — gates discovery/search (BUG 27). Hidden for a
            blocked/OOO slot, which is always private. */}
        {!isBlocked && (
          <View style={styles.field}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setListedPublicly((v) => !v)}
              style={[
                styles.membershipToggle,
                {
                  backgroundColor: listedPublicly
                    ? `${colors.primary}1A`
                    : colors.surfaceGlass,
                  borderColor: listedPublicly ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.label, { color: colors.text, marginBottom: 2 }]}>
                  {t("createEvent.listPublicly")}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {t("createEvent.listPubliclyDesc")}
                </Text>
              </View>
              <View
                style={[
                  styles.switchTrack,
                  { backgroundColor: listedPublicly ? colors.primary : colors.border },
                ]}
              >
                <View
                  style={[
                    styles.switchKnob,
                    { alignSelf: listedPublicly ? "flex-end" : "flex-start" },
                  ]}
                />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Feature this event — routes to the paid promotion flow after create */}
        <View style={styles.field}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setFeatureAfterCreate((v) => !v)}
            style={[
              styles.membershipToggle,
              {
                backgroundColor: featureAfterCreate
                  ? `${colors.primary}1A`
                  : colors.surfaceGlass,
                borderColor: featureAfterCreate ? colors.primary : colors.border,
              },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.label, { color: colors.text, marginBottom: 2 }]}>
                {t("createEvent.featureThisEvent")}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {t("createEvent.featureThisEventDesc")}
              </Text>
            </View>
            <View
              style={[
                styles.switchTrack,
                { backgroundColor: featureAfterCreate ? colors.primary : colors.border },
              ]}
            >
              <View
                style={[
                  styles.switchKnob,
                  { alignSelf: featureAfterCreate ? "flex-end" : "flex-start" },
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Event length — sets the end time; drives when Community Matching opens */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>{t("createEvent.eventLength")}</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setShowDurationModal(true)}
            style={[
              styles.inputWrapper,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <Icon
              name="clock"
              size={20}
              color={colors.textSecondary}
              type="ui"
              style={{ marginRight: 12 }}
            />
            <Text style={[styles.input, { color: colors.text }]}>
              {formatDuration(durationMinutes)}
            </Text>
            <Icon name="down" size={20} color={colors.textSecondary} type="ui" />
          </TouchableOpacity>
        </View>

        {/* Max People and Price (single price hidden when two-tier is on) */}
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1, marginRight: !isFree && twoTier ? 0 : 8 }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              {t("createEvent.maxPeople")}
            </Text>
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                },
              ]}
            >
              <Icon
                name="users"
                size={20}
                color={colors.textSecondary}
                type="ui"
                style={{ marginRight: 12 }}
              />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="20"
                placeholderTextColor={colors.textTertiary}
                value={maxPeople}
                onChangeText={setMaxPeople}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>
          </View>

          {!(!isFree && twoTier) && (
            <View style={[styles.field, { flex: 1, marginLeft: 8 }]}>
              <Text style={[styles.label, { color: colors.text }]}>
                {isFree ? t("createEvent.priceLabel") : t("createEvent.priceMxnLabel")}
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.border,
                    opacity: isFree ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: 15, marginRight: 10 }}>
                  MX$
                </Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder={isFree ? "0" : "100"}
                  placeholderTextColor={colors.textTertiary}
                  value={isFree ? "0" : price}
                  onChangeText={handlePriceChange}
                  keyboardType="numeric"
                  returnKeyType="done"
                  editable={!isFree}
                />
              </View>
            </View>
          )}
        </View>

        {/* Payment info badge */}
        {!isFree && price && parseInt(price) > 0 && (
          <View
            style={[
              styles.infoBadge,
              { backgroundColor: `${colors.primary}15` },
            ]}
          >
            <Text style={[styles.infoText, { color: colors.primary }]}>
              {t("createEvent.paymentInfo")}
            </Text>

            {/* Cancellation Policy Disclosure */}
            <View style={[styles.refundPolicyCard, { backgroundColor: `${colors.primary}11`, borderColor: `${colors.primary}33` }]}>
              <Text style={[styles.refundPolicyTitle, { color: colors.text }]}>
                {t("createEvent.cancellationPolicyForAttendees")}
              </Text>
              <View style={styles.refundPolicyItem}>
                <Text style={[styles.refundPolicyBullet, { color: colors.primary }]}>•</Text>
                <Text style={[styles.refundPolicyItemText, { color: colors.textSecondary }]}>
                  {t("createEvent.policy7daysTicket")}
                </Text>
              </View>
              <View style={styles.refundPolicyItem}>
                <Text style={[styles.refundPolicyBullet, { color: colors.primary }]}>•</Text>
                <Text style={[styles.refundPolicyItemText, { color: colors.textSecondary }]}>
                  {t("createEvent.policy3to7Ticket")}
                </Text>
              </View>
              <View style={styles.refundPolicyItem}>
                <Text style={[styles.refundPolicyBullet, { color: colors.primary }]}>•</Text>
                <Text style={[styles.refundPolicyItemText, { color: colors.textSecondary }]}>
                  {t("createEvent.policyLess3NoRefund")}
                </Text>
              </View>
              <View style={styles.refundPolicyItem}>
                <Text style={[styles.refundPolicyBullet, { color: colors.secondary }]}>•</Text>
                <Text style={[styles.refundPolicyItemText, { color: colors.textSecondary }]}>
                  {t("createEvent.policyIfYouCancel")}
                </Text>
              </View>
              <Text style={[styles.refundPolicyNote, { color: colors.textTertiary }]}>
                {t("createEvent.feesNonRefundable")}
              </Text>
            </View>
          </View>
        )}

        {/* Tips */}
        <View
          style={[
            styles.tipsCard,
            {
              backgroundColor: `${colors.primary}11`,
              borderColor: `${colors.primary}33`,
            },
          ]}
        >
          <Text style={[styles.tipsTitle, { color: colors.primary }]}>
            {t("createEvent.tipsTitle")}
          </Text>
          <Text style={[styles.tipsText, { color: colors.textSecondary }]}>
            • {t("createEvent.tipBeSpecific")}{"\n"}• {t("createEvent.tipChooseLocations")}
            {"\n"}• {t("createEvent.tipSetExpectations")}
            {recurrenceConfig.type !== "none" &&
              `\n• ${t("createEvent.tipRecurring")}`}
          </Text>
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createButton, { opacity: loading ? 0.7 : 1 }]}
          onPress={handleCreateEvent}
          disabled={loading}
        >
          <View
            style={[
              styles.createGlass,
              {
                backgroundColor: `${colors.primary}33`,
                borderColor: `${colors.primary}66`,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Icon name="plus" size={20} color={colors.primary} type="ui" />
                <Text style={[styles.createText, { color: colors.primary }]}>
                  {isClass
                    ? t("createEvent.createClassButton")
                    : recurrenceConfig.type !== "none"
                    ? t("createEvent.createRecurringEvents")
                    : t("createEvent.createEventButton")}
                </Text>
              </>
            )}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Success Modal */}
      <EventCreatedModal
        visible={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          // If the host opted to feature the event, send them straight to the
          // paid promotion flow (featured is applied server-side on payment).
          if (featureAfterCreate && createdEventId) {
            navigation.replace("PromoteEvent", {
              eventId: createdEventId,
              eventTitle: createdEventTitle,
            });
          } else {
            navigation.goBack();
          }
        }}
        eventTitle={createdEventTitle}
        eventsCount={createdEventsCount}
      />

      {/* Event length wheel picker */}
      <DurationWheelModal
        visible={showDurationModal}
        value={durationMinutes}
        onSelect={setDurationMinutes}
        onClose={() => setShowDurationModal(false)}
      />

      {/* Recurrence Modal */}
      <RecurrenceModal
        visible={showRecurrenceModal}
        onClose={() => setShowRecurrenceModal(false)}
        onSave={(config) => {
          setRecurrenceConfig(config);
          // Sync start date from modal to event date
          if (config.startDate) {
            const newDate = new Date(config.startDate);
            newDate.setHours(eventDate.getHours(), eventDate.getMinutes(), 0, 0);
            setEventDate(newDate);
          }
        }}
        initialConfig={{
          ...recurrenceConfig,
          startDate: eventDate.toISOString(),
        }}
        startDate={eventDate}
      />

      {/* iOS Pickers */}
      {Platform.OS === "ios" && renderIOSDatePicker()}
      {Platform.OS === "ios" && renderIOSTimePicker()}

      {/* Android Pickers */}
      {Platform.OS === "android" && showDatePicker && (
        <DateTimePicker
          value={eventDate}
          mode="date"
          display="default"
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}
      {Platform.OS === "android" && showTimePicker && (
        <DateTimePicker
          value={eventDate}
          mode="time"
          display="default"
          onChange={onTimeChange}
        />
      )}
      
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 16,
    },
    backButton: { width: 40, height: 40, justifyContent: "center" },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    scrollView: { flex: 1 },
    content: { padding: 20, paddingBottom: 40 },
    field: { marginBottom: 20 },
    label: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 12,
      letterSpacing: -0.2,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
    },
    input: { flex: 1, fontSize: 16, paddingVertical: 16 },
    textAreaWrapper: { borderWidth: 1, borderRadius: 16, padding: 16 },
    textArea: { fontSize: 16, minHeight: 100 },
    charCount: { fontSize: 12, marginTop: 8, textAlign: "right" },
    toggleRow: { flexDirection: "row", gap: 12 },
    toggleButton: {
      flex: 1,
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderRadius: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    toggleLabel: { fontSize: 16, fontWeight: "600" },
    membershipToggle: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
    },
    switchTrack: {
      width: 48,
      height: 28,
      borderRadius: 14,
      padding: 3,
      justifyContent: "center",
    },
    switchKnob: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "#FFFFFF",
    },
    row: { flexDirection: "row", marginBottom: 20 },
    pickerButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    pickerText: { fontSize: 16, flex: 1 },
    helperText: { fontSize: 13, marginTop: 8, fontStyle: "italic" },
    recurrenceButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    recurrenceButtonContent: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    recurrenceButtonText: {
      flex: 1,
    },
    recurrenceLabel: {
      fontSize: 16,
      fontWeight: "600",
    },
    recurrenceCount: {
      fontSize: 13,
      marginTop: 2,
    },
    infoBadge: {
      padding: 12,
      borderRadius: 10,
      marginTop: -8,
      marginBottom: 20,
    },
    refundPolicyCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  refundPolicyTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  refundPolicyText: {
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 18,
  },
  refundPolicyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  refundPolicyBullet: {
    fontSize: 14,
    marginRight: 8,
    marginTop: 1,
  },
  refundPolicyItemText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  refundPolicyNote: {
    fontSize: 11,
    marginTop: 8,
    fontStyle: "italic",
  },
  infoText: { fontSize: 13, lineHeight: 19 },
    tipsCard: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 20,
      marginBottom: 24,
    },
    tipsTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
    tipsText: { fontSize: 14, lineHeight: 22 },
    createButton: { borderRadius: 16, overflow: "hidden", marginTop: 8 },
    createGlass: {
      borderWidth: 1,
      paddingVertical: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    createText: { fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    pickerModal: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 34,
    },
    pickerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.1)",
    },
    pickerTitle: { fontSize: 17, fontWeight: "600" },
    pickerCancel: { fontSize: 16 },
    pickerDone: { fontSize: 16, fontWeight: "600" },
    iosPicker: { height: 200 },
  });
}
