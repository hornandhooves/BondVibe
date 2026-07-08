import React, { useState, useEffect, useCallback } from "react";
import Icon from "../components/Icon";
import TranslateButton from "../components/TranslateButton";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
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
import {
  isUserAttending,
  getAttendeeIds,
  getEventCreatorId,
} from "../utils/eventHelpers";
import {
  getHostMembershipPlans,
  getUsableMembershipForHost,
  getUserReservationForEvent,
  releaseMembershipReservation,
} from "../services/membershipService";
import { getMyPricingTierForHost } from "../services/businessMembersService";
import { pesosTocentavos } from "../services/stripeService";
import CancelEventModal from "../components/CancelEventModal";
import MatchingEntryCard from "../components/MatchingEntryCard";
import EventImageGallery from "../components/EventImageGallery";
import EventRatings from "../components/EventRatings";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useFocusEffect } from "@react-navigation/native";
import { usePremium } from "../hooks/usePremium";
import { buildCheckinPayload } from "../services/checkinService";
import { joinFreeEvent } from "../services/eventJoinService";
import { getMatchInsight } from "../utils/personalityScoring";
import { getFollowing } from "../services/followService";

export default function EventDetailScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const { eventId } = route.params;
  const [event, setEvent] = useState(null);
  const [matchInsight, setMatchInsight] = useState(null);
  const [friendsGoing, setFriendsGoing] = useState([]);

  // "Friends going": event attendees the current user follows.
  useEffect(() => {
    if (!event) return;
    let active = true;
    (async () => {
      const attendees = getAttendeeIds(event.attendees);
      if (attendees.length === 0) return;
      const following = await getFollowing();
      if (!active || following.length === 0) return;
      const ids = attendees.filter(
        (id) => following.includes(id) && id !== auth.currentUser?.uid
      );
      const users = await Promise.all(
        ids.slice(0, 12).map(async (id) => {
          const u = await getDoc(doc(db, "users", id));
          const d = u.exists() ? u.data() : {};
          return { id, name: d.fullName || d.name || t("eventDetail.defaultFriendName"), avatar: d.avatar };
        })
      );
      if (active) setFriendsGoing(users);
    })();
    return () => {
      active = false;
    };
  }, [event?.attendees?.length]);
  const [loading, setLoading] = useState(true);
  const [isJoined, setIsJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const { isPremium } = usePremium();
  const [currentUser, setCurrentUser] = useState(null);
  const [attendeesData, setAttendeesData] = useState([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceGroupId, setRecurrenceGroupId] = useState(null);
  const [futureEventsCount, setFutureEventsCount] = useState(0);
  const [hostHasPlans, setHostHasPlans] = useState(false);
  const [usableMembership, setUsableMembership] = useState(null);
  const [userReservation, setUserReservation] = useState(null);
  const [hostRating, setHostRating] = useState(null);

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

  // Load membership context: does the host sell plans, does the user have a
  // usable membership, and do they already hold a reservation for this event.
  useEffect(() => {
    const creatorId = getEventCreatorId(event);
    if (!creatorId) return;
    let active = true;
    (async () => {
      const [plans, membership, reservation, hostSnap, meSnap] = await Promise.all([
        getHostMembershipPlans(creatorId, { activeOnly: true }),
        getUsableMembershipForHost(creatorId),
        getUserReservationForEvent(eventId),
        getDoc(doc(db, "users", creatorId)),
        getDoc(doc(db, "users", auth.currentUser.uid)),
      ]);
      if (!active) return;
      setHostHasPlans(plans.length > 0);
      setUsableMembership(membership);
      setUserReservation(reservation);
      setHostRating(hostSnap.exists() ? hostSnap.data().hostStats || null : null);
      // Explainable, humble fit between the current user and the host.
      const hostP = hostSnap.exists() ? hostSnap.data().personality : null;
      const meP = meSnap.exists() ? meSnap.data().personality : null;
      setMatchInsight(creatorId === auth.currentUser.uid ? null : getMatchInsight(meP, hostP));
    })();
    return () => {
      active = false;
    };
  }, [event?.creatorId, event?.createdBy, eventId, isJoined]);

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

  // Two-tier pricing (kinlo_business/05 §C): a Local member sees/pays the local
  // price. The server re-resolves this authoritatively at checkout — this keeps
  // the displayed amount consistent with what's charged.
  const resolveTierPrice = async () => {
    if (!event?.twoTier || typeof event.priceLocal !== "number") return event?.price || 0;
    try {
      const tier = await getMyPricingTierForHost(getEventCreatorId(event));
      return tier === "local" ? event.priceLocal : event.price;
    } catch (e) {
      return event.price;
    }
  };

  // Join the event by paying (paid events) or for free.
  const proceedJoinPayOrFree = async () => {
    if (event.price && event.price > 0) {
      const pesos = await resolveTierPrice();
      const amountInCentavos = pesosTocentavos(pesos);
      navigation.navigate("Checkout", {
        eventId: event.id,
        eventTitle: event.title,
        amount: amountInCentavos,
      });
      return;
    }
    setJoining(true);
    try {
      const r = await joinFreeEvent(eventId);
      if (!r.success) {
        Alert.alert(t("eventDetail.alerts.couldntJoinTitle"), r.error);
        return;
      }
      if (r.waitlisted) {
        Alert.alert(
          t("eventDetail.alerts.waitlistTitle"),
          t("eventDetail.alerts.waitlistMsg", { position: r.position || "" })
        );
      } else {
        setIsJoined(true);
        // The host's "new attendee" notification (bubble + push) is sent by the
        // onEventAttendeesChanged Cloud Function for all join paths.
        Alert.alert(t("eventDetail.alerts.joinedTitle"), t("eventDetail.alerts.joinedMsg"));
      }
      await loadEvent();
    } catch (error) {
      Alert.alert(t("eventDetail.alerts.errorTitle"), t("eventDetail.alerts.couldNotJoin"));
    } finally {
      setJoining(false);
    }
  };

  const handleJoinLeave = async () => {
    if (!event) return;

    if (isJoined) {
      // Joined with a membership credit → release (returns credit if ≥2h).
      if (userReservation) {
        setJoining(true);
        try {
          const r = await releaseMembershipReservation(userReservation.id);
          setIsJoined(false);
          setUserReservation(null);
          Alert.alert(
            t("eventDetail.alerts.leftEventCreditTitle"),
            r.forfeited
              ? t("eventDetail.alerts.forfeitedMsg")
              : t("eventDetail.alerts.returnedMsg")
          );
          await loadEvent();
        } catch (error) {
          Alert.alert(t("eventDetail.alerts.errorTitle"), t("eventDetail.alerts.couldNotLeave"));
        } finally {
          setJoining(false);
        }
        return;
      }
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
        Alert.alert(t("eventDetail.alerts.leftEventTitle"), t("eventDetail.alerts.leftEventMsg"));
        await loadEvent();
      } catch (error) {
        Alert.alert(t("eventDetail.alerts.errorTitle"), t("eventDetail.alerts.couldNotLeave"));
      } finally {
        setJoining(false);
      }
      return;
    }

    const maxCapacity = event.maxAttendees || event.maxPeople || 0;
    const currentCount = event.attendees?.length || 0;
    if (currentCount >= maxCapacity) {
      Alert.alert(t("eventDetail.alerts.eventFullTitle"), t("eventDetail.alerts.eventFullMsg"));
      return;
    }

    // When there's a real choice — a paid event, or the host offers
    // memberships this event accepts — show the full "How to attend" screen.
    const membershipOption =
      event.acceptsMembership !== false && (hostHasPlans || usableMembership);
    const isPaid = event.price && event.price > 0;

    if (isPaid || membershipOption) {
      const tierPrice = await resolveTierPrice();
      navigation.navigate("HowToAttend", {
        eventId,
        eventTitle: event.title,
        price: tierPrice,
        hostId: getEventCreatorId(event),
        hostName: event.hostName || t("eventDetail.defaultHostName"),
        acceptsMembership: event.acceptsMembership !== false,
      });
      return;
    }

    proceedJoinPayOrFree();
  };

  const handleCancelEvent = () => {
    if (isRecurring && futureEventsCount > 1) {
      Alert.alert(
        t("eventDetail.alerts.deleteRecurringTitle"),
        t("eventDetail.alerts.deleteRecurringMsg"),
        [
          { text: t("eventDetail.alerts.cancel"), style: "cancel" },
          {
            text: t("eventDetail.alerts.onlyThisEvent"),
            style: "destructive",
            onPress: () => setShowCancelModal(true),
          },
          {
            text: t("eventDetail.alerts.thisAndFollowing", { count: futureEventsCount }),
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
        t("eventDetail.alerts.eventsCancelledTitle"),
        t("eventDetail.alerts.eventsCancelledMsg", {
          count: cancelledCount,
          refunds: totalRefunds > 0
            ? t("eventDetail.alerts.refundsProcessed", { count: totalRefunds })
            : "",
        }),
        [{ text: t("eventDetail.alerts.ok"), onPress: () => navigation.navigate("MainTabs", { screen: "HomeTab" }) }]
      );
    } catch (error) {
      setLoading(false);
      Alert.alert(t("eventDetail.alerts.errorTitle"), t("eventDetail.alerts.failedCancelEvents"));
    }
  };

  const handleCancelAttendance = async () => {
    if (!event || !isJoined) return;
    const daysUntil = calculateDaysUntilEvent(event.date);
    const refundPercentage = getRefundPercentage(daysUntil);
    let refundText = "";
    if (event.price && event.price > 0) {
      if (refundPercentage === 100)
        refundText = t("eventDetail.alerts.refund100", { price: event.price });
      else if (refundPercentage === 50)
        refundText = t("eventDetail.alerts.refund50", { price: event.price * 0.5 });
      else refundText = t("eventDetail.alerts.noRefund");
    } else {
      refundText = t("eventDetail.alerts.freeEventRemoved");
    }
    Alert.alert(
      t("eventDetail.alerts.cancelAttendanceTitle"),
      t("eventDetail.alerts.cancelAttendanceMsg", { refundText }),
      [
        { text: t("eventDetail.alerts.keepMySpot"), style: "cancel" },
        {
          text: t("eventDetail.alerts.cancelAttendance"),
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
                  t("eventDetail.alerts.attendanceCancelledTitle"),
                  result.data.message || t("eventDetail.alerts.removedFromEvent")
                );
                await loadEvent();
              } else {
                Alert.alert(
                  t("eventDetail.alerts.errorTitle"),
                  result.data.message || t("eventDetail.alerts.couldNotCancelAttendance")
                );
              }
            } catch (error) {
              Alert.alert(t("eventDetail.alerts.errorTitle"), t("eventDetail.alerts.failedCancelAttendance"));
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
            t("eventDetail.alerts.eventCancelledTitle"),
            result.data.message || t("eventDetail.alerts.allRefunded")
          );
          navigation.navigate("MainTabs", { screen: "HomeTab" });
        } else {
          throw new Error(result.data.message || t("eventDetail.alerts.failedCancelEvent"));
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
          ? t("eventDetail.alerts.reasonPrefix", { reason: cancellationReason })
          : t("eventDetail.alerts.noReasonProvided");
      for (const participantId of uniqueParticipants) {
        if (participantId !== auth.currentUser.uid) {
          try {
            await createNotification(participantId, {
              type: "event_cancelled",
              title: t("eventDetail.alerts.notifCancelledTitle"),
              message: t("eventDetail.alerts.notifCancelledMsg", { title: event.title, reason }),
              icon: "block",
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
      navigation.navigate("MainTabs", { screen: "HomeTab" });
    } catch (error) {
      setLoading(false);
      Alert.alert(t("eventDetail.alerts.errorTitle"), t("eventDetail.alerts.failedCancelEvent"));
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
        <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <Icon name="alert" size={36} color={colors.primary} />
        </View>
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          {t("eventDetail.errorNotFoundTitle")}
        </Text>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          {t("eventDetail.errorNotFoundText")}
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
              {t("eventDetail.goBack")}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  const isCreator = event.creatorId === auth.currentUser.uid;
  const isCoHost =
    Array.isArray(event.coHosts) && event.coHosts.includes(auth.currentUser.uid);
  const isManager = isCreator || isCoHost;
  const isAdmin = currentUser?.role === "admin";
  const canSeeAttendees = isCreator || isAdmin;
  const maxCapacity = event.maxAttendees || event.maxPeople || 0;
  const currentAttendees =
    event.attendees?.length || event.participants?.length || 0;
  const spotsLeft = maxCapacity - currentAttendees;
  const isFull = spotsLeft <= 0;

  const eventTitle = event.title || t("myEvents.untitledEvent");
  const eventCategory = event.category || "";
  const eventLocation = event.location || t("myEvents.locationTBD");
  // Prefer a precise pin (lat,lng) from the Places picker; fall back to a text
  // search by the location string. place_id sharpens the pin when present.
  const mapsQuery =
    event.locationCoords &&
    typeof event.locationCoords.latitude === "number" &&
    typeof event.locationCoords.longitude === "number"
      ? `${event.locationCoords.latitude},${event.locationCoords.longitude}`
      : eventLocation;
  const mapsUrl = event.placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        mapsQuery
      )}&query_place_id=${event.placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        mapsQuery
      )}`;
  const eventDescription = event.description || t("eventDetail.noDescription");
  const eventPrice = typeof event.price === "number" ? event.price : 0;
  const eventStatus = event.status || "active";
  const eventImages = Array.isArray(event.images) ? event.images : [];
  const eventDate = event.date ? new Date(event.date) : null;
  const isPastEvent = eventDate ? eventDate < new Date() : false;

  const getButtonText = () => {
    if (joining) return t("eventDetail.buttonLoading");
    if (isJoined) return t("eventDetail.buttonLeaveEvent");
    if (isFull) return t("eventDetail.buttonEventFull");
    // A paid event or one that accepts membership opens the "How to attend"
    // screen, so the button reflects attending rather than a fixed price.
    if (eventPrice > 0 || (event.acceptsMembership !== false && hostHasPlans)) {
      return t("eventDetail.buttonAttendThisEvent");
    }
    return t("eventDetail.buttonJoinFree");
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
                backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
              },
            ]}
          >
            <Icon name="back" size={24} color={colors.text} />
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
                    backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
                  },
                ]}
              >
                <Icon name="message" size={20} color={colors.text} />
              </View>
            </TouchableOpacity>
          )}
          {isManager && (
            <TouchableOpacity
              onPress={() =>
                isPremium
                  ? navigation.navigate("CheckInScanner", {
                      eventId,
                      eventTitle,
                    })
                  : navigation.navigate("BondVibePro")
              }
            >
              <View
                style={[
                  styles.headerButton,
                  { backgroundColor: colors.surface, borderColor: colors.borderStrong },
                ]}
              >
                <Icon name="qr" size={20} color={colors.text} />
              </View>
            </TouchableOpacity>
          )}
          {isManager && (
            <TouchableOpacity
              onPress={() => navigation.navigate("EditEvent", { eventId })}
            >
              <View
                style={[
                  styles.headerButton,
                  {
                    backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
                  },
                ]}
              >
                <Icon name="edit" size={18} color={colors.text} />
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
                <Icon name="delete" size={18} color={colors.error} />
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
                <Text style={styles.freeBadgeText}>{t("searchEvents.free_badge")}</Text>
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
                  {t("eventDetail.recurring")}
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
                  {event.language === "es" ? t("eventDetail.languageSpanish") : t("eventDetail.languageEnglish")}
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
                <Text style={styles.languageBadgeText}>{t("eventDetail.bilingual")}</Text>
              </View>
            )}
            {event.averageRating > 0 && (
              <View
                style={[
                  styles.ratingBadge,
                  { backgroundColor: "rgba(255, 215, 0, 0.15)" },
                ]}
              >
                <Icon name="star"
                  size={12}
                  color="#FFD700"
                  fill="#FFD700"
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
                {t("eventDetail.eventCancelledBadge")}
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
                  backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}15` },
                ]}
              >
                <Icon name="calendar" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  {t("eventDetail.dateTimeLabel")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {event.date
                    ? (() => {
                        const d = new Date(event.date);
                        const dateStr = d.toLocaleDateString(i18n.language, {
                          weekday: "short",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        });
                        const timeStr =
                          event.time ||
                          d.toLocaleTimeString(i18n.language, {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          });
                        return `${dateStr} at ${timeStr}`;
                      })()
                    : t("eventDetail.dateTBD")}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={styles.infoCard}
            activeOpacity={event.location ? 0.85 : 1}
            disabled={!event.location}
            onPress={() => event.location && Linking.openURL(mapsUrl)}
          >
            <View
              style={[
                styles.infoGlass,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}15` },
                ]}
              >
                <Icon name="location" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  {t("eventDetail.locationLabel")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {eventLocation}
                </Text>
                {!!event.location && (
                  <Text style={[styles.infoLabel, { color: colors.primary, marginTop: 2 }]}>
                    {t("eventDetail.openInMaps")}
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.infoCard}
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate("MainTabs", { screen: "RentalsTab", params: { eventId, eventTitle } })
            }
          >
            <View
              style={[
                styles.infoGlass,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}15` },
                ]}
              >
                <Icon name="bike" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  {t("eventDetail.getAroundLabel")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {t("eventDetail.rentScooterText")}
                </Text>
              </View>
              <Icon name="forward" size={20} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>
          <View style={styles.infoCard}>
            <View
              style={[
                styles.infoGlass,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}15` },
                ]}
              >
                <Icon name="users" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text
                  style={[styles.infoLabel, { color: colors.textSecondary }]}
                >
                  {t("eventDetail.attendeesLabel")}
                </Text>
                <Text
                  style={[styles.infoValue, { color: colors.text }]}
                >{`${currentAttendees}/${maxCapacity} ${
                  isFull ? t("eventDetail.full") : t("eventDetail.spotsLeft", { count: spotsLeft })
                }`}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Community Matching entry — §3 gating (locked → open → closed) */}
        <View style={{ marginBottom: 16 }}>
          <MatchingEntryCard event={event} isHost={isCreator} />
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
                  <Icon name="message"
                    size={24}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.chatContent}>
                  <Text style={[styles.chatTitle, { color: colors.primary }]}>
                    {t("eventDetail.groupChat")}
                  </Text>
                  <Text
                    style={[
                      styles.chatSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {t("eventDetail.connectWithAttendees")}
                  </Text>
                </View>
                <Icon name="forward"
                  size={24}
                  color={colors.primary}
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
                backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("eventDetail.about")}
            </Text>
            <Text
              style={[styles.descriptionText, { color: colors.textSecondary }]}
            >
              {eventDescription}
            </Text>
            <TranslateButton
              text={eventDescription}
              contentId={`event_${event.id}`}
              navigation={navigation}
              style={{ marginTop: 14 }}
            />
          </View>
        </View>

        {/* Friends going — social proof */}
        {friendsGoing.length > 0 && (
          <View style={styles.friendsRow}>
            <View style={{ flexDirection: "row" }}>
              {friendsGoing.slice(0, 5).map((f, i) => (
                <View key={f.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                  <AvatarDisplay
                    avatar={
                      typeof f.avatar === "string"
                        ? { type: "emoji", value: f.avatar }
                        : f.avatar || null
                    }
                    size={30}
                  />
                </View>
              ))}
            </View>
            <Text style={[styles.friendsText, { color: colors.text }]}>
              {t("eventDetail.friendsGoing", { count: friendsGoing.length })}
            </Text>
          </View>
        )}

        {/* Explainable fit with the host (only when both have real profiles) */}
        {matchInsight && (
          <View
            style={[
              styles.matchChip,
              {
                borderColor: matchInsight.strong ? "#34C759" : "#F59E0B",
                backgroundColor: matchInsight.strong ? "#34C75915" : "#F59E0B15",
              },
            ]}
          >
            <Text
              style={[
                styles.matchLabel,
                { color: matchInsight.strong ? "#34C759" : "#F59E0B" },
              ]}
            >
              {t("eventDetail.fitWithHost", { label: matchInsight.label })}
            </Text>
            {!!matchInsight.why && (
              <Text style={[styles.matchWhy, { color: colors.textSecondary }]}>
                {matchInsight.why}
              </Text>
            )}
          </View>
        )}

        {/* Public host rating — auto-calculated, not editable by the host */}
        {hostRating && hostRating.totalRatings > 0 && (
          <View style={[styles.infoCard, { marginBottom: 12 }]}>
            <View
              style={[
                styles.infoGlass,
                {
                  backgroundColor: isDark
                    ? "rgba(255, 255, 255, 0.04)"
                    : "rgba(255, 255, 255, 0.85)",
                  borderColor: isDark
                    ? "rgba(255, 255, 255, 0.10)"
                    : "rgba(0, 0, 0, 0.08)",
                },
              ]}
            >
              <View
                style={[styles.infoIconCircle, { backgroundColor: "rgba(255, 215, 0, 0.2)" }]}
              >
                <Icon name="star" size={22} color="#FFD700" fill="#FFD700" />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {t("eventDetail.hostRatingLabel")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {hostRating.averageRating?.toFixed(1)} ·{" "}
                  {t("eventDetail.reviewCount", { count: hostRating.totalRatings })}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Membership options — host sells plans and viewer isn't the host */}
        {hostHasPlans && !isCreator && (
          <View style={[styles.infoCard, { marginBottom: 12 }]}>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("HostMemberships", {
                  hostId: getEventCreatorId(event),
                  hostName: event.hostName || t("eventDetail.defaultHostName"),
                })
              }
              activeOpacity={0.85}
              style={[
                styles.infoGlass,
                {
                  backgroundColor: `${colors.primary}14`,
                  borderColor: `${colors.primary}40`,
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}26` },
                ]}
              >
                <Icon name="ticket" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {t("eventDetail.membershipsLabel")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {t("eventDetail.plansAvailable")}
                </Text>
              </View>
              <Icon name="forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Connect with attendees — after a past event you attended */}
        {isJoined && isPastEvent && !isCreator && (
          <View style={[styles.infoCard, { marginBottom: 12 }]}>
            <TouchableOpacity
              onPress={() => navigation.navigate("Connect", { eventId })}
              activeOpacity={0.85}
              style={[
                styles.infoGlass,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.85)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}26` },
                ]}
              >
                <Icon name="users" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {t("eventDetail.connectLabel")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {t("eventDetail.followPeopleMet")}
                </Text>
              </View>
              <Icon name="forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Host attendee roster — host only */}
        {isCreator && (
          <View style={[styles.infoCard, { marginBottom: 12 }]}>
            <TouchableOpacity
              onPress={() => navigation.navigate("EventRoster", { eventId })}
              activeOpacity={0.85}
              style={[
                styles.infoGlass,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.85)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}26` },
                ]}
              >
                <Icon name="users" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {t("eventDetail.attendeesLabel")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {t("eventDetail.rosterDesc")}
                </Text>
              </View>
              <Icon name="forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Host check-in / attendance — host only */}
        {isCreator && (
          <View style={[styles.infoCard, { marginBottom: 12 }]}>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("EventCheckIn", {
                  eventId,
                  eventTitle: event.title,
                })
              }
              activeOpacity={0.85}
              style={[
                styles.infoGlass,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.85)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
            >
              <View
                style={[
                  styles.infoIconCircle,
                  { backgroundColor: `${colors.primary}15` },
                ]}
              >
                <Icon name="users" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                  {t("eventDetail.attendanceLabel")}
                </Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>
                  {t("eventDetail.attendanceDesc")}
                </Text>
              </View>
              <Icon name="forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Promote event — host only, upcoming events */}
        {isCreator && !isPastEvent && (
          <View style={[styles.infoCard, { marginBottom: 12 }]}>
            {(() => {
              const featuredMs = event.featuredUntil?.toMillis
                ? event.featuredUntil.toMillis()
                : event.featuredUntil
                ? new Date(event.featuredUntil).getTime()
                : 0;
              const isFeatured = featuredMs > Date.now();
              if (isFeatured) {
                const daysLeft = Math.max(
                  1,
                  Math.ceil((featuredMs - Date.now()) / 86400000)
                );
                return (
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate("PromoteEvent", {
                        eventId,
                        eventTitle: event.title,
                      })
                    }
                    activeOpacity={0.85}
                    style={[
                      styles.infoGlass,
                      {
                        backgroundColor: `${colors.primary}14`,
                        borderColor: `${colors.primary}40`,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.infoIconCircle,
                        { backgroundColor: `${colors.primary}26` },
                      ]}
                    >
                      <Icon name="ai" size={22} color={colors.primary} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                        {t("eventDetail.featuredDaysLeft", { count: daysLeft })}
                      </Text>
                      <Text style={[styles.infoValue, { color: colors.text }]}>
                        {t("eventDetail.untilDate", { date: new Date(featuredMs).toLocaleDateString(i18n.language) })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate("PromoteEvent", {
                      eventId,
                      eventTitle: event.title,
                    })
                  }
                  activeOpacity={0.85}
                  style={[
                    styles.infoGlass,
                    {
                      backgroundColor: `${colors.primary}14`,
                      borderColor: `${colors.primary}40`,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.infoIconCircle,
                      { backgroundColor: `${colors.primary}26` },
                    ]}
                  >
                    <Icon name="ai" size={22} color={colors.primary} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                      {t("eventDetail.promoteLabel")}
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {t("eventDetail.featureThisEvent")}
                    </Text>
                  </View>
                  <Icon name="forward" size={20} color={colors.primary} />
                </TouchableOpacity>
              );
            })()}
          </View>
        )}

        {/* Event Ratings — visible to everyone for past events (trust signal) */}
        {isPastEvent && (
          <EventRatings eventId={eventId} isHost={isCreator} />
        )}

        {eventPrice > 0 && (
          <View style={styles.policySection}>
            <View
              style={[
                styles.policyGlass,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t("eventDetail.cancellationPolicy")}
              </Text>
              <View style={styles.policyItem}>
                <Text style={[styles.policyDot, { color: colors.primary }]}>
                  •
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                >
                  {t("eventDetail.policy7days")}
                </Text>
              </View>
              <View style={styles.policyItem}>
                <Text style={[styles.policyDot, { color: colors.primary }]}>
                  •
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                >
                  {t("eventDetail.policy3to7")}
                </Text>
              </View>
              <View style={styles.policyItem}>
                <Text style={[styles.policyDot, { color: colors.primary }]}>
                  •
                </Text>
                <Text
                  style={[styles.policyText, { color: colors.textSecondary }]}
                >
                  {t("eventDetail.policyLess3")}
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
                  {t("eventDetail.policyHostCancels")}
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
                  backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
                },
              ]}
            >
              <Text
                style={[styles.sectionTitle, { color: colors.text }]}
              >{t("eventDetail.attendeesCount", { count: attendeesData.length })}</Text>
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
                    <AvatarDisplay avatar={attendee.avatar || null} size={36} />
                  </View>
                  <Text style={[styles.attendeeName, { color: colors.text }]}>
                    {attendee.fullName || attendee.name || t("eventDetail.anonymous")}
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
            {isJoined && !isCreator && (
              <TouchableOpacity
                style={styles.qrLinkBtn}
                onPress={() => setQrVisible(true)}
              >
                <Icon name="qr" size={16} color={colors.primary} />
                <Text style={[styles.qrLinkText, { color: colors.primary }]}>
                  {t("eventDetail.myCheckinQR")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <Modal visible={qrVisible} transparent animationType="fade">
        <View style={styles.qrOverlay}>
          <View
            style={[
              styles.qrCard,
              { backgroundColor: colors.surface, borderColor: colors.borderStrong },
            ]}
          >
            <Text style={[styles.qrTitle, { color: colors.text }]}>{t("eventDetail.checkinTitle")}</Text>
            <Text style={[styles.qrSub, { color: colors.textSecondary }]}>
              {t("eventDetail.checkinSub")}
            </Text>
            <View style={styles.qrBox}>
              <QRCode
                value={buildCheckinPayload(eventId, auth.currentUser?.uid || "")}
                size={220}
              />
            </View>
            <TouchableOpacity
              style={[styles.qrClose, { backgroundColor: colors.primary }]}
              onPress={() => setQrVisible(false)}
            >
              <Text style={styles.qrCloseText}>{t("common.done")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    qrLinkBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      marginTop: 8,
    },
    qrLinkText: { fontSize: 14, fontWeight: "700" },
    qrOverlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.6)",
      padding: 24,
    },
    qrCard: {
      width: "100%",
      maxWidth: 340,
      borderRadius: 24,
      borderWidth: 1,
      padding: 24,
      alignItems: "center",
      gap: 6,
    },
    qrTitle: { fontSize: 20, fontWeight: "800" },
    qrSub: { fontSize: 13, textAlign: "center", marginBottom: 14 },
    qrBox: {
      backgroundColor: "#FFFFFF",
      padding: 16,
      borderRadius: 16,
      marginBottom: 18,
    },
    qrClose: {
      borderRadius: 14,
      paddingVertical: 13,
      paddingHorizontal: 40,
      alignItems: "center",
    },
    qrCloseText: { color: "#fff", fontSize: 15, fontWeight: "700" },
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
      color: colors.success,
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
    matchChip: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 16,
    },
    matchLabel: { fontSize: 15, fontWeight: "800" },
    matchWhy: { fontSize: 13, marginTop: 2 },
    friendsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
    },
    friendsText: { fontSize: 14, fontWeight: "700", flex: 1 },
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
      borderWidth: 1,
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
