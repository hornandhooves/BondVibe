import Icon from "../components/Icon";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { auth, db } from "../services/firebase";
import { getUserConversations } from "../utils/messageService";
import { collection, query, where, getDocs } from "firebase/firestore";
import { AvatarDisplay } from "../components/AvatarPicker";

// Accept legacy string avatars and {type,value} objects; AvatarDisplay
// renders a photo or a branded-initial fallback — never an emoji.
const normAvatar = (a) =>
  !a ? null : typeof a === "string" ? { type: "emoji", value: a } : a;

export default function ConversationsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const userConversations = await getUserConversations(
        auth.currentUser.uid
      );

      // Contar mensajes no leídos para cada conversación
      const conversationsWithUnread = await Promise.all(
        userConversations.map(async (conv) => {
          const messagesQuery = query(
            collection(db, "conversations", conv.id, "messages"),
            where("senderId", "!=", auth.currentUser.uid),
            where("read", "==", false)
          );
          const snapshot = await getDocs(messagesQuery);
          return {
            ...conv,
            unreadCount: snapshot.size,
          };
        })
      );

      setConversations(conversationsWithUnread);
    } catch (error) {
      console.error("Error loading conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  const getTimeAgo = (isoDate) => {
    if (!isoDate) return "";
    const date = new Date(isoDate);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return date.toLocaleDateString();
  };

  const styles = createStyles(colors);

  const ConversationCard = ({ conversation }) => (
    <TouchableOpacity
      style={styles.conversationCard}
      onPress={() =>
        navigation.navigate("Chat", {
          conversationId: conversation.id,
          otherUser: conversation.otherUser,
        })
      }
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.conversationGlass,
          {
            backgroundColor:
              conversation.unreadCount > 0
                ? `${colors.primary}0D`
                : colors.surfaceGlass,
            borderColor:
              conversation.unreadCount > 0
                ? `${colors.primary}33`
                : colors.border,
          },
        ]}
      >
        <AvatarDisplay
          avatar={normAvatar(conversation.otherUser?.avatar)}
          size={52}
          name={conversation.otherUser?.fullName}
          style={styles.avatar}
        />

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text
              style={[
                styles.userName,
                {
                  color: colors.text,
                  fontWeight: conversation.unreadCount > 0 ? "700" : "600",
                },
              ]}
              numberOfLines={1}
            >
              {conversation.otherUser?.fullName || "Unknown User"}
            </Text>
            <View style={styles.rightInfo}>
              {conversation.lastMessageAt && (
                <Text style={[styles.timeText, { color: colors.textTertiary }]}>
                  {getTimeAgo(conversation.lastMessageAt)}
                </Text>
              )}
              {conversation.unreadCount > 0 && (
                <View
                  style={[
                    styles.unreadBadge,
                    { backgroundColor: colors.accent },
                  ]}
                >
                  <Text style={styles.unreadText}>
                    {conversation.unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <Text
            style={[
              styles.lastMessage,
              {
                color: colors.textSecondary,
                fontWeight: conversation.unreadCount > 0 ? "600" : "400",
              },
            ]}
            numberOfLines={1}
          >
            {conversation.lastMessage || "Start a conversation"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Messages
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyArt}>
            <Icon name="chat" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No messages yet
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Start chatting with event attendees
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {conversations.map((conversation) => (
            <ConversationCard
              key={conversation.id}
              conversation={conversation}
            />
          ))}
        </ScrollView>
      )}
    </GradientBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 20,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    conversationCard: {
      marginBottom: 12,
      borderRadius: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    conversationGlass: {
      borderWidth: 1,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
    },
    avatar: { marginRight: 14 },
    conversationContent: { flex: 1 },
    conversationHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    userName: { fontSize: 16, flex: 1, letterSpacing: -0.2 },
    rightInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
    timeText: { fontSize: 12 },
    unreadBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 6,
    },
    unreadText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
    lastMessage: { fontSize: 14, lineHeight: 20 },
    emptyState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 40,
    },
    emptyArt: {
      width: 64,
      height: 64,
      borderRadius: 18,
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 10,
      letterSpacing: -0.3,
    },
    emptyText: { fontSize: 14, textAlign: "center" },
  });
}
