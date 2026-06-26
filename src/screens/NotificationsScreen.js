import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { auth, db } from "../services/firebase";
import {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
} from "../utils/notificationService";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore";

export default function NotificationsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    console.log(
      "🔔 Setting up real-time notifications listener in NotificationsScreen"
    );

    // Query ALL notifications for this user
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      async (snapshot) => {
        try {
          const allNotifications = [];

          for (const notifDoc of snapshot.docs) {
            const data = notifDoc.data();

            // ✅ Parse timestamp correctly
            let createdAtValue;
            let createdAtDate;

            // For event_messages, use updatedAt; for others, use createdAt
            const timestampField =
              data.type === "event_messages" ? data.updatedAt : data.createdAt;

            if (timestampField?.toDate) {
              createdAtDate = timestampField.toDate();
              createdAtValue = createdAtDate.toISOString();
            } else if (typeof timestampField === "string") {
              createdAtDate = new Date(timestampField);
              createdAtValue = timestampField;
            } else {
              createdAtDate = new Date();
              createdAtValue = createdAtDate.toISOString();
            }

            if (data.type === "event_messages") {
              // Message notification (grouped)
              allNotifications.push({
                id: notifDoc.id,
                type: "event_messages",
                title:
                  data.unreadCount > 0
                    ? `${data.unreadCount} new message${
                        data.unreadCount > 1 ? "s" : ""
                      }`
                    : "Messages",
                message: `${data.lastSender || "Someone"}: ${
                  data.lastMessage || ""
                }`,
                read: data.read || false,
                icon: "💬",
                createdAt: createdAtValue,
                createdAtDate: createdAtDate, // ✅ Keep Date object for sorting
                unreadCount: data.unreadCount || 0,
                metadata: {
                  eventId: data.eventId
                    ? data.eventId.replace("event_", "")
                    : "",
                  eventTitle: String(data.eventTitle || "Event"),
                  conversationId: data.eventId || "",
                },
              });
            } else {
              // Other notification types
              allNotifications.push({
                id: notifDoc.id,
                type: String(data.type || ""),
                title: String(data.title || "Notification"),
                message: String(data.message || ""),
                icon: String(data.icon || "🔔"),
                read: Boolean(data.read),
                createdAt: createdAtValue,
                createdAtDate: createdAtDate, // ✅ Keep Date object for sorting
                unreadCount: 0,
                metadata:
                  data.metadata && typeof data.metadata === "object"
                    ? {
                        eventTitle: data.metadata.eventTitle
                          ? String(data.metadata.eventTitle)
                          : undefined,
                        eventId: data.metadata.eventId
                          ? String(data.metadata.eventId)
                          : undefined,
                      }
                    : {},
              });
            }
          }

          // ✅ FIXED: Sort by createdAtDate (most recent first)
          allNotifications.sort((a, b) => b.createdAtDate - a.createdAtDate);

          console.log(
            `📬 Loaded ${allNotifications.length} notifications, sorted by date`
          );

          if (allNotifications.length === 0) {
            const demoNotifications = [
              {
                id: "demo1",
                type: "welcome",
                title: "Welcome to BondVibe! 👋",
                message: "Start exploring events and connect with people",
                time: "Just now",
                read: false,
                icon: "🎉",
                action: () => navigation.navigate("SearchEvents"),
                isDemo: true,
              },
            ];
            setNotifications(demoNotifications);
          } else {
            // Add time string and action to each notification
            const mappedNotifications = allNotifications.map((notif) => ({
              ...notif,
              time: getTimeAgo(notif.createdAtDate),
              action: () => handleNotificationAction(notif),
            }));
            setNotifications(mappedNotifications);
          }

          setLoading(false);
        } catch (error) {
          console.error("Error loading notifications:", error);
          setLoading(false);
        }
      },
      (error) => {
        console.error("❌ Error in notifications listener:", error);
        setLoading(false);
      }
    );

    return () => {
      console.log("🔕 Cleaning up notifications listener");
      unsubscribe();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const getTimeAgo = (date) => {
    if (!date || !(date instanceof Date)) return "";

    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return date.toLocaleDateString();
  };

  const handleNotificationAction = async (notification) => {
    // ✅ Mark as read BEFORE navigating
    if (!notification.isDemo && !notification.read && notification.id) {
      await markAsRead(notification.id);
    }

    switch (notification.type) {
      case "event_joined":
      case "event_paid_attendee":
      case "attendee_cancelled":
        if (notification.metadata?.eventId) {
          navigation.navigate("EventDetail", {
            eventId: notification.metadata.eventId,
          });
        }
        break;

      case "event_messages":
        if (
          notification.metadata?.eventId &&
          notification.metadata?.eventTitle
        ) {
          navigation.navigate("EventChat", {
            eventId: notification.metadata.eventId,
            eventTitle: notification.metadata.eventTitle,
          });
        }
        break;

      case "event_rating":
        // Navigate directly to the event that received the rating
        if (notification.metadata?.eventId) {
          navigation.navigate("EventDetail", {
            eventId: notification.metadata.eventId,
          });
        }
        break;

      case "host_approved":
        navigation.navigate("HostTypeSelection");
        break;

      case "host_rejected":
        navigation.navigate("Profile");
        break;

      case "host_request":
        navigation.navigate("AdminDashboard");
        break;

      case "welcome":
        Alert.alert(
          notification.title || "Welcome to BondVibe! 🎉",
          notification.message || notification.body,
          [{ text: "Let's go! 🚀", onPress: () => navigation.navigate("SearchEvents") }]
        );
        break;

      default:
        break;
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(auth.currentUser.uid);
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
  };

  const styles = createStyles(colors);

  const NotificationCard = ({ notification }) => {
    try {
      // Sanitize ALL values before using
      const safeIcon = String(notification.icon || "📬");
      const safeTitle = String(notification.title || "");
      const safeMessage = String(notification.message || "").replace(
        /\n/g,
        " "
      );
      const safeTime = String(notification.time || "");
      const safeEventTitle = notification.metadata?.eventTitle
        ? String(notification.metadata.eventTitle)
        : null;
      const safeUnreadCount = notification.unreadCount || 0;

      return (
        <TouchableOpacity
          style={styles.notificationCard}
          onPress={() => handleNotificationAction(notification)}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.notificationGlass,
              {
                backgroundColor: notification.read
                  ? (isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.85)")
                  : (isDark ? `${colors.primary}15` : `${colors.primary}10`),
                borderColor: notification.read
                  ? (isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.08)")
                  : `${colors.primary}4D`,
              },
            ]}
          >
            <View
              style={[
                styles.notificationIcon,
                {
                  backgroundColor: `${colors.primary}26`,
                },
              ]}
            >
              <Text style={styles.iconEmoji}>{safeIcon}</Text>
              {safeUnreadCount > 0 && (
                <View
                  style={[
                    styles.unreadBadge,
                    { backgroundColor: colors.accent },
                  ]}
                >
                  <Text style={styles.unreadBadgeText}>{safeUnreadCount}</Text>
                </View>
              )}
            </View>

            <View style={styles.notificationContent}>
              <View style={styles.notificationHeader}>
                <Text
                  style={[styles.notificationTitle, { color: colors.text }]}
                >
                  {safeTitle}
                </Text>
                {!notification.read && (
                  <View
                    style={[
                      styles.unreadDot,
                      { backgroundColor: colors.primary },
                    ]}
                  />
                )}
              </View>

              {notification.type === "event_messages" && safeEventTitle && (
                <Text
                  style={[styles.eventTitle, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  {safeEventTitle}
                </Text>
              )}

              <Text
                style={[
                  styles.notificationMessage,
                  { color: colors.textSecondary },
                ]}
                numberOfLines={2}
              >
                {safeMessage}
              </Text>
              <Text
                style={[
                  styles.notificationTime,
                  { color: colors.textTertiary },
                ]}
              >
                {safeTime}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    } catch (error) {
      console.error(
        "❌ Error rendering notification card:",
        notification.id,
        error
      );
      return null;
    }
  };

  return (
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Notifications
        </Text>
        <TouchableOpacity onPress={handleMarkAllRead}>
          <Text style={[styles.markAllRead, { color: colors.primary }]}>
            Mark all read
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No notifications
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            You're all caught up!
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
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
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
    backButton: { fontSize: 28 },
    headerTitle: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    markAllRead: { fontSize: 13, fontWeight: "600" },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    notificationCard: {
      marginBottom: 12,
      borderRadius: 16,
      overflow: "hidden",
    },
    notificationGlass: { borderWidth: 1, padding: 16, flexDirection: "row", borderRadius: 16 },
    notificationIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
      position: "relative",
    },
    iconEmoji: { fontSize: 22 },
    unreadBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 6,
    },
    unreadBadgeText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
    },
    notificationContent: { flex: 1 },
    notificationHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    notificationTitle: {
      fontSize: 15,
      fontWeight: "700",
      flex: 1,
      letterSpacing: -0.2,
    },
    eventTitle: {
      fontSize: 13,
      fontWeight: "600",
      marginBottom: 4,
      letterSpacing: -0.1,
    },
    unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
    notificationMessage: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
    notificationTime: { fontSize: 12 },
    emptyState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 40,
    },
    emptyEmoji: { fontSize: 64, marginBottom: 20 },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 10,
      letterSpacing: -0.3,
    },
    emptyText: { fontSize: 14, textAlign: "center" },
  });
}
