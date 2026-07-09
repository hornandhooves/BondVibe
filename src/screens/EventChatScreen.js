import Icon from "../components/Icon";
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
  Linking,
  Modal,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import PollCard from "../components/PollCard";
import { AvatarDisplay } from "../components/AvatarPicker";
import { createPoll } from "../services/pollService";
import { detectProhibitedContent, PROHIBITED_MESSAGE } from "../utils/contentGuard";
import { reportProhibitedContent } from "../services/reportService";
import CarpoolCard from "../components/CarpoolCard";
import KeyboardAccessory from "../components/KeyboardAccessory";
import PlaceAutocomplete from "../components/PlaceAutocomplete";
import MentionText from "../components/MentionText";
import MentionSuggestions from "../components/MentionSuggestions";
import { replaceActiveMention } from "../utils/mentions";
import { createCarpool } from "../services/carpoolService";
import { notifyMentions } from "../services/userService";
import { useTheme } from "../contexts/ThemeContext";
import { auth , db } from "../services/firebase";
import {
  sendMessage,
  sendLocationMessage,
  subscribeToMessages,
  ensureEventConversation,
  setTypingStatus,
  subscribeToTypingStatus,
  markMessagesAsRead,
  markMessagesAsDelivered,
} from "../utils/messageService";
import { doc, getDoc } from "firebase/firestore";
import {
  getEventCreatorId,
  getAttendeeIds,
  isUserAttending,
} from "../utils/eventHelpers";

// Display-name helper hoisted to module scope so the memoized row below can
// use it without capturing the screen's render closure.
function getUserDisplayName(user, t) {
  if (!user) return t("eventChat.user");
  return user.fullName || user.name || t("eventChat.user");
}

// BUG 12: MessageBubble lives at module scope (NOT inside the screen body) so
// React keeps the same component type across renders — the message list is no
// longer unmounted/remounted on every keystroke, which stops the avatar reload
// "blink". Wrapped in React.memo so a row only re-renders when its own props
// change. Everything it needs arrives via props.
const MessageBubble = React.memo(function MessageBubble({
  message,
  user,
  isMe,
  status,
  colors,
  styles,
  navigation,
  isHost,
  eventId,
  currentUserName,
  openInMaps,
  t,
  i18n,
}) {
  const time = new Date(message.createdAt).toLocaleTimeString(i18n.language, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (message.type === "poll" && message.data?.pollId) {
    return (
      <View
        style={[
          styles.messageBubble,
          isMe ? styles.myMessage : styles.theirMessage,
          { backgroundColor: "transparent", padding: 0 },
        ]}
      >
        {!isMe && user && (
          <Text
            onPress={() => navigation.navigate("UserProfile", { userId: message.senderId })}
            style={[styles.senderName, { color: colors.primary }]}
          >
            {user.fullName || user.name || t("eventChat.host")}
          </Text>
        )}
        <PollCard
          parent={["events", eventId]}
          pollId={message.data.pollId}
          isHost={isHost}
        />
        <Text style={[styles.timeStamp, { color: colors.textTertiary, marginTop: 4 }]}>
          {time}
        </Text>
      </View>
    );
  }

  if (message.type === "carpool" && message.data?.carpoolId) {
    return (
      <View
        style={[
          styles.messageBubble,
          isMe ? styles.myMessage : styles.theirMessage,
          { backgroundColor: "transparent", padding: 0 },
        ]}
      >
        {!isMe && user && (
          <Text
            onPress={() => navigation.navigate("UserProfile", { userId: message.senderId })}
            style={[styles.senderName, { color: colors.primary }]}
          >
            {user.fullName || user.name || t("eventChat.someone")}
          </Text>
        )}
        <CarpoolCard
          eventId={eventId}
          carpoolId={message.data.carpoolId}
          currentUserName={currentUserName}
        />
        <Text style={[styles.timeStamp, { color: colors.textTertiary, marginTop: 4 }]}>
          {time}
        </Text>
      </View>
    );
  }

  if (message.type === "location") {
    return (
      <View
        style={[
          styles.messageBubble,
          isMe ? styles.myMessage : styles.theirMessage,
        ]}
      >
        {!isMe && (
          <View style={styles.senderInfo}>
            <AvatarDisplay
              avatar={user?.avatar}
              size={24}
              name={getUserDisplayName(user, t)}
              style={styles.senderAvatarSpacing}
            />
            <Text
              onPress={() => navigation.navigate("UserProfile", { userId: message.senderId })}
              style={[styles.senderName, { color: colors.textSecondary }]}
            >
              {getUserDisplayName(user, t)}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.bubbleGlass,
            {
              backgroundColor: isMe
                ? `${colors.primary}33`
                : colors.surfaceGlass,
              borderColor: isMe ? `${colors.primary}66` : colors.border,
            },
          ]}
          onPress={() =>
            openInMaps(message.location.latitude, message.location.longitude)
          }
        >
          <Icon
            name="location"
            size={14}
            color={colors.primary}
            style={styles.locationIcon}
          />
          <Text style={[styles.locationText, { color: colors.text }]}>
            {message.location.address}
          </Text>
          <Text
            style={[styles.locationSubtext, { color: colors.textSecondary }]}
          >
            {t("eventChat.tapToOpenInMaps")}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[styles.timeStamp, { color: colors.textTertiary }]}>
              {time}
            </Text>
            {status && (
              <Icon name={status.icon} size={12} color={status.color} />
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.messageBubble,
        isMe ? styles.myMessage : styles.theirMessage,
      ]}
    >
      {!isMe && (
        <View style={styles.senderInfo}>
          <AvatarDisplay
            avatar={user?.avatar}
            size={24}
            name={getUserDisplayName(user, t)}
            style={styles.senderAvatarSpacing}
          />
          <Text
            onPress={() => navigation.navigate("UserProfile", { userId: message.senderId })}
            style={[styles.senderName, { color: colors.textSecondary }]}
          >
            {getUserDisplayName(user, t)}
          </Text>
        </View>
      )}
      <View
        style={[
          styles.bubbleGlass,
          {
            backgroundColor: isMe
              ? `${colors.primary}33`
              : colors.surfaceGlass,
            borderColor: isMe ? `${colors.primary}66` : colors.border,
          },
        ]}
      >
        <MentionText
          text={message.text}
          style={[styles.messageText, { color: colors.text }]}
          navigation={navigation}
        />
        <View style={styles.messageFooter}>
          <Text style={[styles.timeStamp, { color: colors.textTertiary }]}>
            {time}
          </Text>
          {status && (
            <Icon name={status.icon} size={12} color={status.color} />
          )}
        </View>
      </View>
    </View>
  );
});

// BUG 12: TypingIndicator hoisted to module scope for the same reason.
const TypingIndicator = React.memo(function TypingIndicator({
  typingUsers,
  users,
  colors,
  styles,
  t,
}) {
  if (typingUsers.length === 0) return null;

  const typingUserNames = typingUsers
    .map((userId) => {
      const user = users[userId];
      const displayName = getUserDisplayName(user, t);
      return displayName.split(" ")[0];
    })
    .slice(0, 2);

  let typingText = "";
  if (typingUserNames.length === 1) {
    typingText = t("eventChat.isTyping", { name: typingUserNames[0] });
  } else if (typingUserNames.length === 2) {
    typingText = t("eventChat.twoAreTyping", { name1: typingUserNames[0], name2: typingUserNames[1] });
  } else {
    typingText = t("eventChat.othersAreTyping", {
      name1: typingUserNames[0],
      name2: typingUserNames[1],
      count: typingUsers.length - 2,
    });
  }

  return (
    <View style={styles.typingContainer}>
      <Text style={[styles.typingText, { color: colors.textSecondary }]}>
        {typingText}
      </Text>
      <View style={styles.typingDots}>
        <View style={[styles.dot, { backgroundColor: colors.textSecondary }]} />
        <View style={[styles.dot, { backgroundColor: colors.textSecondary }]} />
        <View style={[styles.dot, { backgroundColor: colors.textSecondary }]} />
      </View>
    </View>
  );
});

export default function EventChatScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const { eventId, eventTitle } = route.params;
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [sendingLocation, setSendingLocation] = useState(false);
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [pollModalVisible, setPollModalVisible] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollAnon, setPollAnon] = useState(false);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [carpoolModalVisible, setCarpoolModalVisible] = useState(false);
  const [carpoolForm, setCarpoolForm] = useState({
    seatsTotal: "",
    from: "",
    fromAddress: "",
    fromCoords: null,
    departureTime: "",
    departureDate: null,
    notes: "",
  });
  const [showPickupSearch, setShowPickupSearch] = useState(false);
  const [showDepPicker, setShowDepPicker] = useState(false);
  const [creatingCarpool, setCreatingCarpool] = useState(false);
  const scrollViewRef = useRef();
  // Only auto-scroll a new message into view when the user is already at the
  // bottom (chat-scroll fix) — never yank them up from reading older messages.
  const isNearBottomRef = useRef(true);
  const typingTimeoutRef = useRef(null);
  // BUG 12: only write the typing flag once per active window (not per keystroke)
  // so remote devices don't get a Firestore update — and re-render — per letter.
  const typingActiveRef = useRef(false);
  const previousMessageCountRef = useRef(0);

  // ============================================
  // EFECTO: Inicializar chat
  // ============================================
  useEffect(() => {
    let unsubscribeMessages = null;
    let unsubscribeTyping = null;

    const initChat = async () => {
      try {
        const conversationId = `event_${eventId}`;
        const currentUserId = auth.currentUser?.uid;

        // Precargar TODOS los participantes del evento
        const eventDoc = await getDoc(doc(db, "events", eventId));
        if (eventDoc.exists()) {
          const eventData = eventDoc.data();

          // Verify current user is a participant before entering chat
          const creatorId = getEventCreatorId(eventData);
          const isCreator = creatorId === currentUserId;
          setIsHost(isCreator);
          const isAttendee = isUserAttending(
            eventData.attendees,
            currentUserId
          );

          if (!isCreator && !isAttendee) {
            setLoading(false);
            Alert.alert(
              t("eventChat.alerts.accessRestrictedTitle"),
              t("eventChat.alerts.needToJoinMsg"),
              [{ text: t("eventChat.alerts.goBack"), onPress: () => navigation.goBack() }]
            );
            return;
          }

          // Asegurar que la conversación existe
          await ensureEventConversation(conversationId);

          const participantIds = new Set();

          if (creatorId) {
            participantIds.add(creatorId);
          }

          getAttendeeIds(eventData.attendees).forEach((id) =>
            participantIds.add(id)
          );

          const usersData = {};
          for (const userId of participantIds) {
            try {
              const userDoc = await getDoc(doc(db, "users", userId));
              if (userDoc.exists()) {
                usersData[userId] = userDoc.data();
              }
            } catch (err) {
              console.log("Could not load user:", userId);
            }
          }
          setUsers(usersData);
          console.log(`👥 Loaded ${participantIds.size} participants`);
        }

        // Suscribirse a mensajes
        unsubscribeMessages = subscribeToMessages(
          conversationId,
          async (newMessages) => {
            const previousCount = previousMessageCountRef.current;
            const currentCount = newMessages.length;

            setMessages(newMessages);

            if (newMessages.length > 0) {
              // ✅ Marcar como DELIVERED automáticamente
              await markMessagesAsDelivered(
                conversationId,
                auth.currentUser.uid
              );

              // ✅ FIX: Marcar como READ cuando llegan nuevos mensajes
              // mientras el usuario tiene el chat abierto
              if (currentCount > previousCount || previousCount === 0) {
                await markMessagesAsRead(conversationId, auth.currentUser.uid);
                console.log(
                  "📖 Messages marked as READ (new messages arrived while chat open)"
                );
              }
            }

            // Actualizar contador de mensajes previos
            previousMessageCountRef.current = currentCount;

            // Cargar info de usuarios que aún no tenemos
            const userIds = [...new Set(newMessages.map((m) => m.senderId))];
            const usersData = {};
            for (const userId of userIds) {
              if (!users[userId]) {
                const userDoc = await getDoc(doc(db, "users", userId));
                if (userDoc.exists()) {
                  usersData[userId] = userDoc.data();
                }
              }
            }
            if (Object.keys(usersData).length > 0) {
              setUsers((prev) => ({ ...prev, ...usersData }));
            }

            // Only scroll on a genuinely new message AND when the user is at the
            // bottom — not on readBy/deliveredTo-only snapshots (chat-scroll fix).
            const hasNewMessage = currentCount > previousCount || previousCount === 0;
            if (hasNewMessage && isNearBottomRef.current) {
              setTimeout(
                () => scrollViewRef.current?.scrollToEnd({ animated: true }),
                100
              );
            }
          }
        );

        // Suscribirse a typing indicators
        unsubscribeTyping = subscribeToTypingStatus(
          conversationId,
          (typers) => {
            const otherTypers = typers.filter(
              (userId) => userId !== auth.currentUser?.uid
            );
            setTypingUsers(otherTypers);
          }
        );

        setLoading(false);
      } catch (error) {
        console.error("Error initializing chat:", error);
        setLoading(false);
        if (error?.code === "permission-denied") {
          Alert.alert(
            t("eventChat.alerts.accessRestrictedTitle"),
            t("eventChat.alerts.noPermissionMsg"),
            [{ text: t("eventChat.alerts.goBack"), onPress: () => navigation.goBack() }]
          );
        }
      }
    };

    initChat();

    // ✅ CRÍTICO: Cleanup function
    return () => {
      console.log("🧹 Cleaning up chat subscriptions");
      previousMessageCountRef.current = 0;

      if (unsubscribeMessages) {
        unsubscribeMessages();
      }

      if (unsubscribeTyping) {
        unsubscribeTyping();
      }

      // Limpiar typing status
      if (auth.currentUser) {
        const conversationId = `event_${eventId}`;
        setTypingStatus(conversationId, auth.currentUser.uid, false).catch(
          () => {
            // Ignorar errores de permisos en cleanup
          }
        );
      }
    };
  }, [eventId]);

  // ============================================
  // ✅ Marcar como READ cuando usuario SCROLLEA al final
  // ============================================
  const handleScroll = (event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;

    // Verificar si está cerca del final (últimos 80px)
    const isNearBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80;
    isNearBottomRef.current = isNearBottom;

    if (isNearBottom && messages.length > 0) {
      const conversationId = `event_${eventId}`;
      markMessagesAsRead(conversationId, auth.currentUser.uid);
    }
  };

  // ============================================
  // ✅ Enviar mensaje
  // ============================================
  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const text = inputText.trim();
    const guard = detectProhibitedContent(text);
    if (guard.flagged) {
      setInputText("");
      reportProhibitedContent({ reason: guard.reason, content: text, eventId });
      Alert.alert(t("eventChat.alerts.messageBlockedTitle"), PROHIBITED_MESSAGE);
      return;
    }
    setInputText("");
    setSending(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    const conversationId = `event_${eventId}`;

    typingActiveRef.current = false;
    setTypingStatus(conversationId, auth.currentUser.uid, false);

    try {
      await sendMessage(conversationId, auth.currentUser.uid, text);
      console.log("✅ Message sent successfully!");
      notifyMentions(text, { title: t("mentions.notifTitle"), message: text.slice(0, 120), metadata: { eventId } });
    } catch (error) {
      console.error("❌ Error sending message:", error);
      console.error("❌ Error code:", error.code);
      console.error("❌ Error message:", error.message);
      setInputText(text); // Restaurar texto si falla
    } finally {
      setSending(false);
    }
  };

  const handleTextChange = (text) => {
    setInputText(text);

    const conversationId = `event_${eventId}`;
    // Write `true` only on the first keystroke of a window — subsequent letters
    // just push out the stop timer, so no per-letter Firestore setDoc.
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      setTypingStatus(conversationId, auth.currentUser.uid, true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      setTypingStatus(conversationId, auth.currentUser.uid, false);
    }, 4000);
  };

  // Ask first — don't dump the raw GPS fix into the chat on a single tap.
  // Offer searching for a specific place, or sharing the current location.
  const promptShareLocation = () => {
    Alert.alert(
      t("eventChat.shareLocation.title"),
      t("eventChat.shareLocation.prompt"),
      [
        { text: t("eventChat.shareLocation.searchPlace"), onPress: () => setShowPlaceSearch(true) },
        { text: t("eventChat.shareLocation.currentLocation"), onPress: shareCurrentLocation },
        { text: t("eventChat.cancel"), style: "cancel" },
      ]
    );
  };

  // Send a place picked from the Places search.
  const handlePlaceSelected = async (place) => {
    setShowPlaceSearch(false);
    const { latitude, longitude, address, description } = place || {};
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      Alert.alert(
        t("eventChat.alerts.noMapLocationTitle"),
        t("eventChat.alerts.noMapLocationMsg")
      );
      return;
    }
    try {
      setSendingLocation(true);
      await sendLocationMessage(
        `event_${eventId}`,
        auth.currentUser.uid,
        latitude,
        longitude,
        address || description || null
      );
    } catch (error) {
      console.error("Error sharing place:", error);
      Alert.alert(t("eventChat.alerts.errorTitle"), t("eventChat.alerts.couldntSharePlaceMsg"));
    } finally {
      setSendingLocation(false);
    }
  };

  const shareCurrentLocation = async () => {
    try {
      setSendingLocation(true);

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          t("eventChat.alerts.permissionRequiredTitle"),
          t("eventChat.alerts.permissionRequiredMsg"),
          [{ text: t("eventChat.alerts.ok") }]
        );
        setSendingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;

      let address = null;
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        if (addresses.length > 0) {
          const addr = addresses[0];
          address = `${addr.street || ""} ${addr.city || ""} ${
            addr.region || ""
          }`.trim();
        }
      } catch (e) {
        console.log("Could not get address:", e);
      }

      const conversationId = `event_${eventId}`;
      await sendLocationMessage(
        conversationId,
        auth.currentUser.uid,
        latitude,
        longitude,
        address
      );

      console.log("📍 Location shared");
    } catch (error) {
      console.error("Error sharing location:", error);
      Alert.alert(t("eventChat.alerts.errorTitle"), t("eventChat.alerts.couldntShareLocationMsg"));
    } finally {
      setSendingLocation(false);
    }
  };

  const openPollModal = () => {
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollModalVisible(true);
  };

  const updatePollOption = (index, value) => {
    setPollOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const handleCreatePoll = async () => {
    setCreatingPoll(true);
    const result = await createPoll(["events", eventId], {
      question: pollQuestion,
      options: pollOptions,
      anonymous: pollAnon,
    });
    setCreatingPoll(false);
    if (result.success) {
      setPollModalVisible(false);
      setPollAnon(false);
    } else {
      Alert.alert(t("eventChat.alerts.couldntCreatePollTitle"), result.error || t("eventChat.alerts.tryAgain"));
    }
  };

  const currentUserName = () => {
    const u = users[auth.currentUser?.uid];
    return u?.fullName || u?.name || t("eventChat.someone");
  };

  const handleCreateCarpool = async () => {
    setCreatingCarpool(true);
    const result = await createCarpool(eventId, {
      ...carpoolForm,
      driverName: currentUserName(),
    });
    setCreatingCarpool(false);
    if (result.success) {
      setCarpoolModalVisible(false);
      setCarpoolForm({
        seatsTotal: "",
        from: "",
        fromAddress: "",
        fromCoords: null,
        departureTime: "",
        departureDate: null,
        notes: "",
      });
    } else {
      Alert.alert(t("eventChat.alerts.couldntOfferRideTitle"), result.error || t("eventChat.alerts.tryAgain"));
    }
  };

  // Pickup point chosen from the same Google Places sheet as Create Event
  // (BUG 19): show the place name, keep the address + coords for the map.
  const handlePickupSelected = (place) => {
    setShowPickupSearch(false);
    const { latitude, longitude, address, description, name } = place || {};
    setCarpoolForm((f) => ({
      ...f,
      from: name || address || description || f.from,
      fromAddress: address || description || "",
      fromCoords:
        typeof latitude === "number" && typeof longitude === "number"
          ? { latitude, longitude }
          : null,
    }));
  };

  const openInMaps = (latitude, longitude) => {
    const latLng = `${latitude},${longitude}`;
    const open = (url) => Linking.openURL(url).catch(() => {});
    const buttons = [];
    if (Platform.OS === "ios") {
      buttons.push({ text: t("eventChat.appleMaps"), onPress: () => open(`maps:0,0?q=${latLng}`) });
    }
    buttons.push({
      text: t("eventChat.googleMaps"),
      onPress: () => open(`https://www.google.com/maps/search/?api=1&query=${latLng}`),
    });
    buttons.push({
      text: t("eventChat.waze"),
      onPress: () => open(`https://waze.com/ul?ll=${latLng}&navigate=yes`),
    });
    if (Platform.OS === "android") {
      buttons.push({ text: t("eventChat.maps"), onPress: () => open(`geo:0,0?q=${latLng}`) });
    }
    buttons.push({ text: t("eventChat.cancel"), style: "cancel" });
    Alert.alert(t("eventChat.openLocationIn"), "", buttons);
  };

  const getMessageStatus = (message) => {
    if (message.senderId !== auth.currentUser.uid) return null;

    // Other participants (everyone loaded in the chat except the sender)
    const otherIds = Object.keys(users).filter(
      (uid) => uid !== auth.currentUser.uid
    );

    if (otherIds.length === 0) {
      // Solo chat — sent tick only
      return { icon: "check", color: colors.textTertiary };
    }

    // New per-user map format
    if (message.readBy !== undefined || message.deliveredTo !== undefined) {
      const readBy = message.readBy || {};
      const deliveredTo = message.deliveredTo || {};

      const allRead = otherIds.every((uid) => readBy[uid]);
      if (allRead) return { icon: "checkAll", color: colors.primary }; // blue — all read

      const anyDelivered = otherIds.some((uid) => deliveredTo[uid] || readBy[uid]);
      if (anyDelivered) return { icon: "checkAll", color: colors.textTertiary }; // grey double — delivered to some

      return { icon: "check", color: colors.textTertiary }; // grey single — sent
    }

    // Legacy boolean format fallback (old messages)
    if (message.read) return { icon: "checkAll", color: colors.primary };
    if (message.delivered) return { icon: "checkAll", color: colors.textTertiary };
    return { icon: "check", color: colors.textTertiary };
  };

  // Styles are memoized so they aren't rebuilt (and the memoized rows below
  // aren't handed a fresh `styles` object) on every keystroke — BUG 12.
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Current user's display name — passed to the memoized rows for CarpoolCard.
  const currentName = currentUserName();

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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text
            style={[styles.headerTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {eventTitle}
          </Text>
          <Text
            style={[styles.headerSubtitle, { color: colors.textSecondary }]}
          >
            {t("eventChat.groupChat")}
          </Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        // Pin content to the bottom so keyboard/suggestion-bar/input-growth
        // layout changes don't drift the list (chat-scroll fix). Scrolling on a
        // new message is handled in the subscription, gated by near-bottom.
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <View style={styles.emptyChatArt}>
              <Icon name="chat" size={32} color={colors.primary} />
            </View>
            <Text
              style={[styles.emptyChatText, { color: colors.textSecondary }]}
            >
              {t("eventChat.startConversation")}
            </Text>
          </View>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                user={users[message.senderId]}
                isMe={message.senderId === auth.currentUser?.uid}
                status={getMessageStatus(message)}
                colors={colors}
                styles={styles}
                navigation={navigation}
                isHost={isHost}
                eventId={eventId}
                currentUserName={currentName}
                openInMaps={openInMaps}
                t={t}
                i18n={i18n}
              />
            ))}
            <TypingIndicator
              typingUsers={typingUsers}
              users={users}
              colors={colors}
              styles={styles}
              t={t}
            />
          </>
        )}
      </ScrollView>

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: isDark
              ? "rgba(11, 15, 26, 0.95)"
              : "rgba(250, 250, 252, 0.95)",
            borderTopColor: colors.border,
          },
        ]}
      >
        {/* @handle autocomplete — renders nothing unless a mention is active
            (BUG 29). Picking one swaps the trailing @partial for the exact
            @handle; typing-status logic in handleTextChange is untouched. */}
        <MentionSuggestions
          text={inputText}
          onPick={(handle) => setInputText((prev) => replaceActiveMention(prev, handle))}
        />
        <View
          style={[
            styles.inputWrapper,
            {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.locationButton}
            onPress={promptShareLocation}
            disabled={sendingLocation}
          >
            {sendingLocation ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon name="location" size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>

          {isHost && (
            <TouchableOpacity style={styles.locationButton} onPress={openPollModal}>
              <Icon name="chart" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.locationButton}
            onPress={() => setCarpoolModalVisible(true)}
          >
            <Icon name="car" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={inputText}
            onChangeText={handleTextChange}
            placeholder={t("eventChat.messagePlaceholder")}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
          />

          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <View
              style={[
                styles.sendButtonGlass,
                {
                  backgroundColor: inputText.trim()
                    ? `${colors.primary}33`
                    : colors.surfaceGlass,
                  borderColor: inputText.trim()
                    ? `${colors.primary}66`
                    : colors.border,
                },
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.sendIcon}>↑</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Create poll modal (host) */}
      <Modal visible={pollModalVisible} transparent animationType="slide">
        <View style={styles.pollModalOverlay}>
          <View style={[styles.pollModalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.pollModalTitle, { color: colors.text }]}>
              {t("eventChat.poll.createTitle")}
            </Text>
            <TextInput
              style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
              placeholder={t("eventChat.poll.questionPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={pollQuestion}
              onChangeText={setPollQuestion}
              maxLength={140}
            />
            {pollOptions.map((opt, i) => (
              <TextInput
                key={i}
                style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
                placeholder={t("eventChat.poll.optionPlaceholder", { num: i + 1 })}
                placeholderTextColor={colors.textTertiary}
                value={opt}
                onChangeText={(v) => updatePollOption(i, v)}
                maxLength={80}
              />
            ))}
            {pollOptions.length < 5 && (
              <TouchableOpacity onPress={() => setPollOptions((p) => [...p, ""])}>
                <Text style={[styles.pollAddOption, { color: colors.primary }]}>
                  {t("eventChat.poll.addOption")}
                </Text>
              </TouchableOpacity>
            )}
            <View style={styles.pollAnonRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{t("eventChat.poll.anonymous")}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                  {t("eventChat.poll.anonymousHint")}
                </Text>
              </View>
              <Switch
                value={pollAnon}
                onValueChange={setPollAnon}
                trackColor={{ true: colors.primary }}
              />
            </View>
            <View style={styles.pollModalActions}>
              <TouchableOpacity onPress={() => setPollModalVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                  {t("eventChat.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreatePoll} disabled={creatingPoll}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {creatingPoll ? t("eventChat.poll.creating") : t("eventChat.poll.createPoll")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <KeyboardAccessory />
      </Modal>

      {/* Offer a ride (car pool) modal */}
      {/* BUG 28: an INLINE bottom-sheet (not a RN <Modal>) so the pickup
          PlaceAutocomplete's own <Modal> can present over it — two stacked RN
          Modals silently fail on iOS. BUG 28.1: KeyboardAvoidingView + a
          scrollable body keep every field above the keyboard / time cylinder. */}
      {carpoolModalVisible && (
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => setCarpoolModalVisible(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View
              style={[
                styles.pollModalCard,
                styles.sheetCard,
                { backgroundColor: colors.background },
              ]}
            >
              <Text style={[styles.pollModalTitle, { color: colors.text }]}>
                {t("eventChat.carpool.title")}
              </Text>
              <ScrollView
                style={styles.sheetScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <TextInput
                  style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
                  placeholder={t("eventChat.carpool.seatsPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={carpoolForm.seatsTotal}
                  onChangeText={(v) =>
                    setCarpoolForm((f) => ({ ...f, seatsTotal: v.replace(/[^0-9]/g, "") }))
                  }
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={[styles.pollInput, { borderColor: colors.border, justifyContent: "center" }]}
                  onPress={() => setShowPickupSearch(true)}
                >
                  <Text style={{ color: carpoolForm.from ? colors.text : colors.textTertiary }} numberOfLines={1}>
                    {carpoolForm.from || t("eventChat.carpool.pickupPlaceholder")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pollInput, { borderColor: colors.border, justifyContent: "center" }]}
                  onPress={() => setShowDepPicker(true)}
                >
                  <Text style={{ color: carpoolForm.departureTime ? colors.text : colors.textTertiary }}>
                    {carpoolForm.departureTime || t("eventChat.carpool.departureTimePlaceholder")}
                  </Text>
                </TouchableOpacity>
                {showDepPicker && (
                  <View>
                    <DateTimePicker
                      value={carpoolForm.departureDate || new Date()}
                      mode="time"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(e, d) => {
                        if (Platform.OS !== "ios") setShowDepPicker(false);
                        if (d) {
                          const t = d.toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          });
                          setCarpoolForm((f) => ({
                            ...f,
                            departureTime: t,
                            departureDate: d,
                          }));
                        }
                      }}
                    />
                    {Platform.OS === "ios" && (
                      <TouchableOpacity
                        style={{ alignSelf: "flex-end", padding: 8 }}
                        onPress={() => setShowDepPicker(false)}
                      >
                        <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("eventChat.carpool.done")}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <TextInput
                  style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
                  placeholder={t("eventChat.carpool.notesPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={carpoolForm.notes}
                  onChangeText={(v) => setCarpoolForm((f) => ({ ...f, notes: v }))}
                  maxLength={120}
                />
              </ScrollView>
              <View style={styles.pollModalActions}>
                <TouchableOpacity onPress={() => setCarpoolModalVisible(false)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                    {t("eventChat.cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreateCarpool} disabled={creatingCarpool}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>
                    {creatingCarpool ? t("eventChat.carpool.posting") : t("eventChat.carpool.offerRide")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* Places search launched from the "share location" prompt */}
      <PlaceAutocomplete
        open={showPlaceSearch}
        onOpenChange={setShowPlaceSearch}
        onSelect={handlePlaceSelected}
        placeholder={t("eventChat.placeSearchPlaceholder")}
      />

      {/* Pickup point picker for the car pool (BUG 19) */}
      <PlaceAutocomplete
        open={showPickupSearch}
        onOpenChange={setShowPickupSearch}
        onSelect={handlePickupSelected}
        placeholder={t("eventChat.carpool.pickupPlaceholder")}
      />
    </KeyboardAvoidingView>
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
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    headerInfo: { flex: 1, marginLeft: 16 },
    headerTitle: { fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
    headerSubtitle: { fontSize: 12, marginTop: 2 },
    messagesContainer: { flex: 1 },
    messagesContent: { paddingHorizontal: 24, paddingVertical: 20 },
    emptyChat: { alignItems: "center", marginTop: 100 },
    emptyChatArt: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    emptyChatText: { fontSize: 14 },
    messageBubble: { marginBottom: 16, maxWidth: "80%" },
    myMessage: { alignSelf: "flex-end" },
    theirMessage: { alignSelf: "flex-start" },
    senderInfo: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    senderAvatarSpacing: { marginRight: 8 },
    senderName: { fontSize: 12, fontWeight: "600" },
    bubbleGlass: {
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
    },
    messageText: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
    messageFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 4,
    },
    timeStamp: { fontSize: 11 },
    locationIcon: { alignSelf: "center", marginBottom: 8 },
    locationText: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
    locationSubtext: { fontSize: 11, marginBottom: 8 },
    typingContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
    },
    typingText: { fontSize: 12, fontStyle: "italic", marginRight: 8 },
    typingDots: { flexDirection: "row", gap: 4 },
    dot: { width: 4, height: 4, borderRadius: 2 },
    inputContainer: { borderTopWidth: 1, padding: 16, paddingBottom: 32 },
    inputWrapper: {
      borderWidth: 1,
      borderRadius: 24,
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    locationButton: { padding: 4, marginRight: 4 },
    pollModalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    // BUG 28: inline bottom-sheet overlay (replaces the carpool RN <Modal>).
    sheetOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "flex-end",
      zIndex: 20,
    },
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    // Cap the card height so the ScrollView body scrolls instead of the card
    // growing past the screen when the keyboard/time cylinder is open (28.1).
    sheetCard: { maxHeight: "85%" },
    sheetScroll: { flexGrow: 0, flexShrink: 1 },
    pollModalCard: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 36,
    },
    pollModalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
    pollInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      marginBottom: 10,
    },
    pollAddOption: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
    pollModalActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 16,
    },
    pollAnonRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      gap: 8,
    },
    input: {
      flex: 1,
      fontSize: 15,
      maxHeight: 100,
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    sendButton: { marginLeft: 4 },
    sendButtonGlass: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    sendIcon: { fontSize: 20 },
  });
}
