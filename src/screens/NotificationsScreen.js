import React, { useState, useEffect } from "react";
import Icon from "../components/Icon";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import KeyboardAccessory from "../components/KeyboardAccessory";
import { auth, db } from "../services/firebase";
import { subscribeUserGroups, joinGroupByCode } from "../services/hostGroupService";
import { formatDate } from "../utils/formatDate";
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

// Legacy notification docs (and older code paths) stored an emoji in the
// `icon` field. Map those to central Icon names; new writes use names.
const LEGACY_ICON = {
  "🔔": "bell",
  "💬": "chat",
  "👑": "pro",
  "🎪": "tent",
  "👤": "user",
  "⚠️": "alert",
  "🚫": "block",
  "✅": "successCircle",
  "💜": "heart",
  "📣": "broadcast",
  "🎟️": "ticket",
  "⭐": "star",
  "👋": "users",
  "🎉": "party",
  "📬": "bell",
  "📝": "clipboard",
  "⏰": "clock",
};

const KNOWN_ICONS = new Set([
  "bell", "chat", "pro", "tent", "alert", "block", "successCircle", "heart",
  "broadcast", "party", "ticket", "star", "user", "users", "calendar",
  "clock", "location", "moon", "lock", "close", "check", "delete", "repeat",
  "refresh", "dollar", "info", "clipboard", "car", "bike", "chart", "ai",
  "globe", "languages", "edit", "errorCircle", "mail", "search",
]);

const resolveIconName = (raw) =>
  LEGACY_ICON[raw] || (KNOWN_ICONS.has(raw) ? raw : "bell");

export default function NotificationsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState([]);
  const [joinVisible, setJoinVisible] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Member inbox: groups the user belongs to.
  useEffect(() => {
    const unsub = subscribeUserGroups(setGroups);
    return () => unsub();
  }, []);

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    const r = await joinGroupByCode(joinCode);
    setJoining(false);
    if (r.success) {
      setJoinVisible(false);
      setJoinCode("");
      navigation.navigate("GroupChat", { groupId: r.groupId });
    } else {
      Alert.alert(t("notifications.couldntJoinTitle"), r.error || t("notifications.checkCodeTryAgain"));
    }
  };

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
                    ? t("notifications.newMessagesTitle", { count: data.unreadCount })
                    : t("notifications.messagesTitle"),
                message: `${data.lastSender || t("notifications.someone")}: ${
                  data.lastMessage || ""
                }`,
                read: data.read || false,
                icon: "chat",
                createdAt: createdAtValue,
                createdAtDate: createdAtDate, // ✅ Keep Date object for sorting
                unreadCount: data.unreadCount || 0,
                metadata: {
                  eventId: data.eventId
                    ? data.eventId.replace("event_", "")
                    : "",
                  eventTitle: String(data.eventTitle || t("notifications.defaultEventTitle")),
                  conversationId: data.eventId || "",
                },
              });
            } else {
              // Other notification types
              allNotifications.push({
                id: notifDoc.id,
                type: String(data.type || ""),
                title: String(data.title || t("notifications.defaultTitle")),
                message: String(data.message || ""),
                // BUG 34: carry the i18n key + params so the card renders in the
                // live app language (title/message above are only the fallback).
                titleKey: data.titleKey ? String(data.titleKey) : undefined,
                bodyKey: data.bodyKey ? String(data.bodyKey) : undefined,
                params:
                  data.params && typeof data.params === "object" ? data.params : {},
                icon: String(data.icon || "bell"),
                read: Boolean(data.read),
                createdAt: createdAtValue,
                createdAtDate: createdAtDate, // ✅ Keep Date object for sorting
                unreadCount: 0,
                fromUserId: data.fromUserId ? String(data.fromUserId) : undefined,
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
                title: t("notifications.welcomeTitle"),
                message: t("notifications.welcomeMessage"),
                time: t("notifications.justNow"),
                read: false,
                icon: "party",
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

    if (seconds < 60) return t("notifications.justNow");
    if (seconds < 3600) return t("notifications.minAgo", { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return t("notifications.hoursAgo", { count: Math.floor(seconds / 3600) });
    if (seconds < 604800) return t("notifications.daysAgo", { count: Math.floor(seconds / 86400) });
    return formatDate(date);
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
      case "event_reminder":
      case "waitlist_promoted":
        if (notification.metadata?.eventId) {
          navigation.navigate("EventDetail", {
            eventId: notification.metadata.eventId,
          });
        }
        break;

      case "event_messages":
      case "carpool_request":
      case "carpool_approved":
        if (notification.metadata?.eventId) {
          navigation.navigate("EventChat", {
            eventId: notification.metadata.eventId,
            eventTitle: notification.metadata.eventTitle || t("notifications.defaultEventChat"),
          });
        }
        break;

      case "event_rating":
      case "rating_reply":
        // Open the review detail (read + reply thread), not a modal.
        if (notification.metadata?.ratingId) {
          navigation.navigate("RatingDetail", {
            ratingId: notification.metadata.ratingId,
          });
        } else if (notification.metadata?.eventId) {
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

      case "membership_purchased":
      case "membership_low_credits":
      case "membership_expiring":
      case "membership_expired":
      case "membership_redeemed":
      case "membership_restored":
        navigation.navigate("MyMemberships");
        break;

      case "membership_sold":
        if (notification.metadata?.membershipId) {
          navigation.navigate("MembershipSale", { ...notification.metadata });
        } else {
          // Was MembershipPlans (the retired screen) — a live push notification
          // whose tap would have dead-ended once the route was unregistered.
          navigation.navigate("BusinessMemberships");
        }
        break;

      case "NEW_FOLLOWER":
        if (notification.fromUserId) {
          navigation.navigate("UserProfile", { userId: notification.fromUserId });
        }
        break;

      case "group_message":
        if (notification.metadata?.groupId) {
          navigation.navigate("GroupChat", {
            groupId: notification.metadata.groupId,
          });
        }
        break;

      case "welcome":
        Alert.alert(
          notification.title || t("notifications.welcomeTitle"),
          notification.message || notification.body,
          [{ text: t("notifications.letsGo"), onPress: () => navigation.navigate("SearchEvents") }]
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
      const safeIcon = String(notification.icon || "bell");
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

      // BUG 34: render system notifications from their i18n key + params so the
      // durable Inbox card follows the CURRENT app language (the stored
      // title/message is only an English fallback for old clients). Falls back to
      // the stored text for anything not yet keyed.
      let displayTitle = safeTitle;
      let displayMessage = safeMessage;
      const params = notification.params || {};
      if (notification.titleKey) displayTitle = t(notification.titleKey, params);
      if (notification.bodyKey) displayMessage = t(notification.bodyKey, params);

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
                  ? colors.surface
                  : (isDark ? `${colors.primary}15` : `${colors.primary}10`),
                borderColor: notification.read ? colors.borderStrong : colors.primary,
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
              {notification.type === "NEW_FOLLOWER" ? (
                <Icon name="community" size={22} color={colors.primary} />
              ) : (
                <Icon
                  name={resolveIconName(safeIcon)}
                  size={22}
                  color={colors.primary}
                />
              )}
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
                  {displayTitle}
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
                {displayMessage}
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
          <Icon name="back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t("notifications.headerTitle")}
        </Text>
        <TouchableOpacity onPress={handleMarkAllRead}>
          <Text style={[styles.markAllRead, { color: colors.primary }]}>
            {t("notifications.markAllRead")}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
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
          {/* Groups inbox */}
          <View style={styles.groupsHeaderRow}>
            <Text style={[styles.groupsHeading, { color: colors.textTertiary }]}>
              {t("notifications.groupsHeading")}
            </Text>
            <TouchableOpacity onPress={() => setJoinVisible(true)}>
              <Text style={[styles.joinLink, { color: colors.primary }]}>
                {t("notifications.joinWithCode")}
              </Text>
            </TouchableOpacity>
          </View>
          {groups.length === 0 && (
            <Text style={[styles.groupMeta, { color: colors.textTertiary, marginBottom: 16 }]}>
              {t("notifications.noGroupsYet")}
            </Text>
          )}
          {groups.length > 0 && (
            <>
              {groups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[
                    styles.groupRow,
                    { backgroundColor: colors.surface, borderColor: colors.borderStrong },
                  ]}
                  onPress={() => navigation.navigate("GroupChat", { groupId: g.id })}
                  activeOpacity={0.85}
                >
                  <View style={[styles.groupIcon, { backgroundColor: `${colors.primary}1F` }]}>
                    <Icon name="users" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.groupName, { color: colors.text }]} numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text style={[styles.groupMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {g.lastMessage || t("notifications.membersCount", { count: g.memberIds?.length || 0 })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          <Text style={[styles.groupsHeading, { color: colors.textTertiary, marginTop: 16 }]}>
            {t("notifications.notificationsHeading")}
          </Text>

          {notifications.length === 0 ? (
            <View style={styles.emptyInline}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t("notifications.allCaughtUp")}
              </Text>
            </View>
          ) : (
            notifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Join group by code */}
      <Modal visible={joinVisible} transparent animationType="slide">
        <View style={styles.joinOverlay}>
          <View style={[styles.joinCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.joinTitle, { color: colors.text }]}>
              {t("notifications.joinGroupTitle")}
            </Text>
            <Text style={[styles.joinHint, { color: colors.textSecondary }]}>
              {t("notifications.joinGroupHint")}
            </Text>
            <TextInput
              style={[styles.joinInput, { color: colors.text, borderColor: colors.border }]}
              placeholder={t("notifications.joinCodePlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={joinCode}
              onChangeText={(v) => setJoinCode(v.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
            />
            <View style={styles.joinActions}>
              <TouchableOpacity onPress={() => setJoinVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>
                  {t("notifications.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleJoinByCode} disabled={joining}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  {joining ? t("notifications.joining") : t("notifications.join")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <KeyboardAccessory />
      </Modal>
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
    headerTitle: { fontSize: 20, fontWeight: "700" },
    markAllRead: { fontSize: 13, fontWeight: "600" },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    groupsHeading: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
      marginBottom: 10,
    },
    groupRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      marginBottom: 10,
    },
    groupIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    groupName: { fontSize: 15, fontWeight: "700" },
    groupMeta: { fontSize: 13, marginTop: 2 },
    emptyInline: { alignItems: "center", paddingVertical: 30 },
    groupsHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    joinLink: { fontSize: 13, fontWeight: "700" },
    joinOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    joinCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
    joinTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6 },
    joinHint: { fontSize: 14, marginBottom: 16 },
    joinInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: 4,
      textAlign: "center",
    },
    joinActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
    notificationCard: {
      marginBottom: 12,
      borderRadius: 16,
      overflow: "hidden",
    },
    notificationGlass: { borderWidth: 1, padding: 16, flexDirection: "row", borderRadius: 18 },
    notificationIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
      position: "relative",
    },
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
