import React, { useState, useEffect, useRef, useMemo } from "react";
import Icon from "../components/Icon";
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
  Switch,
  Alert,
  Linking,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import KeyboardAccessory from "../components/KeyboardAccessory";
import PollCard from "../components/PollCard";
import { createPoll } from "../services/pollService";
import { detectProhibitedContent, PROHIBITED_MESSAGE } from "../utils/contentGuard";
import { reportProhibitedContent } from "../services/reportService";
import {
  getGroup,
  updateGroup,
  subscribeGroupMessages,
  sendGroupMessage,
  sendEventInvite,
  markGroupMessagesRead,
  markGroupNotificationsRead,
} from "../services/hostGroupService";

export default function GroupChatScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const { groupId } = route.params || {};
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [inviteVisible, setInviteVisible] = useState(false);
  const [myEvents, setMyEvents] = useState([]);
  const [pollVisible, setPollVisible] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollAnon, setPollAnon] = useState(false);
  const [spotifyVisible, setSpotifyVisible] = useState(false);
  const [spotifyDraft, setSpotifyDraft] = useState("");
  const [spotifySaving, setSpotifySaving] = useState(false);
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

  const tickStatus = (m) => {
    if (recipientIds.length === 0) return "sent";
    if (recipientIds.every((id) => (m.readBy || []).includes(id))) return "read";
    if (recipientIds.every((id) => (m.deliveredTo || []).includes(id))) {
      return "delivered";
    }
    return "sent";
  };

  const TickIcon = ({ status }) => {
    if (status === "read") {
      return <Icon name="checkAll" size={14} color="#34B7F1" />;
    }
    if (status === "delivered") {
      return <Icon name="checkAll" size={14} color={colors.textTertiary} />;
    }
    return <Icon name="check" size={14} color={colors.textTertiary} />;
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
    const guard = detectProhibitedContent(body);
    if (guard.flagged) {
      setText("");
      reportProhibitedContent({ reason: guard.reason, content: body, groupId });
      Alert.alert(t("groupChat.messageBlockedTitle"), PROHIBITED_MESSAGE);
      return;
    }
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
      anonymous: pollAnon,
    });
    if (r.success) {
      setPollVisible(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollAnon(false);
    } else {
      alert(r.error || t("groupChat.poll.couldntCreate"));
    }
  };

  const saveSpotify = async () => {
    const url = spotifyDraft.trim();
    if (!/spotify\.com|^spotify:/i.test(url)) {
      Alert.alert(t("groupChat.spotify.invalidLinkTitle"), t("groupChat.spotify.invalidLinkMsg"));
      return;
    }
    setSpotifySaving(true);
    try {
      await updateGroup(groupId, { spotifyUrl: url });
      setGroup((g) => ({ ...g, spotifyUrl: url }));
      setSpotifyVisible(false);
      setSpotifyDraft("");
    } catch (e) {
      Alert.alert(t("groupChat.spotify.couldntSaveTitle"), e.message || t("groupChat.spotify.tryAgain"));
    } finally {
      setSpotifySaving(false);
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
        {/* Connect Spotify playlist (Fix 4) — host-only focused flow.
            Spotify green is the one allowed non-brand accent. */}
        <Modal
          visible={spotifyVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSpotifyVisible(false)}
        >
          <View style={styles.spotifyOverlay}>
            <View style={[styles.spotifyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.spotifyTitleRow}>
                <Icon name="music2" size={20} color="#1DB954" />
                <Text style={[styles.spotifyTitle, { color: colors.text }]}>
                  {t("groupChat.spotify.connectTitle")}
                </Text>
              </View>
              <Text style={[styles.spotifyHint, { color: colors.textSecondary }]}>
                {t("groupChat.spotify.hint")}
              </Text>
              <TextInput
                style={[styles.spotifyInput, { backgroundColor: colors.sunken, borderColor: colors.border, color: colors.text }]}
                placeholder={t("groupChat.spotify.placeholder")}
                placeholderTextColor={colors.textTertiary}
                value={spotifyDraft}
                onChangeText={setSpotifyDraft}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.spotifyActions}>
                <TouchableOpacity onPress={() => setSpotifyVisible(false)} style={styles.spotifyCancel}>
                  <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{t("groupChat.spotify.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveSpotify}
                  disabled={spotifySaving}
                  style={[styles.spotifyConnect, spotifySaving && { opacity: 0.6 }]}
                >
                  <Text style={styles.spotifyConnectText}>
                    {spotifySaving ? t("groupChat.spotify.saving") : t("groupChat.spotify.connect")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {group?.name || t("groupChat.defaultGroupName")}
          </Text>
          <View style={styles.headerRight}>
            {group?.spotifyUrl ? (
              // Everyone can open the host's playlist in Spotify.
              <TouchableOpacity onPress={() => Linking.openURL(group.spotifyUrl)}>
                <Icon name="music2" size={22} color="#1DB954" />
              </TouchableOpacity>
            ) : isHost ? (
              // Host without a playlist yet: ♪ opens the focused Spotify
              // connect flow (Fix 4) — settings stays on the gear.
              <TouchableOpacity onPress={() => setSpotifyVisible(true)}>
                <Icon name="music2" size={22} color={colors.textTertiary} />
              </TouchableOpacity>
            ) : null}
            {isHost ? (
              <TouchableOpacity
                onPress={() => navigation.navigate("GroupManage", { groupId })}
              >
                <Icon name="settings" size={22} color={colors.text} />
              </TouchableOpacity>
            ) : (
              !group?.spotifyUrl && <View style={{ width: 22 }} />
            )}
          </View>
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
                    <Icon name="ticket" size={18} color={colors.primary} />
                    <Text style={[styles.inviteTitle, { color: colors.text }]} numberOfLines={2}>
                      {m.data.eventTitle || t("groupChat.defaultEventName")}
                    </Text>
                  </View>
                  <Text style={[styles.inviteCta, { color: colors.primary }]}>
                    {t("groupChat.viewEvent")}
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
                  <View style={styles.tickRow} testID={`tick-${tickStatus(m)}`}>
                    <TickIcon status={tickStatus(m)} />
                  </View>
                )}
              </View>
            );
          })}
          {messages.length === 0 && (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>
              {t("groupChat.noMessagesSayHi")}
            </Text>
          )}
        </ScrollView>

        {group?.hostOnly && !isHost ? (
          <View style={[styles.inputBar, { borderTopColor: colors.border, justifyContent: "center" }]}>
            <Text style={{ color: colors.textTertiary, textAlign: "center" }}>
              {t("groupChat.hostOnlyNote")}
            </Text>
          </View>
        ) : (
          <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
            {isHost && (
              <TouchableOpacity style={styles.iconBtn} onPress={openInvite}>
                <Icon name="ticket" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            {isHost && (
              <TouchableOpacity style={styles.iconBtn} onPress={() => setPollVisible(true)}>
                <Icon name="chart" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceGlass }]}
              placeholder={t("groupChat.messagePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={text}
              onChangeText={setText}
              multiline
            />
            <TouchableOpacity
              testID="send-button"
              style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: text.trim() ? 1 : 0.4 }]}
              onPress={handleSend}
              disabled={!text.trim()}
            >
              <Icon name="send" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Event invite picker */}
        <Modal visible={inviteVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t("groupChat.invite.title")}
              </Text>
              {myEvents.length === 0 ? (
                <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>
                  {t("groupChat.invite.noEvents")}
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
                        {new Date(e.date).toLocaleDateString(i18n.language)}
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
                  {t("groupChat.invite.cancel")}
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
                {t("groupChat.poll.createTitle")}
              </Text>
              <TextInput
                style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
                placeholder={t("groupChat.poll.questionPlaceholder")}
                placeholderTextColor={colors.textTertiary}
                value={pollQuestion}
                onChangeText={setPollQuestion}
                maxLength={140}
              />
              {pollOptions.map((opt, idx) => (
                <TextInput
                  key={idx}
                  style={[styles.pollInput, { color: colors.text, borderColor: colors.border }]}
                  placeholder={t("groupChat.poll.optionPlaceholder", { num: idx + 1 })}
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
                    {t("groupChat.poll.addOption")}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.anonRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "600" }}>{t("groupChat.poll.anonymous")}</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                    {t("groupChat.poll.anonymousHint")}
                  </Text>
                </View>
                <Switch
                  value={pollAnon}
                  onValueChange={setPollAnon}
                  trackColor={{ true: colors.primary }}
                />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                <TouchableOpacity onPress={() => setPollVisible(false)}>
                  <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{t("groupChat.poll.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreatePoll}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("groupChat.poll.createPoll")}</Text>
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
    headerRight: { flexDirection: "row", alignItems: "center", gap: 16 },
    spotifyOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      padding: 24,
    },
    spotifyCard: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
    spotifyTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    spotifyTitle: { fontSize: 17, fontWeight: "700" },
    spotifyHint: { fontSize: 13, lineHeight: 18 },
    spotifyInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
    spotifyActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 16, marginTop: 4 },
    spotifyCancel: { paddingVertical: 8 },
    // Spotify green — the one allowed non-brand accent (design system).
    spotifyConnect: { backgroundColor: "#1DB954", borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10 },
    spotifyConnectText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
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
    anonRow: { flexDirection: "row", alignItems: "center", marginVertical: 6, gap: 8 },
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
