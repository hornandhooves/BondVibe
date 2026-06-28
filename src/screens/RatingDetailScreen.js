import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Star, Send, Sparkles } from "lucide-react-native";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import { usePremium } from "../hooks/usePremium";
import { generateReviewReply, isPremiumRequired } from "../services/aiService";
import GradientBackground from "../components/GradientBackground";
import { AvatarDisplay } from "../components/AvatarPicker";
import { createNotification } from "../utils/notificationService";

const normalizeAvatar = (a) => {
  if (!a) return null;
  if (typeof a === "string") return { type: "emoji", value: a };
  return a;
};

export default function RatingDetailScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { ratingId } = route.params || {};
  const [rating, setRating] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const { isPremium } = usePremium();

  const handleSuggestReply = async () => {
    setAiLoading(true);
    const r = await generateReviewReply(rating?.rating || 0, rating?.comment || "");
    setAiLoading(false);
    if (r.success && r.reply) {
      setText(r.reply);
    } else if (isPremiumRequired(r)) {
      Alert.alert(
        "Función Pro ✨",
        "Las respuestas con IA son parte de BondVibe Pro.",
        [
          { text: "Ahora no", style: "cancel" },
          { text: "Ver Pro", onPress: () => navigation.navigate("BondVibePro") },
        ]
      );
    } else {
      Alert.alert("No se pudo generar", r.error || "Intenta de nuevo.");
    }
  };
  const scrollRef = useRef(null);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    let unsub = null;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "ratings", ratingId));
        if (snap.exists()) setRating({ id: snap.id, ...snap.data() });
      } catch (e) {
        console.error("Error loading rating:", e);
      }
      setLoading(false);

      // Live reply thread
      const q = query(
        collection(db, "ratings", ratingId, "messages"),
        orderBy("createdAt", "asc")
      );
      unsub = onSnapshot(q, (s) => {
        setMessages(s.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      });
    })();
    return () => unsub && unsub();
  }, [ratingId]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending || !rating) return;
    setSending(true);
    setText("");
    try {
      await addDoc(collection(db, "ratings", ratingId, "messages"), {
        senderId: uid,
        text: body,
        createdAt: serverTimestamp(),
      });
      // Notify the other party.
      const recipient = uid === rating.hostId ? rating.userId : rating.hostId;
      if (recipient) {
        await createNotification(recipient, {
          type: "rating_reply",
          title: "New message about your review 💬",
          message: body.length > 80 ? `${body.slice(0, 80)}…` : body,
          icon: "💬",
          metadata: { ratingId },
        });
      }
    } catch (e) {
      console.error("Error sending reply:", e);
    } finally {
      setSending(false);
    }
  };

  const styles = createStyles(colors, isDark);

  if (loading) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </GradientBackground>
    );
  }

  if (!rating) {
    return (
      <GradientBackground>
        <View style={styles.loading}>
          <Text style={{ color: colors.textSecondary }}>Rating not found.</Text>
        </View>
      </GradientBackground>
    );
  }

  const isHost = uid === rating.hostId;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <GradientBackground>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.back, { color: colors.text }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Review</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Rating card */}
          <View style={styles.ratingCard}>
            <View style={styles.ratingHeader}>
              <AvatarDisplay avatar={normalizeAvatar(rating.userAvatar)} size={44} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.userName, { color: colors.text }]}>
                  {rating.userName || "Attendee"}
                </Text>
                <View style={{ flexDirection: "row", marginTop: 4 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={16}
                      color={s <= rating.rating ? "#FFD700" : colors.border}
                      fill={s <= rating.rating ? "#FFD700" : "transparent"}
                      strokeWidth={2}
                    />
                  ))}
                </View>
              </View>
            </View>
            {!!rating.eventTitle && (
              <Text style={[styles.eventTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {rating.eventTitle}
              </Text>
            )}
            {!!rating.comment && (
              <Text style={[styles.comment, { color: colors.text }]}>
                {rating.comment}
              </Text>
            )}
          </View>

          <Text style={[styles.threadLabel, { color: colors.textTertiary }]}>
            {isHost
              ? "Reply to ask for more feedback or thank them"
              : "Conversation with the host"}
          </Text>

          {messages.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textTertiary }]}>
              No messages yet.
            </Text>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === uid;
              return (
                <View
                  key={m.id}
                  style={[
                    styles.bubble,
                    mine
                      ? { alignSelf: "flex-end", backgroundColor: `${colors.primary}33` }
                      : {
                          alignSelf: "flex-start",
                          backgroundColor: isDark
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(0,0,0,0.05)",
                        },
                  ]}
                >
                  <Text style={{ color: colors.text }}>{m.text}</Text>
                </View>
              );
            })
          )}
        </ScrollView>

        {isHost && (
          <TouchableOpacity
            style={styles.aiSuggest}
            onPress={handleSuggestReply}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Sparkles size={15} color={colors.primary} strokeWidth={2} />
            )}
            <Text style={[styles.aiSuggestText, { color: colors.primary }]}>
              {aiLoading ? "Generando…" : "Sugerir respuesta con IA"}
            </Text>
          </TouchableOpacity>
        )}
        <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceGlass }]}
            placeholder="Write a message…"
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: text.trim() ? 1 : 0.4 }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            <Send size={20} color="#FFFFFF" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </GradientBackground>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 16,
    },
    back: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: "700" },
    content: { paddingHorizontal: 24, paddingBottom: 20 },
    ratingCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
      padding: 16,
      marginBottom: 20,
    },
    ratingHeader: { flexDirection: "row", alignItems: "center" },
    userName: { fontSize: 16, fontWeight: "700" },
    eventTitle: { fontSize: 13, marginTop: 12 },
    comment: { fontSize: 15, lineHeight: 21, marginTop: 8 },
    threadLabel: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    empty: { fontSize: 14, textAlign: "center", marginVertical: 16 },
    bubble: {
      maxWidth: "80%",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 8,
    },
    aiSuggest: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
    },
    aiSuggestText: { fontSize: 13, fontWeight: "700" },
    inputBar: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 16,
      paddingVertical: 10,
      paddingBottom: 28,
      borderTopWidth: 1,
      gap: 10,
    },
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
  });
}
