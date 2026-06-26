import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { createNotification } from "../utils/notificationService";
import { isUserAttending, getAttendeeIds } from "../utils/eventHelpers";
import { pesosTocentavos } from "../services/stripeService";
import CancelEventModal from "../components/CancelEventModal";
import EventImageGallery from "../components/EventImageGallery";
import EventRatings from "../components/EventRatings";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useFocusEffect } from "@react-navigation/native";
import {
  ChevronLeft,
  MessageCircle,
  Pencil,
  Trash2,
  Calendar,
  MapPin,
  Users,
  ChevronRight,
  Star,
} from "lucide-react-native";

export default function EventDetailScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { eventId } = route.params;
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isJoined, setIsJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [attendeesData, setAttendeesData] = useState([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceGroupId, setRecurrenceGroupId] = useState(null);
  const [futureEventsCount, setFutureEventsCount] = useState(0);

  const calculateDaysUntilEvent = (eventDate) => {
    const now = new Date();
    const eventDateTime = new Date(eventDate);
    const hoursUntil = (eventDateTime - now) / (1000 * 60 * 60);
    return hoursUntil / 24;
  };

  const getRefundPercentage = (daysUntil) => {
    if (daysUntil >= 7) return 100;
    if (daysUntil >= 3) return 50;
    return 0;
  };

  useEffect(() => {
    loadCurrentUser();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
    }, [eventId])
  );

  useEffect(() => {
    if (route.params?.shouldReload) {
      loadEvent();
      navigation.setParams({ shouldReload: false });
    }
  }, [route.params?.shouldReload]);

  useEffect(() => {
    if (!eventId) return;
    const eventRef = doc(db, "events", eventId);
    const unsubscribe = onSnapshot(eventRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        let eventDate = null;
        if (data.date) {
          if (data.date.toDate) eventDate = data.date.toDate();
          else if (typeof data.date === "string")
            eventDate = new Date(data.date);
          else if (data.date instanceof Date) eventDate = data.date;
        }
        let createdAtDate = null;
        if (data.createdAt) {
          if (data.createdAt.toDate) createdAtDate = data.createdAt.toDate();
          else if (typeof data.createdAt === "string")
            createdAtDate = new Date(data.createdAt);
          else if (data.createdAt instanceof Date)
            createdAtDate = data.createdAt;
        }
        const updatedEvent = {
          id: snapshot.id,
          ...data,
          date: eventDate,
          createdAt: createdAtDate,
        };
        setEvent(updatedEvent);
        setIsJoined(isUserAttending(data.attendees, auth.currentUser.uid));
        if (data.attendees && data.attendees.length > 0)
          loadAttendeesData(data.attendees);
      }
    });
    return () => unsubscribe();
  }, [eventId]);

  const loadCurrentUser = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (userDoc.exists()) setCurrentUser(userDoc.data());
    } catch (error) {
      console.error("Error loading current user:", error);
    }
  };

  const loadEvent = async () => {
    try {
      const eventDoc = await getDoc(doc(db, "events", eventId));
      if (eventDoc.exists()) {
        const eventData = { id: eventDoc.id, ...eventDoc.data() };
        setEvent(eventData);
        setIsJoined(
          isUserAttending(eventData.attendees, auth.currentUser.uid)
        );
        if (eventData.isRecurring && eventData.recurrenceGroupId) {
          setIsRecurring(true);
          setRecurrenceGroupId(eventData.recurrenceGroupId);
          const futureQuery = query(
            collection(db, "events"),
            where("recurrenceGroupId", "==", eventData.recurrenceGroupId),
            where("status", "==", "active")
          );
          const futureSnapshot = await getDocs(futureQuery);
          const thisEventDate = new Date(eventData.date);
          thisEventDate.setHours(0, 0, 0, 0);
          const thisEventTimestamp = thisEventDate.getTime();
          const futureEvents = futureSnapshot.docs.filter((d) => {
            const eData = d.data();
            const eventDateObj = new Date(eData.date);
            eventDateObj.setHours(0, 0, 0, 0);
            return eventDateObj.getTime() >= thisEventTimestamp;
          });
          setFutureEventsCount(futureEvents.length);
        } else {
          setIsRecurring(false);
          setRecurrenceGroupId(null);
          setFutureEventsCount(0);
        }
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const userData = userDoc.data();
        if (
          eventData.creatorId === auth.currentUser.uid ||
          userData?.role === "admin"
        ) {
          await loadAttendeesData(eventData.attendees || []);
        }
      } else {
        setEvent(null);
      }
    } catch (error) {
      console.error("Error loading event:", error);
      setEvent(null);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendeesData = async (attendeeIds) => {
    try {
      const validIds = getAttendeeIds(attendeeIds).filter(
        (id) => id.trim().length > 0
      );
      if (validIds.length === 0) return;
      const attendeesPromises = validIds.map(async (userId) => {
        try {
          const userDoc = await getDoc(doc(db, "users", userId));
          return userDoc.exists() ? { id: userId, ...userDoc.data() } : null;
        } catch (error) {
          return null;
        }
      });
      const attendees = await Promise.all(attendeesPromises);
      setAttendeesData(attendees.filter((a) => a !== null));
    } catch (error) {
      console.error("Error loading attendees:", error);
    }
  };

  const handleJoinLeave = async () => {
    if (!event) return;
    if (isJoined) {
      if (event.price && event.price > 0) {
        handleCancelAttendance();
        return;
      }
      setJoining(true);
      try {
        const eventRef = doc(db, "events", eventId);
        await updateDoc(eventRef, {
          attendees: arrayRemove(auth.currentUser.uid),
        });
        setIsJoined(false);
        Alert.alert("Left Event", "You have left this event");
        await loadEvent();
      } catch (error) {
        Alert.alert("Error", "Could not leave event");
      } finally {
        setJoining(false);
      }
      return;
    }
    const maxCapacity = event.maxAttendees || event.maxPeople || 0;
    const currentCount = event.attendees?.length || 0;
    if (currentCount >= maxCapacity) {
      Alert.alert("Event Full", "This event has reached maximum capacity");
      return;
    }
    if (event.price && event.price > 0) {
      const amountInCentavos = pesosTocentavos(event.price);
      navigation.navigate("Checkout", {
        eventId: event.id,
        eventTitle: event.title,
        amount: amountInCentavos,
      });
      return;
    }
    setJoining(true);
    try {
      const eventRef = doc(db, "events", eventId);
      await updateDoc(eventRef, {
        attendees: arrayUnion(auth.currentUser.uid),
      });
      setIsJoined(true);
      if (event.creatorId && event.creatorId !== auth.currentUser.uid) {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const userName = userDoc.data()?.fullName || "Someone";
        await createNotification(event.creatorId, {
          type: "event_joined",
          title: "New attendee!",
          message: `${userName} joined your "${event.title}" event`,
          icon: "👋",
          metadata: { eventId: event.id, eventTitle: event.title },
        });
      }
      Alert.alert("Joined!", "You have joined this event");
      await loadEvent();
    } catch (error) {
      Alert.alert("Error", "Could not join event");
    } finally {
      setJoining(false);
    }
  };

  const handleCancelEvent = () => {
    if (isRecurring && futureEventsCount > 1) {
      Alert.alert(
        "Delete Recurring Event",
        "Do you want to delete only this event or this and all following events?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Only This Event",
            style: "destructive",
            onPress: () => setShowCancelModal(true),
          },
          {
            text: `This & Following (${futureEventsCount})`,
            style: "destructive",
            onPress: () => cancelAllFutureEvents(),
          },
        ]
      );
    } else {
      setShowCancelModal(true);
    }
  };

  const cancelAllFutureEvents = async () => {
    try {
      setLoading(true);
      const futureQuery = query(
        collection(db, "events"),
        where("recurrenceGroupId", "==", recurrenceGroupId),
        where("status", "==", "active")
      );
      const futureSnapshot = await getDocs(futureQuery);
      const thisEventDate = new Date(event.date);
      thisEventDate.setHours(0, 0, 0, 0);
      const thisEventTimestamp = thisEventDate.getTime();
      const functions = getFunctions();
      const hostCancel = httpsCallable(functions, "hostCancelEvent");
      let cancelledCount = 0;
      let totalRefunds = 0;
      for (const docSnap of futureSnapshot.docs) {
        const eventData = docSnap.data();
        const eventDateObj = new Date(eventData.date);
        eventDateObj.setHours(0, 0, 0, 0);
        if (eventDateObj.getTime() >= thisEventTimestamp) {
          if (
            eventData.price &&
            eventData.price > 0 &&
            eventData.attendees?.length > 0
          ) {
            try {
              const result = await hostCancel({
                eventId: docSnap.id,
                reason: "Recurring series cancelled by host",
              });
              if (result.data.success)
                totalRefunds += result.data.refundsProcessed || 0;
            } catch (e) {}
          } else {
            await updateDoc(docSnap.ref, {
              status: "cancelled",
              cancelledAt: new Date().toISOString(),
              cancellationReason: "Recurring series cancelled by host",
            });
          }
          cancelledCount++;
        }
      }
      setLoading(false);
      Alert.alert(
        "Events Cancelled",
        `${cancelledCount} events cancelled.${
          totalRefunds > 0 ? ` ${totalRefunds} refunds processed.` : ""
        }`,
        [{ text: "OK", onPress: () => navigation.navigate("Home") }]
      );
    } catch (error) {
      setLoading(false);
      Alert.alert("Error", "Failed to cancel events.");
    }
  };

  const handleCancelAttendance = async () => {
    if (!event || !isJoined) return;
    const daysUntil = calculateDaysUntilEvent(event.date);
    const refundPercentage = getRefundPercentage(daysUntil);
    let refundText = "";
    if (event.price && event.price > 0) {
      if (refundPercentage === 100)
        refundText = `You will receive a 100% refund ($${event.price} MXN)`;
      else if (refundPercentage === 50)
        refundText = `You will receive a 50% refund ($${
          event.price * 0.5
        } MXN)`;
      else refundText = "No refund available (less than 3 days until event)";
    } else {
      refundText = "You will be removed from this free event";
    }
    Alert.alert(
      "Cancel Your Attendance?",
      `${refundText}\n\nAre you sure you want to cancel?`,
      [
        { text: "Keep My Spot", style: "cancel" },
        {
          text: "Cancel Attendance",
          style: "destructive",
          onPress: async () => {
            setJoining(true);
            try {
              const functions = getFunctions();
              const cancelAttendance = httpsCallable(
                functions,
                "cancelEventAttendance"
              );
              const result = await cancelAttendance({ eventId: event.id });
              if (result.data.success) {
                setIsJoined(false);
                Alert.alert(
                  "Attendance Cancelled",
                  result.data.message || "You have been removed from the event"
                );
                await loadEvent();
              } else {
                Alert.alert(
                  "Error",
                  result.data.message || "Could not cancel attendance"
                );
              }
            } catch (error) {
              Alert.alert("Error", "Failed to cancel attendance.");
            } finally {
              setJoining(false);
            }
          },
        },
      ]
    );
  };

  const performCancellation = async (cancellationReason) => {
    try {
      setShowCancelModal(false);
      setLoading(true);
      if (
        event.price &&
        event.price > 0 &&
        (event.attendees?.length > 0 || event.participants?.length > 0)
      ) {
        const functions = getFunctions();
        const hostCancel = httpsCallable(functions, "hostCancelEvent");
        const result = await hostCancel({
          eventId: event.id,
          reason: cancellationReason,
        });
        if (result.data.success) {
          Alert.alert(
            "Event Cancelled",
            result.data.message || "All attendees have been refunded."
          );
          navigation.navigate("Home");
        } else {
          throw new Error(result.data.message || "Failed to cancel event");
        }
        setLoading(false);
        return;
      }
      const eventRef = doc(db, "events", eventId);
      await updateDoc(eventRef, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancellationReason,
      });
      const allParticipants = [
        ...(event.participants || []),
        ...(event.attendees || []),
      ];
      const uniqueParticipants = [...new Set(allParticipants)];
      const reason =
        cancellationReason !== "No reason provided"
          ? `Reason: ${cancellationReason}`
          : "No reason provided.";
      for (const participantId of uniqueParticipants) {
        if (participantId !== auth.currentUser.uid) {
          try {
            await createNotification(participantId, {
              type: "event_cancelled",
              title: "Event Cancelled",
              message: `"${event.title}" has been cancelled. ${reason}`,
              icon: "🚫",
              metadata: {
                eventId: event.id,
                eventTitle: event.title,
                reason: cancellationReason,
              },
            });
          } catch (e) {}
        }
      }
      setLoading(false);
      navigation.navigate("Home");
    } catch (error) {
      setLoading(false);
      Alert.alert("Error", "Failed to cancel event.");
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

  if (!event) {
    return (
      <View
        style={[styles.errorContainer, { backgroundColor: colors.background }]}
      >
        <Text style={styles.errorEmoji}>😕</Text>
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          Event Not Found
        </Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          This event may have been deleted or cancelled
        </Text>
        <TouchableOpacity
          style={styles.errorButton}
          onPress={() => navigation.goBack()}
        >
          <View
            style={[
              styles.errorButtonGlass,
              {
                backgroundColor: `${colors.primary}33`,
                borderColor: `${colors.primary}66`,
              },
            ]}
          >
            <Text style={[styles.errorButtonText, { color: colors.primary }]}>
              Go Back
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  const isCreator = event.creatorId === auth.currentUser.uid;
  const isAdmin = currentUser?.role === "admin";
  const canSeeAttendees = isCreator || isAdmin;
  const maxCapacity = event.maxAttendees || event.maxPeople || 0;
  const currentAttendees =
    event.attendees?.length || event.participants?.length || 0;
  const spotsLeft = maxCapacity - currentAttendees;
  const isFull = spotsLeft <= 0;

  const eventTitle = event.title || "Untitled Event";
  const eventCategory = event.category || "";
  const eventLocation = event.location || "Location TBD";
  const eventDescription = event.description || "No description available";
  const eventPrice = typeof event.price === "number" ? event.price : 0;
  const eventStatus = event.status || "active";
  const eventImages = Array.isArray(event.images) ? event.images : [];
  const eventDate = event.date ? new Date(event.date) : null;
  const isPastEvent = eventDate ? eventDate < new Date() : false;

  const getButtonText = () => {
    if (joining) return "Loading...";
    if (isJoined) return "Leave Event";
    if (isFull) return "Event Full";
    if (eventPrice > 0) return `Pay $${eventPrice} MXN`;
    return "Join Event (Free)";
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <View
            style={[
              styles.headerButton,
              {
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
              },
            ]}
          >
            <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
          </View>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {(isJoined || isCreator) && (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("EventChat", {
                  eventId: event.id,
                  eventTitle,
                })
              }
            >
              <View
                style={[
                  styles.headerButton,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
                  },
                ]}
              >
                <MessageCircle size={20} color={colors.text} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          )}
          {isCreator && (
            <TouchableOpacity
              onPress={() => navigation.navigate("EditEvent", { eventId })}
            >
              <View
                style={[
                  styles.headerButton,
                  {
                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
                  },
                ]}
              >
                <Pencil size={18} color={colors.text} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          )}
          {(isCreator || isAdmin) && eventStatus !== "cancelled" && (
            <TouchableOpacity onPress={handleCancelEvent}>
              <View
                style={[
                  styles.headerButton,
                  {
                    backgroundColor: `${colors.error}20`,
                    borderColor: colors.error,
                  },
                ]}
              >
                <Trash2 size={18} color={colors.error} strokeWidth={2} />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {eventImages.length > 0 && <EventImageGallery images={eventImages} />}

        <View style={styles.heroSection}>
          <View style={styles.categoryRow}>
            {eventCategory !== "" && (
              <View
                style={[
                  styles.categoryBadge,
                  {
                    backgroundColor: `${colors.primary}26`,
                    borderColor: `${colors.primary}4D`,
                  },
                ]}
              >
                <Text style={[styles.categoryText, { color: colors.primary }]}>
                  {eventCategory}
                </Text>
              </View>
            )}
            {eventPrice === 0 ? (
              <View style={styles.freeBadge}>
                <Text style={styles.freeBadgeText}>FREE</Text>
              </View>
            ) : eventPrice > 0 ? (
              <View
                style={[
                  styles.priceBadge,
                  {
                    backgroundColor: `${colors.secondary}26`,
                    borderColor: `${colors.secondary}4D`,
                  },
                ]}
              >
                <Text style={[styles.priceText, { color: colors.secondary }]}>
                  ${eventPrice}
                </Text>
              </View>
            ) : null}
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
            {event.language && event.language !== "both" && (
              <View
                style={[
                  styles.languageBadge,
                  { backgroundColor: "rgba(100, 100, 255, 0.15)" },
                ]}
              >
                <Text style={styles.languageBadgeText}>
                  {event.language === "es" ? "🇲🇽 Español" : "🇺🇸 English"}
                </Text>
              </View>
            )}
            {event.language === "both" && (
              <View
                style={[
                  styles.languageBadge,
                  { backgroundColor: "rgba(100, 200, 100, 0.15)" },
                ]}
              >
                <Text style={styles.languageBadgeText}>🌎 Bilingual</Text>
              </View>
            )}
            {event.averageRating > 0 && (
              <View
                style={[
                  styles.ratingBadge,
                  { backgroundColor: "rgba(255, 215, 0, 0.15)" },
                ]}
              >
                <Star
                  size={12}
                  color="#FFD700"
                  fill="#FFD700"
                  strokeWidth={1.5}
                />
                <Text style={styles.ratingBadgeText}>
                  {event.averageRating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.title, { color: colors.text }]}>
            {eventTitle}
          </Text>
          {eventStatus === "cancelled" && (
            <View
              style={[
                styles.cancelledBadge,
                {
                  backgroundColor: `${colors.error}20`,
                  borderColor: colors.error,
                },
              ]}
            >
              <Text style={[styles.cancelledText, { color: colors.error }]}>
                🚫 Event Cancelled
              </Text>
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <View
              style={[
                styles.infoGlass,
                {
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}15` },
                ]}
              >
                <Calendar size={22} color={colors.primary} strokeWidth={1.8} />
              </View>
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  Date & Time
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {event.date
                    ? (() => {
                        const d = new Date(event.date);
                        const dateStr = d.toLocaleDateString("en-US", {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                        const timeStr =
                          event.time ||
                          d.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          });
                        return `${dateStr} at ${timeStr}`;
                      })()
                    : "Date TBD"}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.infoCard}>
            <View
              style={[
                styles.infoGlass,
                {
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}15` },
                ]}
              >
                <MapPin size={22} color={colors.primary} strokeWidth={1.8} />
              </View>
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  Location
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {eventLocation}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.infoCard}>
            <View
              style={[
                styles.infoGlass,
                {
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}15` },
                ]}
              >
                <Users size={22} color={colors.primary} strokeWidth={1.8} />
              </View>
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  Attendees
                </Text>
                <Text
                  style={[styles.infoValue, { color: colors.text }]}
                >{`${currentAttendees}/${maxCapacity}${
                  isFull ? " (Full)" : ` (${spotsLeft} spots left)`
                }`}</Text>
              </View>
            </View>
          </View>
        </View>

        {(isJoined || isCreator) && (
          <View style={styles.chatSection}>
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() =>
                navigation.navigate("EventChat", {
                  eventId: event.id,
                  eventTitle,
                })
              }
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.chatGlass,
                  {
                    backgroundColor: `${colors.primary}1A`,
                    borderColor: `${colors.primary}33`,
                  },
                ]}
              >
                <View
                  style={[
                    styles.chatIconCircle,
                    { backgroundColor: `${colors.primary}25` },
                  ]}
                >
                  <MessageCircle
                    size={24}
                    color={colors.primary}
                    strokeWidth={1.8}
                  />
                </View>
                <View style={styles.chatContent}>
                  <Text style={[styles.chatTitle, { color: colors.primary }]}>
                    Group Chat
                  </Text>
                  <Text
                    style={[
                      styles.chatSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Connect with other attendees
                  </Text>
                </View>
                <ChevronRight
                  size={24}
                  color={colors.primary}
                  strokeWidth={2}
                />
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.descriptionSection}>
          <View
            style={[
              styles.descriptionGlass,
              {
                backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              About
            </Text>
            <Text
              style={[styles.descriptionText, { color: colors.textSecondary }]}
            >
              {eventDescription}
            </Text>
          </View>
        </View>

        {/* Event Ratings - Only visible to host for past events */}
        {isPastEvent && isCreator && (
          <EventRatings eventId={eventId} isHost={isCreator} />
        )}

        {eventPrice > 0 && (
          <View style={styles.policySection}>
            <View
              style={[
                styles.policyGlass,
                {
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                📋 Cancellation Policy
              </Text>
              <View style={styles.policyItem}>
                <Text style={[styles.policyDot, { color: colors.primary }]}>
                  •
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                >
                  7+ days before: 100% refund (minus fees)
                </Text>
              </View>
              <View style={styles.policyItem}>
                <Text style={[styles.policyDot, { color: colors.primary }]}>
                  •
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                >
                  3-7 days before: 50% refund (minus fees)
                </Text>
              </View>
              <View style={styles.policyItem}>
                <Text style={[styles.policyDot, { color: colors.primary }]}>
                  •
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                >
                  Less than 3 days: No refund
                </Text>
              </View>
              <View
                style={[
                  styles.policyDivider,
                  { backgroundColor: colors.border },
                ]}
              />
              <View style={styles.policyItem}>
                <Text style={[styles.policyDot, { color: colors.secondary }]}>
                  •
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                >
                  If host cancels: 100% refund (minus fees)
                </Text>
              </View>
            </View>
          </View>
        )}

        {canSeeAttendees && attendeesData.length > 0 && (
          <View style={styles.attendeesSection}>
            <View
              style={[
                styles.attendeesGlass,
                {
                  backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)",
                },
              ]}
            >
              <Text
                style={[styles.sectionTitle, { color: colors.text }]}
              >{`Attendees (${attendeesData.length})`}</Text>
              {attendeesData.map((attendee, index) => (
                <View key={index} style={styles.attendeeRow}>
                  <View
                    style={[
                      styles.attendeeAvatar,
                      {
                        backgroundColor: `${colors.primary}26`,
                        borderColor: `${colors.primary}4D`,
                      },
                    ]}
                  >
                    <AvatarDisplay avatar={attendee.avatar || { type: "emoji", value: attendee.emoji || "😊" }} size={36} />
                  </View>
                  <Text style={[styles.attendeeName, { color: colors.text }]}>
                    {attendee.fullName || attendee.name || "Anonymous"}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {!isCreator && eventStatus !== "cancelled" && !isPastEvent && (
        <View style={styles.bottomAction}>
          <View
            style={[
              styles.bottomGlass,
              {
                backgroundColor: isDark
                  ? "rgba(11, 15, 26, 0.95)"
                  : "rgba(250, 250, 252, 0.95)",
                borderTopColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.actionButton,
                isFull && !isJoined && styles.actionButtonDisabled,
              ]}
              onPress={handleJoinLeave}
              disabled={joining || (isFull && !isJoined)}
            >
              <View
                style={[
                  styles.actionButtonGlass,
                  {
                    backgroundColor: isJoined
                      ? colors.surfaceGlass
                      : eventPrice > 0
                      ? colors.primary
                      : `${colors.primary}33`,
                    borderColor: isJoined
                      ? colors.border
                      : eventPrice > 0
                      ? colors.primary
                      : `${colors.primary}66`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.actionButtonText,
                    {
                      color:
                        eventPrice > 0 && !isJoined
                          ? "#FFFFFF"
                          : isJoined
                          ? colors.text
                          : colors.primary,
                    },
                  ]}
                >
                  {getButtonText()}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <CancelEventModal
        visible={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={performCancellation}
        eventTitle={eventTitle}
      />
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 48,
    },
    errorEmoji: { fontSize: 80, marginBottom: 24 },
    errorTitle: {
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 12,
      letterSpacing: -0.3,
    },
    errorText: { fontSize: 15, textAlign: "center", marginBottom: 32 },
    errorButton: { borderRadius: 16, overflow: "hidden" },
    errorButtonGlass: {
      borderWidth: 1,
      paddingVertical: 14,
      paddingHorizontal: 32,
      alignItems: "center",
    },
    errorButtonText: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
      marginLeft: 8,
    },
    headerActions: { flexDirection: "row" },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 120 },
    heroSection: { marginBottom: 24 },
    categoryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
      flexWrap: "wrap",
    },
    categoryBadge: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
    },
    categoryText: { fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
    freeBadge: {
      backgroundColor: "rgba(166, 255, 150, 0.15)",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(166, 255, 150, 0.3)",
    },
    freeBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#A6FF96",
      letterSpacing: 0.5,
    },
    priceBadge: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    priceText: { fontSize: 14, fontWeight: "700" },
    recurringBadge: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 10,
    },
    recurringBadgeText: { fontSize: 12, fontWeight: "600" },
    ratingBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 10,
      gap: 4,
      borderWidth: 1,
      borderColor: "rgba(255, 215, 0, 0.3)",
    },
    ratingBadgeText: { fontSize: 12, fontWeight: "700", color: "#FFD700" },
    languageBadge: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(100, 100, 255, 0.3)",
    },
    languageBadgeText: { fontSize: 12, fontWeight: "600", color: "#FFFFFF" },
    title: {
      fontSize: 28,
      fontWeight: "700",
      lineHeight: 36,
      letterSpacing: -0.5,
    },
    cancelledBadge: {
      marginTop: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    cancelledText: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
    infoSection: { gap: 12, marginBottom: 24 },
    infoCard: { borderRadius: 16, overflow: "hidden" },
    infoGlass: {
      borderWidth: 1,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 16,
    },
    infoIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    infoContent: { flex: 1 },
    infoLabel: { fontSize: 12, marginBottom: 4, letterSpacing: 0.3 },
    infoValue: { fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
    chatSection: { marginBottom: 24 },
    chatButton: { borderRadius: 20, overflow: "hidden" },
    chatGlass: {
      borderWidth: 1,
      padding: 20,
      flexDirection: "row",
      alignItems: "center",
    },
    chatIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    chatContent: { flex: 1 },
    chatTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 4,
      letterSpacing: -0.3,
    },
    chatSubtitle: { fontSize: 13 },
    descriptionSection: {
      marginBottom: 24,
      borderRadius: 16,
      overflow: "hidden",
    },
    descriptionGlass: { borderWidth: 1, padding: 20 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 14,
      letterSpacing: -0.2,
    },
    descriptionText: { fontSize: 15, lineHeight: 24 },
    policySection: { marginBottom: 24, borderRadius: 16, overflow: "hidden" },
    policyGlass: { borderWidth: 1, padding: 20 },
    policyItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 10,
    },
    policyDot: { fontSize: 16, marginRight: 8, marginTop: 2 },
    policyText: { fontSize: 14, lineHeight: 20, flex: 1 },
    policyDivider: { height: 1, marginVertical: 14 },
    attendeesSection: {
      marginBottom: 24,
      borderRadius: 16,
      overflow: "hidden",
    },
    attendeesGlass: { borderWidth: 1, padding: 20 },
    attendeeRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.05)",
    },
    attendeeAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    attendeeEmoji: { fontSize: 20 },
    attendeeName: { fontSize: 15, fontWeight: "600" },
    bottomAction: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingBottom: 40,
    },
    bottomGlass: { borderTopWidth: 1, padding: 24 },
    actionButton: { borderRadius: 16, overflow: "hidden" },
    actionButtonDisabled: { opacity: 0.5 },
    actionButtonGlass: {
      borderWidth: 1,
      paddingVertical: 16,
      alignItems: "center",
    },
    actionButtonText: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  });
}
