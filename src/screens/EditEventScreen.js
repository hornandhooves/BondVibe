import Icon from "../components/Icon";
import PlaceAutocomplete from "../components/PlaceAutocomplete";
import { geocodeAddress } from "../utils/geocode";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  Switch,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { findUserByEmail } from "../services/hostGroupService";
import { checkInstructorAvailability, AGENDA_ITEM_KIND } from "../services/businessAgendaService";
import InstructorPicker from "../components/business/InstructorPicker";
import { parsePositiveNumber, isValidNumberInProgress } from "../utils/validation";
import { getHostMembershipPlans } from "../services/membershipService";
import { getMyBizId } from "../services/businessService";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import DateTimePicker from "@react-native-community/datetimepicker";
import EventImagePicker from "../components/EventImagePicker";
import SelectDropdown from "../components/SelectDropdown";
import RecurrenceModal from "../components/RecurrenceModal";
import {
  getRecurrenceSummary,
  planRecurrenceUpdate,
  MAX_RECURRING_EVENTS,
} from "../utils/recurrenceUtils";
import {
  uploadEventImages,
  deleteEventImage,
} from "../services/storageService";
import { EVENT_LANGUAGES, EVENT_DURATIONS } from "../utils/eventCategories";

const CATEGORIES = [
  "Social",
  "Sports",
  "Food",
  "Arts",
  "Learning",
  "Adventure",
];


export default function EditEventScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const { eventId } = route.params;
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Social",
    language: "both",
    date: new Date(),
    time: "",
    location: "",
    locationCoords: null,
    venueAddress: "",
    placeId: null,
    durationMinutes: "180",
    maxAttendees: "",
    price: "",
    // KIN-213: business fields that existed only in Create until now. A host
    // could set them once and never change them again.
    acceptsMembership: false,
    twoTier: false,
    priceLocal: "",
    priceGeneral: "",
  });
  const [loading, setLoading] = useState(true);

  // F1 Phase 3: picking a place recaptures coords/address so the map pin stays
  // in sync; a free-text entry clears the stale coords (re-geocoded on save).
  const handlePlaceSelect = (place) => {
    const hasCoords =
      Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude);
    setForm((f) => ({
      ...f,
      location: place?.description || place?.address || f.location,
      locationCoords: hasCoords
        ? { latitude: place.latitude, longitude: place.longitude }
        : null,
      venueAddress: place?.address || null,
      placeId: place?.placeId || null,
    }));
  };
  const [saving, setSaving] = useState(false);
  const [creatorId, setCreatorId] = useState(null);
  const [coHosts, setCoHosts] = useState([]); // [{ id, name }]
  const [coHostEmail, setCoHostEmail] = useState("");
  const [addingCoHost, setAddingCoHost] = useState(false);

  // Image state
  const [eventImages, setEventImages] = useState([]); // Current images (URLs or local URIs)
  const [originalImages, setOriginalImages] = useState([]); // Original URLs from Firestore
  const [imagesToDelete, setImagesToDelete] = useState([]); // URLs to delete from Storage

  // Recurrence state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceGroupId, setRecurrenceGroupId] = useState(null);
  const [futureEventsCount, setFutureEventsCount] = useState(0);

  // KIN-214: the pattern itself is editable now. `recurrenceConfig` is rehydrated
  // from the doc so RecurrenceModal opens on what the series actually is, and
  // `patternDirty` gates the destructive path — an unchanged pattern must never
  // delete and recreate occurrences just because the host opened the modal.
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  const [recurrenceConfig, setRecurrenceConfig] = useState(null);
  const [patternDirty, setPatternDirty] = useState(false);
  // The occurrence's date AS STORED. The split anchors here, not on form.date:
  // if the host also moves this occurrence in the same save, "which occurrences
  // are in the future" must still be answered against the real series.
  const originalDateRef = useRef(null);

  // Date/Time picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // BUG 27 / 27.1: discovery visibility + agenda classification. "blocked" (OOO)
  // forces private. The onEventWritten trigger rebuilds searchKeywords honoring
  // listedPublicly, so we only persist these two flags here.
  const [listedPublicly, setListedPublicly] = useState(true);
  const [agendaType, setAgendaType] = useState("general");
  const isBlocked = agendaType === "blocked";
  const effectiveListedPublicly = isBlocked ? false : listedPublicly;
  // BUG 30: the event's instructor (if any), to check the right agenda day when
  // moving it to a new slot. Falls back to the owner's day for unassigned events.
  const [eventInstructor, setEventInstructor] = useState({ uid: "", name: "" });

  useEffect(() => {
    loadEvent();
  }, []);

  const loadEvent = async () => {
    try {
      const eventDoc = await getDoc(doc(db, "events", eventId));
      if (eventDoc.exists()) {
        const data = eventDoc.data();

        // Parse the date string into a Date object
        let eventDate = new Date();
        if (data.date) {
          const parsedDate = new Date(data.date);
          if (!isNaN(parsedDate.getTime())) {
            eventDate = parsedDate;
          }
        }

        setForm({
          title: data.title || "",
          description: data.description || "",
          category: data.category || "Social",
          language: data.language || "both",
          date: eventDate,
          time: data.time || "",
          location: data.location || "",
          locationCoords: data.locationCoords || null,
          venueAddress: data.venueAddress || "",
          placeId: data.placeId || null,
          durationMinutes: data.durationMinutes?.toString() || "180",
          maxAttendees:
            data.maxAttendees?.toString() || data.maxPeople?.toString() || "",
          price: data.price?.toString() || "",
          acceptsMembership: data.acceptsMembership === true,
          twoTier: data.twoTier === true,
          priceLocal: data.priceLocal != null ? String(data.priceLocal) : "",
          priceGeneral:
            data.priceGeneral != null
              ? String(data.priceGeneral)
              : data.price != null
                ? String(data.price)
                : "",
        });
        setTempDate(eventDate);
        setAgendaType(data.agendaType || "general");
        setListedPublicly(data.listedPublicly !== false);
        setEventInstructor({ uid: data.instructorUid || "", name: data.instructorName || "" });
        setCreatorId(data.creatorId || data.createdBy || data.hostId || null);

        // Load co-hosts (names) for management.
        if (Array.isArray(data.coHosts) && data.coHosts.length) {
          const names = await Promise.all(
            data.coHosts.map(async (id) => {
              const u = await getDoc(doc(db, "users", id));
              return {
                id,
                name: u.exists() ? u.data().fullName || u.data().name || t("editEvent.defaultCoHostName") : t("editEvent.defaultCoHostName"),
              };
            })
          );
          setCoHosts(names);
        }

        // Load existing images
        if (data.images && Array.isArray(data.images)) {
          setEventImages(data.images);
          setOriginalImages(data.images);
        }

        // Check if this is a recurring event
        if (data.isRecurring && data.recurrenceGroupId) {
          setIsRecurring(true);
          setRecurrenceGroupId(data.recurrenceGroupId);

          // KIN-214: reassemble the config Create split across three fields, so
          // the modal opens on the real pattern instead of a blank default.
          originalDateRef.current = data.date;
          setRecurrenceConfig({
            type: data.recurrenceType || "weekly",
            endDate: data.recurrenceEndDate || null,
            selectedDays: data.recurrenceConfig?.selectedDays || [],
            weekOfMonth: data.recurrenceConfig?.weekOfMonth || "first",
            monthlyMode: data.recurrenceConfig?.monthlyMode || "dayOfWeek",
            dayOfMonth: data.recurrenceConfig?.dayOfMonth || 1,
            lunarPhase: data.recurrenceConfig?.lunarPhase || "full",
          });

          // Count future events in the series
          const futureQuery = query(
            collection(db, "events"),
            where("recurrenceGroupId", "==", data.recurrenceGroupId),
            where("status", "==", "active")
          );
          const futureSnapshot = await getDocs(futureQuery);

          // Get this event's date at midnight for comparison (events from this date onwards)
          const thisEventDate = new Date(eventDate);
          thisEventDate.setHours(0, 0, 0, 0);
          const thisEventTimestamp = thisEventDate.getTime();

          const futureEvents = futureSnapshot.docs.filter((d) => {
            const eData = d.data();
            const eventDateObj = new Date(eData.date);
            eventDateObj.setHours(0, 0, 0, 0);
            const eventTimestamp = eventDateObj.getTime();
            return eventTimestamp >= thisEventTimestamp;
          });
          setFutureEventsCount(futureEvents.length);
          console.log(
            `🔄 Recurring event: ${futureEvents.length} events from this date onwards`
          );
        }
      }
    } catch (error) {
      console.error("Error loading event:", error);
    } finally {
      setLoading(false);
    }
  };

  // Handle image changes from EventImagePicker
  const handleImagesChange = (newImages) => {
    // Find images that were removed (were in original but not in new)
    const removedImages = originalImages.filter(
      (origUrl) => !newImages.includes(origUrl)
    );

    // Add to deletion queue (only URLs, not local URIs)
    setImagesToDelete((prev) => [
      ...prev,
      ...removedImages.filter((url) => url.startsWith("http")),
    ]);

    setEventImages(newImages);
  };

  // Format date for display
  const formatDateDisplay = (date) => {
    if (!date || isNaN(date.getTime())) return t("editEvent.selectDate");
    return date.toLocaleDateString(i18n.language, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Format time for display
  const formatTimeDisplay = (date) => {
    if (!date || isNaN(date.getTime())) return t("editEvent.selectTime");
    return date.toLocaleTimeString(i18n.language, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Handle date change
  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
      if (event.type === "set" && selectedDate) {
        const newDate = new Date(selectedDate);
        newDate.setHours(form.date.getHours());
        newDate.setMinutes(form.date.getMinutes());
        setForm({ ...form, date: newDate });
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  // Handle time change
  const onTimeChange = (event, selectedTime) => {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
      if (event.type === "set" && selectedTime) {
        const newDate = new Date(form.date);
        newDate.setHours(selectedTime.getHours());
        newDate.setMinutes(selectedTime.getMinutes());
        setForm({
          ...form,
          date: newDate,
          time: formatTimeDisplay(selectedTime),
        });
      }
    } else {
      if (selectedTime) {
        setTempDate(selectedTime);
      }
    }
  };

  // Confirm iOS date selection
  const confirmDateSelection = () => {
    const newDate = new Date(tempDate);
    newDate.setHours(form.date.getHours());
    newDate.setMinutes(form.date.getMinutes());
    setForm({ ...form, date: newDate });
    setShowDatePicker(false);
  };

  // Confirm iOS time selection
  const confirmTimeSelection = () => {
    const newDate = new Date(form.date);
    newDate.setHours(tempDate.getHours());
    newDate.setMinutes(tempDate.getMinutes());
    setForm({
      ...form,
      date: newDate,
      time: formatTimeDisplay(tempDate),
    });
    setShowTimePicker(false);
  };

  // Handle save - check for recurring event
  const isCreator = !!creatorId && auth.currentUser?.uid === creatorId;

  const handleAddCoHost = async () => {
    const email = coHostEmail.trim().toLowerCase();
    if (!email) return;
    setAddingCoHost(true);
    const user = await findUserByEmail(email);
    setAddingCoHost(false);
    if (!user) {
      Alert.alert(t("editEvent.alerts.notFoundTitle"), t("editEvent.alerts.notFoundMsg"));
      return;
    }
    if (user.id === creatorId || coHosts.some((c) => c.id === user.id)) {
      Alert.alert(t("editEvent.alerts.alreadyCoHostTitle"), t("editEvent.alerts.alreadyCoHostMsg"));
      return;
    }
    await updateDoc(doc(db, "events", eventId), { coHosts: arrayUnion(user.id) });
    setCoHosts((c) => [...c, { id: user.id, name: user.fullName || user.name || email }]);
    setCoHostEmail("");
    Alert.alert(t("editEvent.alerts.coHostAddedTitle"), t("editEvent.alerts.coHostAddedMsg", { name: user.fullName || email }));
  };

  const handleRemoveCoHost = async (id) => {
    await updateDoc(doc(db, "events", eventId), { coHosts: arrayRemove(id) });
    setCoHosts((c) => c.filter((x) => x.id !== id));
  };

  const handleSave = async () => {
    if (
      !form.title.trim() ||
      !form.description.trim() ||
      !form.location.trim()
    ) {
      Alert.alert(t("editEvent.alerts.missingFieldsTitle"), t("editEvent.alerts.missingFieldsMsg"));
      return;
    }

    // If recurring event with multiple events from this date onwards, ask user
    if (isRecurring && futureEventsCount > 1) {
      Alert.alert(
        t("editEvent.alerts.editRecurringTitle"),
        t("editEvent.alerts.editRecurringMsg"),
        [
          { text: t("editEvent.cancel"), style: "cancel" },
          {
            text: t("editEvent.alerts.onlyThisEvent"),
            onPress: () => saveEvent(false),
          },
          {
            text: t("editEvent.alerts.thisAndFollowing", { count: futureEventsCount }),
            onPress: () => saveEvent(true),
          },
        ]
      );
    } else {
      saveEvent(false);
    }
  };

  // KIN-213: "paid" is derived, not a separate toggle — Edit has always had a
  // single price field, and adding an isFree switch here would be a second
  // source of truth for the same fact.
  const isPaid = (parsePositiveNumber(form.twoTier ? form.priceGeneral : form.price) ?? 0) > 0;
  const [checkingPlans, setCheckingPlans] = useState(false);

  /** KIN-151: refuse a keystroke that can never become a price, as Create does. */
  const onPriceChange = (field) => (text) => {
    if (!isValidNumberInProgress(text)) return;
    setForm((f) => ({ ...f, [field]: text }));
  };

  /** Turning membership ON is meaningless with no active plan, so check first.
   *  Unlike Create there is no draft to persist — an edit is already saved
   *  state — so this informs instead of offering a detour. */
  const toggleMembership = async () => {
    if (form.acceptsMembership) {
      setForm((f) => ({ ...f, acceptsMembership: false }));
      return;
    }
    setCheckingPlans(true);
    try {
      const plans = await getHostMembershipPlans(auth.currentUser.uid, { activeOnly: true });
      if (plans.length === 0) {
        Alert.alert(
          t("createEvent.membershipPlansAlert.title"),
          t("createEvent.membershipPlansAlert.msg"),
        );
        return;
      }
      setForm((f) => ({ ...f, acceptsMembership: true }));
    } catch (_e) {
      // A failed lookup must not strand the toggle — leave it off and let the
      // host retry (CLAUDE.md §7).
    } finally {
      setCheckingPlans(false);
    }
  };

  /**
   * KIN-214 — rewrite the series' future occurrences to a new pattern.
   *
   * The host changed frequency/days on an event that already exists, so some of
   * the dates on the calendar are now wrong. planRecurrenceUpdate decides what
   * that means; this function is only the Firestore half of it — delete what it
   * says to delete, create what it says to create, and never improvise past its
   * answer.
   *
   * Two things it deliberately does NOT do, both closed decisions (KIN-214):
   * an occurrence with bookings is not moved, cancelled or refunded, and nobody
   * is notified automatically — the host coordinates those dates by hand in the
   * event chat, which is why they come back as a notice.
   *
   * @param {object} updateData the field values from this same save, so new
   *   occurrences are born with the edited values rather than the stale ones
   * @returns {Promise<string|null>} a message for the success alert, or null
   */
  const applyRecurrencePatternChange = async (updateData) => {
    if (!recurrenceGroupId || !recurrenceConfig) return null;

    const seriesSnapshot = await getDocs(
      query(
        collection(db, "events"),
        where("recurrenceGroupId", "==", recurrenceGroupId),
        where("status", "==", "active")
      )
    );
    const occurrences = seriesSnapshot.docs.map((d) => ({
      id: d.id,
      ref: d.ref,
      ...d.data(),
    }));

    const anchor = occurrences.find((o) => o.id === eventId) || {
      id: eventId,
      date: originalDateRef.current,
    };
    const { remove, create, blocked } = planRecurrenceUpdate({
      current: anchor,
      occurrences,
      config: recurrenceConfig,
      maxEvents: MAX_RECURRING_EVENTS,
    });

    // Fields that describe THIS occurrence rather than the series — a new
    // occurrence gets its own date, and starts with nobody in it.
    const {
      date: _date,
      time: _time,
      id: _id,
      ref: _ref,
      attendees: _attendees,
      participants: _participants,
      participantCount: _participantCount,
      eventIndex: _eventIndex,
      createdAt: _createdAt,
      ...seriesFields
    } = anchor;

    // What the series IS, as opposed to what any single occurrence is. Built
    // once and written to every doc that stays in the series, so the three
    // write sites below can't drift into disagreeing about the pattern.
    const seriesMeta = {
      recurrenceType: recurrenceConfig.type,
      recurrenceEndDate: recurrenceConfig.endDate || null,
      recurrenceConfig: {
        selectedDays: recurrenceConfig.selectedDays || [],
        weekOfMonth: recurrenceConfig.weekOfMonth || null,
        monthlyMode: recurrenceConfig.monthlyMode || null,
        dayOfMonth: recurrenceConfig.dayOfMonth || null,
        lunarPhase: recurrenceConfig.lunarPhase || null,
      },
    };

    const batch = writeBatch(db);
    remove.forEach((occ) => batch.delete(occ.ref));
    create.forEach((d) => {
      batch.set(doc(collection(db, "events")), {
        ...seriesFields,
        ...updateData,
        ...seriesMeta,
        date: d.toISOString(),
        time: formatTimeDisplay(d),
        attendees: [],
        participantCount: 0,
        status: "active",
        recurrenceGroupId,
        isRecurring: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    // The edited occurrence AND the booked ones this change couldn't move.
    //
    // A blocked occurrence keeps its DATE — that is the promise, and it holds:
    // nothing below touches date, time, status, attendees or participantCount.
    // But it is still part of the series, so it carries the series' pattern.
    // Leaving it on the old one meant opening Edit on a booked occurrence
    // rehydrated the modal with a pattern the series no longer follows, and the
    // summary told the host something untrue — a bug reachable only because
    // KIN-214 made recurrenceConfig readable in the first place.
    batch.update(doc(db, "events", eventId), seriesMeta);
    blocked.forEach((occ) => batch.update(occ.ref, seriesMeta));
    await batch.commit();
    console.log(
      `🔄 Pattern change: -${remove.length} +${create.length}, ${blocked.length} kept`
    );

    const notice = t("editEvent.recurrence.patternApplied", {
      removed: remove.length,
      created: create.length,
    });
    if (blocked.length === 0) return notice;

    const dates = blocked
      .map((o) => new Date(o.date))
      .sort((a, b) => a - b)
      .map((d) =>
        d.toLocaleDateString(i18n.language, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      )
      .join("\n• ");
    return `${notice}\n\n${t("editEvent.recurrence.keptBooked", {
      count: blocked.length,
    })}\n• ${dates}`;
  };

  // Save event(s)
  const saveEvent = async (updateAllFuture, skipAvailabilityCheck = false) => {
    // KIN-213 + KIN-151: a price that can't parse must never reach Firestore.
    // parseFloat used to let NaN through here.
    if (isPaid && form.twoTier) {
      if (parsePositiveNumber(form.priceLocal) === null || parsePositiveNumber(form.priceGeneral) === null) {
        Alert.alert(t("createEvent.validation.invalidPriceTitle"), t("createEvent.twoTier.invalidMsg"));
        return;
      }
    } else if (form.price !== "" && parsePositiveNumber(form.price) === null && parseFloat(form.price) !== 0) {
      Alert.alert(t("createEvent.validation.invalidPriceTitle"), t("createEvent.validation.invalidPriceMsg"));
      return;
    }

    // BUG 30: warn if moving the event onto an occupied slot (warn-and-allow).
    // Unassigned events live on the owner's agenda day; exclude this event so it
    // doesn't clash with its own current slot.
    if (!skipAvailabilityCheck) {
      const checkUid = eventInstructor.uid || getMyBizId();
      if (checkUid) {
        const avail = await checkInstructorAvailability({
          instructorUid: checkUid,
          instructorName: eventInstructor.name,
          start: new Date(form.date),
          durationMin: parseInt(form.durationMinutes, 10) || 180,
          excludeItemId: `event_${eventId}`,
        });
        if (avail.conflict && avail.conflictItem) {
          const hm = (d) => { const x = new Date(d); return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };
          const isBlocked = avail.conflictItem.kind === AGENDA_ITEM_KIND.BLOCKED;
          const msg = t(isBlocked ? "business.agenda.conflictBlockedMsg" : "business.agenda.conflictMsg", {
            name: eventInstructor.name || t("business.agenda.you"),
            title: avail.conflictItem.title,
            range: `${hm(avail.conflictItem.start)}–${hm(avail.conflictItem.end)}`,
          });
          Alert.alert(t("business.agenda.placementWarnTitle"), msg, [
            { text: t("business.common.cancel"), style: "cancel" },
            { text: t("business.agenda.continueAnyway"), onPress: () => saveEvent(updateAllFuture, true) },
          ]);
          return;
        }
      }
    }
    setSaving(true);
    let successMessage = "";
    try {
      // Process images first
      let finalImageUrls = [];

      // Separate existing URLs from new local images
      const existingUrls = eventImages.filter((img) => img.startsWith("http"));
      const newLocalImages = eventImages.filter(
        (img) => !img.startsWith("http")
      );

      // Delete removed images from Storage
      for (const urlToDelete of imagesToDelete) {
        try {
          await deleteEventImage(urlToDelete);
          console.log("🗑️ Deleted image from storage");
        } catch (deleteError) {
          console.warn("⚠️ Could not delete image:", deleteError.message);
        }
      }

      // Upload new images
      if (newLocalImages.length > 0) {
        console.log(`📸 Uploading ${newLocalImages.length} new images...`);
        const newUrls = await uploadEventImages(eventId, newLocalImages);
        finalImageUrls = [...existingUrls, ...newUrls];
      } else {
        finalImageUrls = existingUrls;
      }

      // Keep the map pin in sync: exact coords from the picker, else geocode the
      // (possibly edited) location text. null → the event stays "not on map".
      let resolvedCoords = form.locationCoords;
      if (!resolvedCoords) resolvedCoords = await geocodeAddress(form.location);

      const updateData = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        language: form.language,
        location: form.location.trim(),
        locationCoords: resolvedCoords || null,
        venueAddress: form.venueAddress?.trim() || null,
        placeId: form.placeId || null,
        durationMinutes: parseInt(form.durationMinutes, 10) || 180,
        maxAttendees: parseInt(form.maxAttendees) || 10,
        maxPeople: parseInt(form.maxAttendees) || 10,
        // With tiers on, General is the canonical price — same rule as Create,
        // so everything that reads `price` keeps working.
        price: isPaid
          ? form.twoTier
            ? parsePositiveNumber(form.priceGeneral) ?? 0
            : parsePositiveNumber(form.price) ?? 0
          : 0,
        // KIN-213 — written the same way CreateEventScreen writes them, so an
        // edited event is indistinguishable from a freshly created one.
        // Deliberately unconditional: the host may turn membership or tiers on
        // and off with reservations already on the books. That is safe because
        // createEventPaymentIntent freezes the price into the PaymentIntent at
        // purchase time, and a redeemed membership credit is never re-read
        // against acceptsMembership.
        acceptsMembership: !!form.acceptsMembership,
        twoTier: isPaid && !!form.twoTier,
        priceLocal:
          isPaid && form.twoTier ? parsePositiveNumber(form.priceLocal) ?? 0 : null,
        instructorUid: eventInstructor.uid || null,
        instructorName: eventInstructor.name || null,
        images: finalImageUrls,
        // BUG 27 / 27.1: persist visibility + agenda classification. The
        // onEventWritten trigger rebuilds searchKeywords honoring listedPublicly.
        listedPublicly: effectiveListedPublicly,
        agendaType,
        updatedAt: new Date().toISOString(),
      };

      if (updateAllFuture && recurrenceGroupId) {
        // Update all events from this date onwards in the series
        const futureQuery = query(
          collection(db, "events"),
          where("recurrenceGroupId", "==", recurrenceGroupId),
          where("status", "==", "active")
        );
        const futureSnapshot = await getDocs(futureQuery);

        // Get this event's date at midnight for comparison
        const thisEventDate = new Date(form.date);
        thisEventDate.setHours(0, 0, 0, 0);
        const thisEventTimestamp = thisEventDate.getTime();

        const batch = writeBatch(db);
        let updatedCount = 0;

        futureSnapshot.docs.forEach((docSnap) => {
          const eventData = docSnap.data();
          const eventDateObj = new Date(eventData.date);
          eventDateObj.setHours(0, 0, 0, 0);
          const eventTimestamp = eventDateObj.getTime();
          if (eventTimestamp >= thisEventTimestamp) {
            batch.update(docSnap.ref, updateData);
            updatedCount++;
          }
        });

        await batch.commit();
        console.log(`✅ Updated ${updatedCount} future events`);

        successMessage = t("editEvent.alerts.successSeriesMsg", { count: updatedCount });
      } else {
        // Update only this event (including date/time)
        await updateDoc(doc(db, "events", eventId), {
          ...updateData,
          date: form.date.toISOString(),
          time: form.time || formatTimeDisplay(form.date),
        });

        successMessage = t("editEvent.alerts.eventUpdatedMsg");
      }

      // KIN-214: the pattern change runs LAST, after the field update above, so
      // the occurrences it creates already carry the edited values. Note this is
      // only about DATES — the "all future" branch may still update fields on a
      // booked occurrence, which is its existing behaviour and not what KIN-214
      // protects. What a booked occurrence is guaranteed is that it never moves
      // and never gets deleted.
      const patternNotice = patternDirty
        ? await applyRecurrencePatternChange(updateData)
        : null;

      Alert.alert(
        t("editEvent.alerts.successTitle"),
        patternNotice ? `${successMessage}\n\n${patternNotice}` : successMessage,
        [{ text: t("editEvent.alerts.ok"), onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error("Error updating event:", error);
      Alert.alert(t("editEvent.alerts.missingFieldsTitle"), t("editEvent.alerts.updateFailedMsg"));
    } finally {
      setSaving(false);
    }
  };

  // Handle delete - check for recurring event
  const handleDelete = () => {
    if (isRecurring && futureEventsCount > 1) {
      Alert.alert(
        t("editEvent.alerts.deleteRecurringTitle"),
        t("editEvent.alerts.deleteRecurringMsg"),
        [
          { text: t("editEvent.cancel"), style: "cancel" },
          {
            text: t("editEvent.alerts.onlyThisEvent"),
            style: "destructive",
            onPress: () => deleteEvent(false),
          },
          {
            text: t("editEvent.alerts.thisAndFollowing", { count: futureEventsCount }),
            style: "destructive",
            onPress: () => deleteEvent(true),
          },
        ]
      );
    } else {
      Alert.alert(t("editEvent.alerts.deleteEventTitle"), t("editEvent.alerts.deleteEventMsg"), [
        { text: t("editEvent.cancel"), style: "cancel" },
        {
          text: t("editEvent.alerts.delete"),
          style: "destructive",
          onPress: () => deleteEvent(false),
        },
      ]);
    }
  };

  // Delete event(s)
  const deleteEvent = async (deleteAllFuture) => {
    try {
      // Delete images from storage
      for (const imageUrl of originalImages) {
        try {
          await deleteEventImage(imageUrl);
        } catch (deleteError) {
          console.warn("⚠️ Could not delete image:", deleteError.message);
        }
      }

      if (deleteAllFuture && recurrenceGroupId) {
        // Delete all events from this date onwards in the series
        const futureQuery = query(
          collection(db, "events"),
          where("recurrenceGroupId", "==", recurrenceGroupId),
          where("status", "==", "active")
        );
        const futureSnapshot = await getDocs(futureQuery);

        // Get this event's date at midnight for comparison
        const thisEventDate = new Date(form.date);
        thisEventDate.setHours(0, 0, 0, 0);
        const thisEventTimestamp = thisEventDate.getTime();

        const batch = writeBatch(db);
        let deletedCount = 0;

        futureSnapshot.docs.forEach((docSnap) => {
          const eventData = docSnap.data();
          const eventDateObj = new Date(eventData.date);
          eventDateObj.setHours(0, 0, 0, 0);
          const eventTimestamp = eventDateObj.getTime();
          if (eventTimestamp >= thisEventTimestamp) {
            batch.delete(docSnap.ref);
            deletedCount++;
          }
        });

        await batch.commit();
        console.log(`🗑️ Deleted ${deletedCount} events from this date onwards`);

        Alert.alert(t("editEvent.alerts.deletedTitle"), t("editEvent.alerts.deletedSeriesMsg", { count: deletedCount }), [
          { text: t("editEvent.alerts.ok"), onPress: () => navigation.navigate("MainTabs", { screen: "HomeTab" }) },
        ]);
      } else {
        // Delete only this event
        await deleteDoc(doc(db, "events", eventId));
        Alert.alert(t("editEvent.alerts.deletedTitle"), t("editEvent.alerts.deletedEventMsg"), [
          { text: t("editEvent.alerts.ok"), onPress: () => navigation.navigate("MainTabs", { screen: "HomeTab" }) },
        ]);
      }
    } catch (error) {
      console.error("Error deleting event:", error);
      Alert.alert(t("editEvent.alerts.missingFieldsTitle"), t("editEvent.alerts.deleteFailedMsg"));
    }
  };

  const styles = createStyles(colors);

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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
                {t("editEvent.cancel")}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              {t("editEvent.selectDate")}
            </Text>
            <TouchableOpacity onPress={confirmDateSelection}>
              <Text style={[styles.pickerDone, { color: colors.primary }]}>
                {t("editEvent.done")}
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
                {t("editEvent.cancel")}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              {t("editEvent.selectTime")}
            </Text>
            <TouchableOpacity onPress={confirmTimeSelection}>
              <Text style={[styles.pickerDone, { color: colors.primary }]}>
                {t("editEvent.done")}
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

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t("editEvent.headerTitle")}
          </Text>
          {isRecurring && (
            <View
              style={[
                styles.recurringBadge,
                { backgroundColor: `${colors.primary}22` },
              ]}
            >
              <Icon name="repeat" size={12} color={colors.primary} />
              <Text
                style={[styles.recurringBadgeText, { color: colors.primary }]}
              >
                {t("editEvent.recurring")}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleDelete}>
          <Icon name="delete" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Recurring Event Banner */}
        {isRecurring && (
          <View
            style={[
              styles.recurringBanner,
              {
                backgroundColor: `${colors.primary}11`,
                borderColor: `${colors.primary}33`,
              },
            ]}
          >
            <Text
              style={[styles.recurringBannerText, { color: colors.primary }]}
            >
              {t("editEvent.recurringSeriesBanner", { count: futureEventsCount })}
            </Text>
            <Text
              style={[
                styles.recurringBannerSubtext,
                { color: colors.textSecondary },
              ]}
            >
              {t("editEvent.recurringSeriesSubtext")}
            </Text>

            {/* KIN-214: the pattern is editable from here. Only reachable on a
                recurring event — a one-off has no pattern to change. */}
            <TouchableOpacity
              testID="edit-recurrence-pattern"
              accessibilityRole="button"
              accessibilityLabel={t("editEvent.recurrence.changePattern")}
              accessibilityHint={t("editEvent.recurrence.changePatternHint")}
              style={[styles.patternButton, { borderColor: `${colors.primary}55` }]}
              onPress={() => setShowRecurrenceModal(true)}
            >
              <Text style={[styles.patternSummary, { color: colors.text }]}>
                {getRecurrenceSummary(recurrenceConfig)}
              </Text>
              <Text style={[styles.patternAction, { color: colors.primary }]}>
                {t("editEvent.recurrence.changePattern")}
              </Text>
            </TouchableOpacity>

            {patternDirty && (
              <Text style={[styles.patternWarning, { color: colors.textSecondary }]}>
                {t("editEvent.recurrence.pendingWarning")}
              </Text>
            )}
          </View>
        )}

        {/* Event Title */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>
            {t("editEvent.eventTitleLabel")}
          </Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={form.title}
              onChangeText={(text) => setForm({ ...form, title: text })}
              placeholder={t("editEvent.eventTitlePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              maxLength={80}
            />
          </View>
        </View>

        {/* Event Images */}
        <EventImagePicker
          images={eventImages}
          onImagesChange={handleImagesChange}
        />

        {/* Description */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>
            {t("editEvent.descriptionLabel")}
          </Text>
          <View style={[styles.inputWrapper, styles.textAreaWrapper]}>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={form.description}
              onChangeText={(text) => setForm({ ...form, description: text })}
              placeholder={t("editEvent.descriptionPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
            />
          </View>
          <Text style={[styles.charCount, { color: colors.textTertiary }]}>
            {form.description.length}/500
          </Text>
        </View>

        {/* Category */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t("editEvent.communityLabel")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.categoryScroll}
          >
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={styles.categoryChip}
                onPress={() => setForm({ ...form, category: cat })}
              >
                <View
                  style={[
                    styles.categoryChipGlass,
                    {
                      backgroundColor:
                        form.category === cat
                          ? `${colors.primary}33`
                          : colors.surfaceGlass,
                      borderColor:
                        form.category === cat
                          ? `${colors.primary}66`
                          : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      {
                        color:
                          form.category === cat
                            ? colors.primary
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {cat}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

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

        {/* Language */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>{t("editEvent.languageLabel")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.categoryScroll}
          >
            {EVENT_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.id}
                style={styles.categoryChip}
                onPress={() => setForm({ ...form, language: lang.id })}
              >
                <View
                  style={[
                    styles.categoryChipGlass,
                    {
                      backgroundColor:
                        form.language === lang.id
                          ? `${colors.primary}33`
                          : colors.surfaceGlass,
                      borderColor:
                        form.language === lang.id
                          ? colors.primary
                          : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      {
                        color:
                          form.language === lang.id
                            ? colors.primary
                            : colors.text,
                      },
                    ]}
                  >
                    {lang.label}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Date & Time with Native Pickers */}
        <View style={styles.rowSection}>
          <View style={[styles.section, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.text }]}>{t("editEvent.dateLabel")}</Text>
            <TouchableOpacity
              style={styles.inputWrapper}
              onPress={() => {
                setTempDate(form.date);
                setShowDatePicker(true);
              }}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.dateTimeButton,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Icon
                  name="calendar"
                  size={18}
                  tone="muted"
                  style={styles.dateTimeIcon}
                />
                <Text
                  style={[styles.dateTimeText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {formatDateDisplay(form.date)}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={[styles.section, { flex: 1, marginLeft: 12 }]}>
            <Text style={[styles.label, { color: colors.text }]}>{t("editEvent.timeLabel")}</Text>
            <TouchableOpacity
              style={styles.inputWrapper}
              onPress={() => {
                setTempDate(form.date);
                setShowTimePicker(true);
              }}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.dateTimeButton,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Icon
                  name="clock"
                  size={18}
                  tone="muted"
                  style={styles.dateTimeIcon}
                />
                <Text
                  style={[styles.dateTimeText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {form.time || formatTimeDisplay(form.date)}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Note for recurring events about date/time */}
        {isRecurring && (
          <Text style={[styles.dateNote, { color: colors.textTertiary }]}>
            {t("editEvent.recurringDateNote")}
          </Text>
        )}

        {/* Location */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>{t("editEvent.locationLabel")}</Text>
          <PlaceAutocomplete
            value={form.location}
            onSelect={handlePlaceSelect}
            placeholder={t("editEvent.locationPlaceholder")}
          />
        </View>

        {/* Event length — sets end time; drives when Community Matching opens */}
        <SelectDropdown
          label={t("editEvent.eventLengthLabel")}
          value={form.durationMinutes}
          onValueChange={(v) => setForm({ ...form, durationMinutes: v })}
          options={EVENT_DURATIONS}
          placeholder={t("editEvent.selectDuration")}
          type="default"
        />

        {/* List event publicly — gates discovery/search (BUG 27). Hidden for a
            blocked/OOO slot, which is always private. */}
        {!isBlocked && (
          <View style={styles.section}>
            <View style={styles.publicToggleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.label, { color: colors.text, marginBottom: 2 }]}>
                  {t("createEvent.listPublicly")}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {t("createEvent.listPubliclyDesc")}
                </Text>
              </View>
              <Switch
                value={listedPublicly}
                onValueChange={setListedPublicly}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        {/* Max People & Price */}
        <View style={styles.rowSection}>
          <View style={[styles.section, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              {t("editEvent.maxPeopleLabel")}
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={form.maxAttendees}
                onChangeText={(text) =>
                  setForm({
                    ...form,
                    maxAttendees: text.replace(/[^0-9]/g, ""),
                  })
                }
                placeholder="10"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={[styles.section, { flex: 1, marginLeft: 12 }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              {t("editEvent.priceMxnLabel")}
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={form.price}
                onChangeText={onPriceChange("price")}
                placeholder="100"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

        {/* KIN-213 — instructor reassignment. The availability check in
            saveEvent already reads eventInstructor, so changing it here means
            the NEW instructor's agenda is the one checked, not the old one. */}
        <View style={styles.section}>
          <InstructorPicker
            value={eventInstructor.uid}
            onChange={(uid, name) => setEventInstructor({ uid, name })}
            label={t("createEvent.instructorLabel")}
            placeholder={t("createEvent.instructorPlaceholder")}
            t={t}
          />
        </View>

        {/* KIN-213 — two-tier pricing, only meaningful on a paid event. Same
            control and copy as CreateEventScreen. */}
        {isPaid && (
          <View style={styles.section}>
            <TouchableOpacity
              activeOpacity={0.8}
              testID="edit-twotier-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: !!form.twoTier }}
              onPress={() => setForm((f) => ({ ...f, twoTier: !f.twoTier }))}
              style={[
                styles.membershipToggle,
                {
                  backgroundColor: form.twoTier ? `${colors.primary}1A` : colors.surfaceGlass,
                  borderColor: form.twoTier ? colors.primary : colors.border,
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
              <View style={[styles.switchTrack, { backgroundColor: form.twoTier ? colors.primary : colors.border }]}>
                <View style={[styles.switchKnob, { alignSelf: form.twoTier ? "flex-end" : "flex-start" }]} />
              </View>
            </TouchableOpacity>

            {form.twoTier && (
              <View style={[styles.row, { marginTop: 12 }]}>
                <View style={[styles.section, { flex: 1, marginRight: 8 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    {t("createEvent.twoTier.localLabel")}
                  </Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      testID="edit-price-local"
                      style={[styles.input, { backgroundColor: colors.surfaceGlass, borderColor: colors.border, color: colors.text }]}
                      value={form.priceLocal}
                      onChangeText={onPriceChange("priceLocal")}
                      placeholder="80"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={[styles.section, { flex: 1, marginLeft: 8 }]}>
                  <Text style={[styles.label, { color: colors.text }]}>
                    {t("createEvent.twoTier.generalLabel")}
                  </Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      testID="edit-price-general"
                      style={[styles.input, { backgroundColor: colors.surfaceGlass, borderColor: colors.border, color: colors.text }]}
                      value={form.priceGeneral}
                      onChangeText={onPriceChange("priceGeneral")}
                      placeholder="120"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* KIN-213 — membership credits. Only paid events can accept them. */}
        {isPaid && (
          <View style={styles.section}>
            <TouchableOpacity
              activeOpacity={0.8}
              testID="edit-membership-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: !!form.acceptsMembership, disabled: checkingPlans }}
              onPress={toggleMembership}
              disabled={checkingPlans}
              style={[
                styles.membershipToggle,
                {
                  backgroundColor: form.acceptsMembership ? `${colors.primary}1A` : colors.surfaceGlass,
                  borderColor: form.acceptsMembership ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.label, { color: colors.text, marginBottom: 2 }]}>
                  {t("createEvent.acceptMembershipCredits")}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {t("createEvent.membershipLetMembers")}
                </Text>
              </View>
              <View style={[styles.switchTrack, { backgroundColor: form.acceptsMembership ? colors.primary : colors.border }]}>
                <View style={[styles.switchKnob, { alignSelf: form.acceptsMembership ? "flex-end" : "flex-start" }]} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Co-hosts — only the creator manages them */}
        {isCreator && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>{t("editEvent.coHostsLabel")}</Text>
            <Text style={[styles.coHostHint, { color: colors.textSecondary }]}>
              {t("editEvent.coHostsHint")}
            </Text>
            {coHosts.map((c) => (
              <View
                key={c.id}
                style={[styles.coHostRow, { borderColor: colors.borderStrong }]}
              >
                <Text style={[styles.coHostName, { color: colors.text }]} numberOfLines={1}>
                  {c.name}
                </Text>
                <TouchableOpacity onPress={() => handleRemoveCoHost(c.id)}>
                  <Text style={{ color: colors.error, fontWeight: "700" }}>{t("editEvent.remove")}</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.coHostAddRow}>
              <TextInput
                style={[
                  styles.coHostInput,
                  { color: colors.text, borderColor: colors.borderStrong },
                ]}
                placeholder={t("editEvent.coHostEmailPlaceholder")}
                placeholderTextColor={colors.textTertiary}
                value={coHostEmail}
                onChangeText={setCoHostEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TouchableOpacity onPress={handleAddCoHost} disabled={addingCoHost}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {addingCoHost ? "…" : t("editEvent.add")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
        >
          <View
            style={[
              styles.saveGlass,
              {
                backgroundColor: colors.primary,
                opacity: saving ? 0.7 : 1,
              },
            ]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? t("editEvent.saving") : t("editEvent.saveChanges")}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* iOS Pickers */}
      {Platform.OS === "ios" && renderIOSDatePicker()}
      {Platform.OS === "ios" && renderIOSTimePicker()}

      {/* Android Pickers (render inline) */}
      {Platform.OS === "android" && showDatePicker && (
        <DateTimePicker
          value={form.date}
          mode="date"
          display="default"
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}
      {Platform.OS === "android" && showTimePicker && (
        <DateTimePicker
          value={form.date}
          mode="time"
          display="default"
          onChange={onTimeChange}
        />
      )}

      {/* KIN-214: the same modal Create uses — one pattern editor, not two. */}
      {isRecurring && (
        <RecurrenceModal
          visible={showRecurrenceModal}
          onClose={() => setShowRecurrenceModal(false)}
          initialConfig={recurrenceConfig}
          initialStartDate={form.date}
          onSave={(config) => {
            setRecurrenceConfig(config);
            setPatternDirty(true);
          }}
        />
      )}
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerCenter: {
      alignItems: "center",
    },
    backButton: {
      fontSize: 28,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    recurringBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      marginTop: 6,
    },
    recurringBadgeText: {
      fontSize: 12,
      fontWeight: "600",
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    recurringBanner: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
    },
    recurringBannerText: {
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 4,
    },
    recurringBannerSubtext: {
      fontSize: 13,
    },
    // KIN-214 — flat card inside the banner: 1px border, no shadow (§3).
    patternButton: {
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    patternSummary: {
      fontSize: 14,
      flexShrink: 1,
    },
    patternAction: {
      fontSize: 13,
      fontWeight: "600",
    },
    patternWarning: {
      marginTop: 8,
      fontSize: 12,
      lineHeight: 16,
    },
    section: {
      marginBottom: 20,
    },
    rowSection: {
      flexDirection: "row",
      marginBottom: 20,
    },
    // BUG 27: "List event publicly" toggle row.
    publicToggleRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 10,
      letterSpacing: -0.1,
    },
    // KIN-213 — copied verbatim from CreateEventScreen so the toggles and the
    // tiered-price row look identical on both screens (Regla 22: no new visual
    // pattern for a control the app already has).
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
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      overflow: "hidden",
    },
    input: {
      flex: 1,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      borderRadius: 12,
    },
    inputWithIcon: {
      paddingLeft: 0,
    },
    inputIcon: {
      marginLeft: 16,
      marginRight: 8,
    },
    textAreaWrapper: {},
    textArea: {
      minHeight: 120,
      textAlignVertical: "top",
      paddingTop: 14,
    },
    charCount: {
      fontSize: 11,
      textAlign: "right",
      marginTop: 6,
    },
    categoryScroll: {
      gap: 8,
      alignItems: "center",
    },
    categoryChip: {
      borderRadius: 10,
      overflow: "hidden",
    },
    categoryChipGlass: {
      borderWidth: 1,
      paddingVertical: 10,
      paddingHorizontal: 18,
    },
    categoryChipText: {
      fontSize: 14,
      fontWeight: "600",
    },
    dateTimeButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 14,
      borderRadius: 12,
    },
    dateTimeIcon: {
      marginRight: 8,
    },
    dateTimeText: {
      fontSize: 14,
      fontWeight: "500",
      flex: 1,
    },
    dateNote: {
      fontSize: 12,
      fontStyle: "italic",
      marginTop: -12,
      marginBottom: 16,
    },
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
    pickerTitle: {
      fontSize: 17,
      fontWeight: "600",
    },
    pickerCancel: {
      fontSize: 16,
    },
    pickerDone: {
      fontSize: 16,
      fontWeight: "600",
    },
    iosPicker: {
      height: 200,
    },
    coHostHint: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
    coHostRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    coHostName: { flex: 1, fontSize: 15, fontWeight: "600" },
    coHostAddRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
    coHostInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    saveButton: {
      borderRadius: 16,
      overflow: "hidden",
      marginTop: 8,
    },
    saveGlass: {
      paddingVertical: 16,
      alignItems: "center",
    },
    saveButtonText: {
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: -0.2,
      color: "#FFFFFF",
    },
  });
}
