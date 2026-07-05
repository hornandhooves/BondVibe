import React, { useState, useCallback } from "react";
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
  EVENT_DURATIONS,
} from "../utils/eventCategories";
import { LOCATIONS } from "../utils/locations";
import { uploadEventImages } from "../services/storageService";
import { getHostMembershipPlans } from "../services/membershipService";
import { checkAccountStatus } from "../services/stripeConnectService";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import RecurrenceModal from "../components/RecurrenceModal";
import { generateRecurringDates, getRecurrenceSummary } from "../utils/recurrenceUtils";
import { usePremium } from "../hooks/usePremium";
import { generateEventListing, isPremiumRequired } from "../services/aiService";
import DraftWithAI from "../components/ai/DraftWithAI";

// Recurrence handled by modal

// AsyncStorage key for the in-progress event draft (preserved across the
// "create a membership plan" detour so the host never loses their data).
const EVENT_DRAFT_KEY = "eventDraft";

export default function CreateEventScreen({ navigation }) {
  const { colors, isDark } = useTheme();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("social");
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const { isPremium } = usePremium();

  const handleGenerateListing = async () => {
    const idea = (description || title).trim();
    if (!idea) {
      Alert.alert(
        "Write an idea first",
        "Add a sentence about your event (or a title) and AI will generate a catchy title and description."
      );
      return;
    }
    setAiGenLoading(true);
    const r = await generateEventListing(idea, selectedCategory);
    setAiGenLoading(false);
    if (r.success) {
      if (Array.isArray(r.titles) && r.titles[0]) setTitle(r.titles[0]);
      if (r.description) setDescription(r.description);
    } else if (isPremiumRequired(r)) {
      Alert.alert("Pro feature ✨", "The AI generator is part of Kinlo Pro.", [
        { text: "Not now", style: "cancel" },
        { text: "See Pro", onPress: () => navigation.navigate("BondVibePro") },
      ]);
    } else {
      Alert.alert("Couldn't generate", r.error || "Please try again.");
    }
  };
  const [selectedLanguages, setSelectedLanguages] = useState(["es", "en"]);
  const [selectedCity, setSelectedCity] = useState("tulum");

  // Initialize with tomorrow's date and default time
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(19, 0, 0, 0); // 7 PM

  const [eventDate, setEventDate] = useState(tomorrow);
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
    summary: "One-time event",
    previewDates: [],
  });

  const [locationDetail, setLocationDetail] = useState("");
  // Coordinates + place id captured from the Google Places picker (optional;
  // when present they let attendees open a precise pin in Maps).
  const [locationCoords, setLocationCoords] = useState(null); // { latitude, longitude }
  const [placeId, setPlaceId] = useState(null);
  const [maxPeople, setMaxPeople] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("180"); // 3h default
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState("");
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

  // Filter out "all" from locations for create event
  const cityOptions = LOCATIONS.filter((loc) => loc.id !== "all");

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

  // Restore an in-progress event draft (saved before the "create a membership
  // plan" detour) so the host never loses their captured data. The draft only
  // exists during that round-trip; restore it once, then clear it.
  const restoreDraft = useCallback((d) => {
    if (typeof d.title === "string") setTitle(d.title);
    if (typeof d.description === "string") setDescription(d.description);
    if (d.selectedCategory) setSelectedCategory(d.selectedCategory);
    if (Array.isArray(d.selectedLanguages)) setSelectedLanguages(d.selectedLanguages);
    if (d.selectedCity) setSelectedCity(d.selectedCity);
    if (d.eventDate) setEventDate(new Date(d.eventDate));
    if (d.recurrenceConfig) setRecurrenceConfig(d.recurrenceConfig);
    if (typeof d.locationDetail === "string") setLocationDetail(d.locationDetail);
    if (d.locationCoords) setLocationCoords(d.locationCoords);
    if (d.placeId) setPlaceId(d.placeId);
    if (typeof d.durationMinutes === "string") setDurationMinutes(d.durationMinutes);
    if (typeof d.maxPeople === "string") setMaxPeople(d.maxPeople);
    if (typeof d.isFree === "boolean") setIsFree(d.isFree);
    if (typeof d.price === "string") setPrice(d.price);
    if (Array.isArray(d.eventImages)) setEventImages(d.eventImages);
    if (typeof d.acceptsMembership === "boolean") setAcceptsMembership(d.acceptsMembership);
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(EVENT_DRAFT_KEY);
          if (!raw) return;
          const d = JSON.parse(raw);
          // Only restore a recent draft (guards against a stale abandoned one).
          if (d.savedAt && Date.now() - d.savedAt < 2 * 60 * 60 * 1000) {
            restoreDraft(d);
          }
          await AsyncStorage.removeItem(EVENT_DRAFT_KEY);
        } catch (e) {
          // ignore
        }
      })();
    }, [restoreDraft])
  );

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
    const city = LOCATIONS.find((loc) => loc.id === cityId);
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
          "No membership plans yet",
          "To let members attend this event with a class credit, you first need to create a membership plan.",
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Create a plan",
              onPress: async () => {
                // Persist the in-progress event so the detour to create a
                // membership plan doesn't lose it.
                try {
                  await AsyncStorage.setItem(
                    EVENT_DRAFT_KEY,
                    JSON.stringify({
                      title,
                      description,
                      selectedCategory,
                      selectedLanguages,
                      selectedCity,
                      eventDate: eventDate?.toISOString?.() || null,
                      recurrenceConfig,
                      locationDetail,
                      locationCoords,
                      placeId,
                      durationMinutes,
                      maxPeople,
                      isFree,
                      price,
                      eventImages,
                      acceptsMembership,
                      savedAt: Date.now(),
                    })
                  );
                } catch (e) {
                  // ignore
                }
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

  // Handle price change with Stripe validation
  const handlePriceChange = (priceText) => {
    const priceNumber = parseInt(priceText) || 0;

    if (priceNumber > 0) {
      const canCreatePaid = userProfile?.hostConfig?.canCreatePaidEvents;

      if (!canCreatePaid) {
        const hasStripeAccount = !!userProfile?.stripeConnect?.accountId;
        Alert.alert(
          hasStripeAccount ? "Stripe Verification Pending" : "Stripe Account Required",
          hasStripeAccount
            ? "Your Stripe account is connected but still being verified. Once approved, you'll be able to create paid events."
            : "To create paid events, you need to connect your Stripe account first.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: hasStripeAccount ? "Check Status" : "Connect Stripe",
              onPress: () => navigation.navigate("StripeConnect"),
            },
          ]
        );
        return;
      }
    }

    setPrice(priceText);
  };

  // Generate recurring dates handled by recurrenceUtils

  const handleCreateEvent = async () => {
    console.log("✨ Create Event clicked");

    // Validation
    if (!title.trim()) {
      Alert.alert("Missing Information", "Please enter an event title.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Missing Information", "Please enter an event description.");
      return;
    }
    if (!locationDetail.trim()) {
      Alert.alert(
        "Missing Information",
        "Please enter a specific venue or address."
      );
      return;
    }
    if (!maxPeople || parseInt(maxPeople) < 1) {
      Alert.alert("Invalid Max People", "Maximum people must be at least 1.");
      return;
    }
    if (!isFree && (!price || parseFloat(price) <= 0)) {
      Alert.alert(
        "Invalid Price",
        "Please enter a valid price greater than 0, or mark the event as free."
      );
      return;
    }

    // Validate paid events require Stripe (self-heals a stale flag).
    const eventPrice = parseInt(price) || 0;
    if (eventPrice > 0) {
      const canCreatePaid = await canCreatePaidNow();
      if (!canCreatePaid) {
        Alert.alert(
          "Cannot Create Paid Event",
          "You need to connect and verify your Stripe account before creating paid events.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Go to Stripe Settings",
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
        "Invalid Date/Time",
        "Event must be scheduled for a future date and time."
      );
      return;
    }

    // Validate recurrence end date
    if (recurrenceConfig.type !== "none" && new Date(recurrenceConfig.endDate) <= eventDate) {
      Alert.alert(
        "Invalid End Date",
        "Recurrence end date must be after the first event date."
      );
      return;
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
        Alert.alert("Error", "You must be logged in to create an event.");
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
      const eventDates =
        recurrenceConfig.type !== "none"
          ? generateRecurringDates(eventDate, recurrenceConfig)
          : [eventDate];

      console.log(`📅 Creating ${eventDates.length} event(s)...`);

      // Limit to prevent too many events
      if (eventDates.length > 52) {
        Alert.alert(
          "Too Many Events",
          "You can create a maximum of 52 recurring events at once."
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
        // Optional precise pin from the Places picker (null when typed free-text).
        locationCoords: locationCoords || null,
        placeId: placeId || null,
        // Event length in minutes (drives the "after event" matching window).
        durationMinutes: parseInt(durationMinutes, 10) || 180,
        maxPeople: parseInt(maxPeople),
        price: isFree ? 0 : parseFloat(price),
        currency: "MXN",
        hostName:
          userData?.fullName ||
          userData?.name ||
          userData?.displayName ||
          "Host",
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
              "Partial Success",
              "Event created but images could not be uploaded. You can add them later by editing the event."
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
      }

      // Event created — drop any saved draft.
      await AsyncStorage.removeItem(EVENT_DRAFT_KEY).catch(() => {});

      setCreatedEventTitle(title.trim());
      setCreatedEventsCount(eventDates.length);
      setShowSuccessModal(true);
    } catch (error) {
      console.error("❌ Error creating event:", error);
      Alert.alert("Error", "Failed to create event. Please try again.");
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
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              Select Date
            </Text>
            <TouchableOpacity onPress={confirmDateSelection}>
              <Text style={[styles.pickerDone, { color: colors.primary }]}>
                Done
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
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              Select Time
            </Text>
            <TouchableOpacity onPress={confirmTimeSelection}>
              <Text style={[styles.pickerDone, { color: colors.primary }]}>
                Done
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
          Create Event
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

        {/* Title */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
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
              placeholder="What's your event called?"
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
            Description *
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
              placeholder="Describe your event..."
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
          <TouchableOpacity
            style={[
              styles.aiGenBtn,
              { borderColor: `${colors.primary}66`, backgroundColor: `${colors.primary}12` },
            ]}
            onPress={handleGenerateListing}
            disabled={aiGenLoading}
            activeOpacity={0.85}
          >
            {aiGenLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.aiGenText, { color: colors.primary }]}>
                ✨ Generate title & description with AI
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Category Dropdown */}
        <SelectDropdown
          label="Community *"
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          options={EVENT_CATEGORIES}
          placeholder="Select a community"
          type="category"
        />

        {/* Language Dropdown (Multi-select) */}
        <SelectDropdown
          label="Languages"
          value={selectedLanguages}
          onValueChange={setSelectedLanguages}
          options={EVENT_LANGUAGES}
          placeholder="Select languages"
          type="language"
          multiSelect
        />

        {/* City Dropdown */}
        <SelectDropdown
          label="City *"
          value={selectedCity}
          onValueChange={setSelectedCity}
          options={cityOptions}
          placeholder="Select a city"
          type="location"
        />

        {/* Specific Location/Venue — Google Places search (autofills address) */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>
            Venue / Address *
          </Text>
          <PlaceAutocomplete
            value={locationDetail}
            placeholder="Search a place, e.g. Beach Club XYZ"
            onSelect={(place) => {
              // Prefer the full formatted address; fall back to typed text.
              setLocationDetail(place.address || place.description || "");
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
          <Text style={[styles.label, { color: colors.text }]}>Event Frequency</Text>
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
                  {recurrenceConfig.type === "none" ? "One-time" : recurrenceConfig.summary}
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
              {recurrenceConfig.type !== "none" ? "Start Date *" : "Date *"}
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
            <Text style={[styles.label, { color: colors.text }]}>Time *</Text>
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
          <Text style={[styles.label, { color: colors.text }]}>Event Type</Text>
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
                Free
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
                Paid
              </Text>
            </TouchableOpacity>
          </View>
        </View>

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
                Accept membership credits
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {isFree
                  ? "Only available for paid events."
                  : "Let your members attend this event using a class credit."}
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

        {/* Event length — sets the end time; drives when Community Matching opens */}
        <SelectDropdown
          label="Event length"
          value={durationMinutes}
          onValueChange={setDurationMinutes}
          options={EVENT_DURATIONS}
          placeholder="Select duration"
          type="default"
        />

        {/* Max People and Price */}
        <View style={styles.row}>
          <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              Max People
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

          <View style={[styles.field, { flex: 1, marginLeft: 8 }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              {isFree ? "Price" : "Price (MXN) *"}
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
              <Icon
                name="dollar"
                size={20}
                color={colors.textSecondary}
                type="ui"
                style={{ marginRight: 12 }}
              />
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
              💰 You'll receive 100% of each ticket sale. Platform and
              processing fees are added at checkout.
            </Text>
            
            {/* Cancellation Policy Disclosure */}
            <View style={[styles.refundPolicyCard, { backgroundColor: `${colors.primary}11`, borderColor: `${colors.primary}33` }]}>
              <Text style={[styles.refundPolicyTitle, { color: colors.text }]}>
                📋 Cancellation Policy for Attendees
              </Text>
              <View style={styles.refundPolicyItem}>
                <Text style={[styles.refundPolicyBullet, { color: colors.primary }]}>•</Text>
                <Text style={[styles.refundPolicyItemText, { color: colors.textSecondary }]}>
                  7+ days before: 100% ticket refund
                </Text>
              </View>
              <View style={styles.refundPolicyItem}>
                <Text style={[styles.refundPolicyBullet, { color: colors.primary }]}>•</Text>
                <Text style={[styles.refundPolicyItemText, { color: colors.textSecondary }]}>
                  3-7 days before: 50% ticket refund
                </Text>
              </View>
              <View style={styles.refundPolicyItem}>
                <Text style={[styles.refundPolicyBullet, { color: colors.primary }]}>•</Text>
                <Text style={[styles.refundPolicyItemText, { color: colors.textSecondary }]}>
                  Less than 3 days: No refund
                </Text>
              </View>
              <View style={styles.refundPolicyItem}>
                <Text style={[styles.refundPolicyBullet, { color: colors.secondary }]}>•</Text>
                <Text style={[styles.refundPolicyItemText, { color: colors.textSecondary }]}>
                  If you cancel: 100% refund to attendees
                </Text>
              </View>
              <Text style={[styles.refundPolicyNote, { color: colors.textTertiary }]}>
                Service and processing fees are non-refundable.
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
            💡 Tips for great events
          </Text>
          <Text style={[styles.tipsText, { color: colors.textSecondary }]}>
            • Be specific about the vibe{"\n"}• Choose public, accessible
            locations{"\n"}• Set clear expectations
            {recurrenceConfig.type !== "none" &&
              "\n• Recurring events create independent instances"}
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
                  {recurrenceConfig.type !== "none"
                    ? "Create Recurring Events"
                    : "Create Event"}
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
          navigation.goBack();
        }}
        eventTitle={createdEventTitle}
        eventsCount={createdEventsCount}
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
    aiGenBtn: {
      marginTop: 10,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    aiGenText: { fontSize: 14, fontWeight: "700" },
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
