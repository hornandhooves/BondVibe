import React, { useState, useEffect } from "react";
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
} from "react-native";
import { StatusBar } from "expo-status-bar";
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
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import DateTimePicker from "@react-native-community/datetimepicker";
import EventImagePicker from "../components/EventImagePicker";
import {
  uploadEventImages,
  deleteEventImage,
} from "../services/storageService";
import { EVENT_LANGUAGES } from "../utils/eventCategories";

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
  const { eventId } = route.params;
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Social",
    language: "both",
    date: new Date(),
    time: "",
    location: "",
    maxAttendees: "",
    price: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Image state
  const [eventImages, setEventImages] = useState([]); // Current images (URLs or local URIs)
  const [originalImages, setOriginalImages] = useState([]); // Original URLs from Firestore
  const [imagesToDelete, setImagesToDelete] = useState([]); // URLs to delete from Storage

  // Recurrence state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceGroupId, setRecurrenceGroupId] = useState(null);
  const [futureEventsCount, setFutureEventsCount] = useState(0);

  // Date/Time picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

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
          maxAttendees:
            data.maxAttendees?.toString() || data.maxPeople?.toString() || "",
          price: data.price?.toString() || "",
        });
        setTempDate(eventDate);

        // Load existing images
        if (data.images && Array.isArray(data.images)) {
          setEventImages(data.images);
          setOriginalImages(data.images);
        }

        // Check if this is a recurring event
        if (data.isRecurring && data.recurrenceGroupId) {
          setIsRecurring(true);
          setRecurrenceGroupId(data.recurrenceGroupId);

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
    if (!date || isNaN(date.getTime())) return "Select date";
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Format time for display
  const formatTimeDisplay = (date) => {
    if (!date || isNaN(date.getTime())) return "Select time";
    return date.toLocaleTimeString("en-US", {
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
  const handleSave = async () => {
    if (
      !form.title.trim() ||
      !form.description.trim() ||
      !form.location.trim()
    ) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    // If recurring event with multiple events from this date onwards, ask user
    if (isRecurring && futureEventsCount > 1) {
      Alert.alert(
        "Edit Recurring Event",
        "Do you want to edit only this event or this and all following events?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Only This Event",
            onPress: () => saveEvent(false),
          },
          {
            text: `This & Following (${futureEventsCount})`,
            onPress: () => saveEvent(true),
          },
        ]
      );
    } else {
      saveEvent(false);
    }
  };

  // Save event(s)
  const saveEvent = async (updateAllFuture) => {
    setSaving(true);
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

      const updateData = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        language: form.language,
        location: form.location.trim(),
        maxAttendees: parseInt(form.maxAttendees) || 10,
        maxPeople: parseInt(form.maxAttendees) || 10,
        price: parseFloat(form.price) || 0,
        images: finalImageUrls,
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

        Alert.alert(
          "Success",
          `Updated ${updatedCount} events in the series!`,
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } else {
        // Update only this event (including date/time)
        await updateDoc(doc(db, "events", eventId), {
          ...updateData,
          date: form.date.toISOString(),
          time: form.time || formatTimeDisplay(form.date),
        });

        Alert.alert("Success", "Event updated!", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }
    } catch (error) {
      console.error("Error updating event:", error);
      Alert.alert("Error", "Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  // Handle delete - check for recurring event
  const handleDelete = () => {
    if (isRecurring && futureEventsCount > 1) {
      Alert.alert(
        "Delete Recurring Event",
        "Do you want to delete only this event or this and all following events?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Only This Event",
            style: "destructive",
            onPress: () => deleteEvent(false),
          },
          {
            text: `This & Following (${futureEventsCount})`,
            style: "destructive",
            onPress: () => deleteEvent(true),
          },
        ]
      );
    } else {
      Alert.alert("Delete Event", "Are you sure? This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
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

        Alert.alert("Deleted", `${deletedCount} events deleted successfully`, [
          { text: "OK", onPress: () => navigation.navigate("Home") },
        ]);
      } else {
        // Delete only this event
        await deleteDoc(doc(db, "events", eventId));
        Alert.alert("Deleted", "Event deleted successfully", [
          { text: "OK", onPress: () => navigation.navigate("Home") },
        ]);
      }
    } catch (error) {
      console.error("Error deleting event:", error);
      Alert.alert("Error", "Failed to delete event");
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

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Edit Event
          </Text>
          {isRecurring && (
            <View
              style={[
                styles.recurringBadge,
                { backgroundColor: `${colors.primary}22` },
              ]}
            >
              <Text
                style={[styles.recurringBadgeText, { color: colors.primary }]}
              >
                🔄 Recurring
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteButton}>🗑️</Text>
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
              🔄 This is part of a recurring series ({futureEventsCount} future
              events)
            </Text>
            <Text
              style={[
                styles.recurringBannerSubtext,
                { color: colors.textSecondary },
              ]}
            >
              You can edit just this event or all future events at once.
            </Text>
          </View>
        )}

        {/* Event Title */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>
            Event Title *
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
              placeholder="Coffee & Chat"
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
            Description *
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
              placeholder="Tell people what to expect..."
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
          <Text style={[styles.label, { color: colors.text }]}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
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

        {/* Language */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text }]}>Language</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
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
            <Text style={[styles.label, { color: colors.text }]}>Date *</Text>
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
                <Text style={styles.dateTimeIcon}>📅</Text>
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
            <Text style={[styles.label, { color: colors.text }]}>Time *</Text>
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
                <Text style={styles.dateTimeIcon}>🕐</Text>
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
            Note: Date/time changes only apply to this specific event.
          </Text>
        )}

        {/* Location */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>Location *</Text>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputIcon}>📍</Text>
            <TextInput
              style={[
                styles.input,
                styles.inputWithIcon,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={form.location}
              onChangeText={(text) => setForm({ ...form, location: text })}
              placeholder="Starbucks Downtown"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* Max People & Price */}
        <View style={styles.rowSection}>
          <View style={[styles.section, { flex: 1 }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              Max People
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
              Price (MXN)
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
                onChangeText={(text) =>
                  setForm({ ...form, price: text.replace(/[^0-9.]/g, "") })
                }
                placeholder="100"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>

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
              {saving ? "Saving..." : "💾 Save Changes"}
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
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      marginTop: 6,
    },
    recurringBadgeText: {
      fontSize: 12,
      fontWeight: "600",
    },
    deleteButton: {
      fontSize: 22,
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
    section: {
      marginBottom: 20,
    },
    rowSection: {
      flexDirection: "row",
      marginBottom: 20,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 10,
      letterSpacing: -0.1,
    },
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
      fontSize: 18,
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
      fontSize: 16,
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
