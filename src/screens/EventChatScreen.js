import React, { useState, useEffect, useRef } from "react";
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
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import PollCard from "../components/PollCard";
import { createPoll } from "../services/pollService";
import CarpoolCard from "../components/CarpoolCard";
import KeyboardAccessory from "../components/KeyboardAccessory";
import { createCarpool } from "../services/carpoolService";
import { useTheme } from "../contexts/ThemeContext";
import { auth } from "../services/firebase";
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
import { db } from "../services/firebase";
import {
  getEventCreatorId,
  getAttendeeIds,
  isUserAttending,
} from "../utils/eventHelpers";

export default function EventChatScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { eventId, eventTitle } = route.params;
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [sendingLocation, setSendingLocation] = useState(false);
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
    departureTime: "",
    notes: "",
  });
  const [creatingCarpool, setCreatingCarpool] = useState(false);
  const scrollViewRef = useRef();
  const typingTimeoutRef = useRef(null);
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
              "Access Restricted",
              "You need to join this event before you can access its chat.",
              [{ text: "Go Back", onPress: () => navigation.goBack() }]
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

            setTimeout(
              () => scrollViewRef.current?.scrollToEnd({ animated: true }),
              100
            );
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
            "Access Restricted",
            "You don't have permission to access this chat.",
            [{ text: "Go Back", onPress: () => navigation.goBack() }]
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

    // Verificar si está cerca del final (últimos 50px)
    const isNearBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) < 50;

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
    setInputText("");
    setSending(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    const conversationId = `event_${eventId}`;

    setTypingStatus(conversationId, auth.currentUser.uid, false);

    try {
      await sendMessage(conversationId, auth.currentUser.uid, text);
      console.log("✅ Message sent successfully!");
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
    setTypingStatus(conversationId, auth.currentUser.uid, true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setTypingStatus(conversationId, auth.currentUser.uid, false);
    }, 8000);
  };

  const handleShareLocation = async () => {
    try {
      setSendingLocation(true);

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please enable location permissions to share your location.",
          [{ text: "OK" }]
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
      Alert.alert("Error", "Could not share location. Please try again.");
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
      Alert.alert("Couldn't create poll", result.error || "Please try again.");
    }
  };

  const currentUserName = () => {
    const u = users[auth.currentUser?.uid];
    return u?.fullName || u?.name || "Someone";
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
      setCarpoolForm({ seatsTotal: "", from: "", departureTime: "", notes: "" });
    } else {
      Alert.alert("Couldn't offer ride", result.error || "Please try again.");
    }
  };

  const openInMaps = (latitude, longitude) => {
    const latLng = `${latitude},${longitude}`;
    const open = (url) => Linking.openURL(url).catch(() => {});
    const buttons = [];
    if (Platform.OS === "ios") {
      buttons.push({ text: "Apple Maps", onPress: () => open(`maps:0,0?q=${latLng}`) });
    }
    buttons.push({
      text: "Google Maps",
      onPress: () => open(`https://www.google.com/maps/search/?api=1&query=${latLng}`),
    });
    buttons.push({
      text: "Waze",
      onPress: () => open(`https://waze.com/ul?ll=${latLng}&navigate=yes`),
    });
    if (Platform.OS === "android") {
      buttons.push({ text: "Maps", onPress: () => open(`geo:0,0?q=${latLng}`) });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Open location in…", "", buttons);
  };

  const getMessageStatus = (message) => {
    if (message.senderId !== auth.currentUser.uid) return null;

    // Other participants (everyone loaded in the chat except the sender)
    const otherIds = Object.keys(users).filter(
      (uid) => uid !== auth.currentUser.uid
    );

    if (otherIds.length === 0) {
      // Solo chat — sent tick only
      return { icon: "✓", color: colors.textTertiary };
    }

    // New per-user map format
    if (message.readBy !== undefined || message.deliveredTo !== undefined) {
      const readBy = message.readBy || {};
      const deliveredTo = message.deliveredTo || {};

      const allRead = otherIds.every((uid) => readBy[uid]);
      if (allRead) return { icon: "✓✓", color: colors.primary }; // blue — all read

      const anyDelivered = otherIds.some((uid) => deliveredTo[uid] || readBy[uid]);
      if (anyDelivered) return { icon: "✓✓", color: colors.textTertiary }; // grey double — delivered to some

      return { icon: "✓", color: colors.textTertiary }; // grey single — sent
    }

    // Legacy boolean format fallback (old messages)
    if (message.read) return { icon: "✓✓", color: colors.primary };
    if (message.delivered) return { icon: "✓✓", color: colors.textTertiary };
    return { icon: "✓", color: colors.textTertiary };
  };

  // ✅ HELPER: Get user display name (handles both fullName and name fields)
  const getUserDisplayName = (user) => {
    if (!user) return "User";
    return user.fullName || user.name || "User";
  };

  // ✅ HELPER: Extract emoji string from avatar (stored as {type, value} object)
  const getAvatarEmoji = (user) => {
    if (!user) return "😊";
    const avatar = user.avatar;
    if (!avatar) return user.emoji || "😊";
    if (typeof avatar === "string") return avatar;
    if (avatar.type === "emoji") return avatar.value || "😊";
    return "😊"; // photo avatars — fall back to default in chat bubbles
  };

  const styles = createStyles(colors);

  const MessageBubble = ({ message }) => {
    const isMe = message.senderId === auth.currentUser.uid;
    const user = users[message.senderId];
    const time = new Date(message.createdAt).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const status = getMessageStatus(message);

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
            <Text style={[styles.senderName, { color: colors.primary }]}>
              {user.fullName || user.name || "Host"}
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
            <Text style={[styles.senderName, { color: colors.primary }]}>
              {user.fullName || user.name || "Someone"}
            </Text>
          )}
          <CarpoolCard
            eventId={eventId}
            carpoolId={message.data.carpoolId}
            currentUserName={currentUserName()}
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
              <View
                style={[
                  styles.senderAvatar,
                  {
                    backgroundColor: `${colors.primary}26`,
                    borderColor: `${colors.primary}4D`,
                  },
                ]}
              >
                <Text style={styles.senderEmoji}>
                  {getAvatarEmoji(user)}
                </Text>
              </View>
              <Text
                style={[styles.senderName, { color: colors.textSecondary }]}
              >
                {getUserDisplayName(user)}
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
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={[styles.locationText, { color: colors.text }]}>
              {message.location.address}
            </Text>
            <Text
              style={[styles.locationSubtext, { color: colors.textSecondary }]}
            >
              Tap to open in maps
            </Text>
            <View style={styles.messageFooter}>
              <Text style={[styles.timeStamp, { color: colors.textTertiary }]}>
                {time}
              </Text>
              {status && (
                <Text style={[styles.statusIcon, { color: status.color }]}>
                  {status.icon}
                </Text>
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
            <View
              style={[
                styles.senderAvatar,
                {
                  backgroundColor: `${colors.primary}26`,
                  borderColor: `${colors.primary}4D`,
                },
              ]}
            >
              <Text style={styles.senderEmoji}>
                {getAvatarEmoji(user)}
              </Text>
            </View>
            <Text style={[styles.senderName, { color: colors.textSecondary }]}>
              {getUserDisplayName(user)}
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
          <Text style={[styles.messageText, { color: colors.text }]}>
            {message.text}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[styles.timeStamp, { color: colors.textTertiary }]}>
              {time}
            </Text>
            {status && (
              <Text style={[styles.statusIcon, { color: status.color }]}>
                {status.icon}
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const TypingIndicator = () => {
    if (typingUsers.length === 0) return null;

    const typingUserNames = typingUsers
      .map((userId) => {
        const user = users[userId];
        const displayName = getUserDisplayName(user);
        return displayName.split(" ")[0];
      })
      .slice(0, 2);

    let typingText = "";
    if (typingUserNames.length === 1) {
      typingText = `${typingUserNames[0]} is typing...`;
    } else if (typingUserNames.length === 2) {
      typingText = `${typingUserNames[0]} and ${typingUserNames[1]} are typing...`;
    } else {
      typingText = `${typingUserNames[0]}, ${typingUserNames[1]} and ${
        typingUsers.length - 2
      } others are typing...`;
    }

    return (
      <View style={styles.typingContainer}>
        <Text style={[styles.typingText, { color: colors.textSecondary }]}>
          {typingText}
        </Text>
        <View style={styles.typingDots}>
          <View
            style={[styles.dot, { backgroundColor: colors.textSecondary }]}
          />
          <View
            style={[styles.dot, { backgroundColor: colors.textSecondary }]}
          />
          <View
            style={[styles.dot, { backgroundColor: colors.textSecondary }]}
          />
        </View>
      </View>
    );
  };

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
          <Text style={[styles.backButton, { color: colors.text }]}>←</Text>
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
            Group Chat
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
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatEmoji}>👋</Text>
            <Text
              style={[styles.emptyChatText, { color: colors.textSecondary }]}
            >
              Start the conversation!
            </Text>
          </View>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <TypingIndicator />
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
            onPress={handleShareLocation}
            disabled={sendingLocation}
          >
            <Text style={styles.locationButtonIcon}>
              {sendingLocation ? "⏳" : "📍"}
            </Text>
          </TouchableOpacity>

          {isHost && (
            <TouchableOpacity style={styles.locationButton} onPress={openPollModal}>
              <Text style={styles.locationButtonIcon}>📊</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.locationButton}
            onPress={() => setCarpoolModalVisible(true)}
          >
            <Text style={styles.locationButtonIcon}>🚗</Text>
          </TouchableOpacity>

          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={inputText}
            onChangeText={handleTextChange}
            placeholder="Type a message..."
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
              <Text style={styles.sendIcon}>{sending ? "⏳" : "↑"}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Create poll modal (host) */}
      <Modal visible={pollModalVisible} transparent animationType="slide">
        <View style={styles.pollModalOverlay}>
          <View style={[styles.pollModalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.pollModalTitle, { color: colors.text }]}>
              Create a poll
            </Text>
            <TextInput
              style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Question"
              placeholderTextColor={colors.textTertiary}
              value={pollQuestion}
              onChangeText={setPollQuestion}
              maxLength={140}
            />
            {pollOptions.map((opt, i) => (
              <TextInput
                key={i}
                style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={colors.textTertiary}
                value={opt}
                onChangeText={(v) => updatePollOption(i, v)}
                maxLength={80}
              />
            ))}
            {pollOptions.length < 5 && (
              <TouchableOpacity onPress={() => setPollOptions((p) => [...p, ""])}>
                <Text style={[styles.pollAddOption, { color: colors.primary }]}>
                  + Add option
                </Text>
              </TouchableOpacity>
            )}
            <View style={styles.pollAnonRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>Anonymous</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                  Hide who voted for what
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
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreatePoll} disabled={creatingPoll}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {creatingPoll ? "Creating…" : "Create poll"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <KeyboardAccessory />
      </Modal>

      {/* Offer a ride (car pool) modal */}
      <Modal visible={carpoolModalVisible} transparent animationType="slide">
        <View style={styles.pollModalOverlay}>
          <View style={[styles.pollModalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.pollModalTitle, { color: colors.text }]}>
              Offer a ride 🚗
            </Text>
            <TextInput
              style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Seats available (e.g. 3)"
              placeholderTextColor={colors.textTertiary}
              value={carpoolForm.seatsTotal}
              onChangeText={(v) =>
                setCarpoolForm((f) => ({ ...f, seatsTotal: v.replace(/[^0-9]/g, "") }))
              }
              keyboardType="number-pad"
            />
            <TextInput
              style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Pickup area (e.g. Centro)"
              placeholderTextColor={colors.textTertiary}
              value={carpoolForm.from}
              onChangeText={(v) => setCarpoolForm((f) => ({ ...f, from: v }))}
              maxLength={60}
            />
            <TextInput
              style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Departure time (e.g. 6:30 PM)"
              placeholderTextColor={colors.textTertiary}
              value={carpoolForm.departureTime}
              onChangeText={(v) => setCarpoolForm((f) => ({ ...f, departureTime: v }))}
              maxLength={40}
            />
            <TextInput
              style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
              placeholder="Notes (optional)"
              placeholderTextColor={colors.textTertiary}
              value={carpoolForm.notes}
              onChangeText={(v) => setCarpoolForm((f) => ({ ...f, notes: v }))}
              maxLength={120}
            />
            <View style={styles.pollModalActions}>
              <TouchableOpacity onPress={() => setCarpoolModalVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateCarpool} disabled={creatingCarpool}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {creatingCarpool ? "Posting…" : "Offer ride"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <KeyboardAccessory />
      </Modal>
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
    backButton: { fontSize: 28 },
    headerInfo: { flex: 1, marginLeft: 16 },
    headerTitle: { fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
    headerSubtitle: { fontSize: 12, marginTop: 2 },
    messagesContainer: { flex: 1 },
    messagesContent: { paddingHorizontal: 24, paddingVertical: 20 },
    emptyChat: { alignItems: "center", marginTop: 100 },
    emptyChatEmoji: { fontSize: 56, marginBottom: 12 },
    emptyChatText: { fontSize: 14 },
    messageBubble: { marginBottom: 16, maxWidth: "80%" },
    myMessage: { alignSelf: "flex-end" },
    theirMessage: { alignSelf: "flex-start" },
    senderInfo: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    senderAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 8,
    },
    senderEmoji: { fontSize: 14 },
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
    statusIcon: { fontSize: 12 },
    locationIcon: { fontSize: 32, marginBottom: 8, textAlign: "center" },
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
    locationButtonIcon: { fontSize: 20 },
    pollModalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
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
