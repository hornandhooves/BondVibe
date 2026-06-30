import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Send, Settings, Ticket, Check, CheckCheck } from "lucide-react-native";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import KeyboardAccessory from "../components/KeyboardAccessory";
import PollCard from "../components/PollCard";
import { createPoll } from "../services/pollService";
import {
  getGroup,
  subscribeGroupMessages,
  sendGroupMessage,
  sendEventInvite,
  markGroupMessagesRead,
  markGroupNotificationsRead,
} from "../services/hostGroupService";

export default function GroupChatScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { groupId } = route.params || {};
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [inviteVisible, setInviteVisible] = useState(false);
  const [myEvents, setMyEvents] = useState([]);
  const [pollVisible, setPollVisible] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const scrollRef = useRef(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    getGroup(groupId).then(setGroup);
    const unsub = subscribeGroupMessages(groupId, (m) => {
      setMessages(m);
      // Read receipts (blue ✓✓ for senders) + clear my Home bell badge.
      markGroupMessagesRead(groupId, m);
      markGroupNotificationsRead(groupId);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => unsub();
  }, [groupId]);

  const isHost = group && uid === group.hostId;

  // Everyone who should receive my messages (for delivered/read tick math).
  const recipientIds = useMemo(() => {
    if (!group) return [];
    const all = new Set([...(group.memberIds || []), group.hostId]);
    all.delete(uid);
    return [...all];
  }, [group, uid]);

  const MessageTicks = ({ m }) => {
    if (recipientIds.length === 0) {
      return <Check size={14} color={colors.textTertiary} strokeWidth={2.5} />;
    }
    const read = recipientIds.every((id) => (m.readBy || []).includes(id));
    if (read) return <CheckCheck size={14} color="#34B7F1" strokeWidth={2.5} />;
    const delivered = recipientIds.every((id) =>
      (m.deliveredTo || []).includes(id)
    );
    if (delivered) {
      return <CheckCheck size={14} color={colors.textTertiary} strokeWidth={2.5} />;
    }
    return <Check size={14} color={colors.textTertiary} strokeWidth={2.5} />;
  };

  const openInvite = async () => {
    const snap = await getDocs(
      query(collection(db, "events"), where("creatorId", "==", uid))
    );
    const now = Date.now();
    const evs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((e) => e.status !== "cancelled" && new Date(e.date).getTime() > now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    setMyEvents(evs);
    setInviteVisible(true);
  };

  const handleSend = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    await sendGroupMessage(groupId, body);
  };

  const handleInvite = async (event) => {
    setInviteVisible(false);
    await sendEventInvite(groupId, event);
  };

  const handleCreatePoll = async () => {
    const r = await createPoll(["hostGroups", groupId], {
      question: pollQuestion,
      options: pollOptions,
    });
    if (r.success) {
      setPollVisible(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
    } else {
      alert(r.error || "Couldn't create poll");
    }
  };

  const styles = createStyles(colors, isDark);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.back, { color: colors.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {group?.name || "Group"}
          </Text>
          {isHost ? (
            <TouchableOpacity
              onPress={() => navigation.navigate("GroupManage", { groupId })}
            >
              <Settings size={22} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={styles.messages}>
          {messages.map((m) => {
            const mine = m.senderId === uid;
            if (m.type === "poll" && m.data?.pollId) {
              return (
                <View
                  key={m.id}
                  style={[styles.cardWrap, mine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}
                >
                  <PollCard
                    parent={["hostGroups", groupId]}
                    pollId={m.data.pollId}
                    isHost={isHost}
                  />
                </View>
              );
            }
            if (m.type === "event_invite" && m.data?.eventId) {
              return (
                <TouchableOpacity
                  key={m.id}
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate("EventDetail", { eventId: m.data.eventId })
                  }
                  style={[styles.inviteCard, mine ? styles.mine : styles.theirs]}
                >
                  <View style={styles.inviteRow}>
                    <Ticket size={18} color={colors.primary} strokeWidth={2} />
                    <Text style={[styles.inviteTitle, { color: colors.text }]} numberOfLines={2}>
                      {m.data.eventTitle || "Event"}
                    </Text>
                  </View>
                  <Text style={[styles.inviteCta, { color: colors.primary }]}>
                    View event →
                  </Text>
                </TouchableOpacity>
              );
            }
            return (
              <View
                key={m.id}
                style={[styles.bubble, mine ? styles.mine : styles.theirs]}
              >
                <Text style={{ color: colors.text }}>{m.text}</Text>
                {mine && (
                  <View style={styles.tickRow}>
                    <MessageTicks m={m} />
                  </View>
                )}
              </View>
            );
          })}
          {messages.length === 0 && (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>
              No messages yet. Say hi 👋
            </Text>
          )}
        </ScrollView>

        <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
          {isHost && (
            <TouchableOpacity style={styles.iconBtn} onPress={openInvite}>
              <Text style={{ fontSize: 20 }}>🎟️</Text>
            </TouchableOpacity>
          )}
          {isHost && (
            <TouchableOpacity style={styles.iconBtn} onPress={() => setPollVisible(true)}>
              <Text style={{ fontSize: 20 }}>📊</Text>
            </TouchableOpacity>
          )}
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceGlass }]}
            placeholder="Message…"
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: text.trim() ? 1 : 0.4 }]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Send size={20} color="#FFFFFF" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Event invite picker */}
        <Modal visible={inviteVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Invite to an event
              </Text>
              {myEvents.length === 0 ? (
                <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>
                  You have no upcoming events to invite to.
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 320 }}>
                  {myEvents.map((e) => (
                    <TouchableOpacity
                      key={e.id}
                      style={[styles.eventRow, { borderColor: colors.border }]}
                      onPress={() => handleInvite(e)}
                    >
                      <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={1}>
                        {e.title}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {new Date(e.date).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity
                style={{ alignItems: "center", paddingVertical: 14 }}
                onPress={() => setInviteVisible(false)}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Create poll modal (host) */}
        <Modal visible={pollVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Create a poll 📊
              </Text>
              <TextInput
                style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
                placeholder="Question"
                placeholderTextColor={colors.textTertiary}
                value={pollQuestion}
                onChangeText={setPollQuestion}
                maxLength={140}
              />
              {pollOptions.map((opt, idx) => (
                <TextInput
                  key={idx}
                  style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
                  placeholder={`Option ${idx + 1}`}
                  placeholderTextColor={colors.textTertiary}
                  value={opt}
                  onChangeText={(v) =>
                    setPollOptions((p) => p.map((o, i) => (i === idx ? v : o)))
                  }
                  maxLength={80}
                />
              ))}
              {pollOptions.length < 5 && (
                <TouchableOpacity onPress={() => setPollOptions((p) => [...p, ""])}>
                  <Text style={{ color: colors.primary, fontWeight: "600", marginBottom: 8 }}>
                    + Add option
                  </Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                <TouchableOpacity onPress={() => setPollVisible(false)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreatePoll}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>Create poll</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <KeyboardAccessory />
        </Modal>
      </GradientBackground>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 12,
      gap: 12,
    },
    back: { fontSize: 28 },
    headerTitle: { fontSize: 18, fontWeight: "700", flex: 1, textAlign: "center" },
    messages: { paddingHorizontal: 16, paddingVertical: 12 },
    bubble: {
      maxWidth: "80%",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 8,
    },
    mine: { alignSelf: "flex-end", backgroundColor: `${colors.primary}33` },
    tickRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
    theirs: {
      alignSelf: "flex-start",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
    },
    inviteCard: {
      maxWidth: "82%",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: `${colors.primary}55`,
      padding: 12,
      marginBottom: 8,
    },
    inviteRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    inviteTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
    inviteCta: { fontSize: 13, fontWeight: "700", marginTop: 8 },
    empty: { textAlign: "center", marginTop: 40 },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 10,
      paddingBottom: 28,
      borderTopWidth: 1,
      gap: 8,
    },
    iconBtn: { padding: 8 },
    input: {
      flex: 1,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      maxHeight: 100,
      fontSize: 15,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    modalCard: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 24,
    },
    modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
    cardWrap: { marginBottom: 8 },
    pollInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      marginBottom: 10,
    },
    eventRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    eventName: { fontSize: 15, fontWeight: "600", flex: 1, marginRight: 8 },
  });
}
