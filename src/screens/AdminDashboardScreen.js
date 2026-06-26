import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useTheme } from "../contexts/ThemeContext";
import GradientBackground from "../components/GradientBackground";
import { createNotification } from "../utils/notificationService";
import AdminMessageModal from "../components/AdminMessageModal";
import AdminConfirmModal from "../components/AdminConfirmModal";
import { normalizeCategory } from "../utils/eventCategories";
import {
  getAllUsers,
  getUserStats,
  removeAdminRole,
  removeHostRole,
  suspendUser,
  unsuspendUser,
  canPerformAdminAction,
} from "../utils/adminService";

export default function AdminDashboardScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState("requests"); // requests | users

  // Host Requests state
  const [pendingRequests, setPendingRequests] = useState([]);
  const [hostRequestsProcessing, setHostRequestsProcessing] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentRequest, setCurrentRequest] = useState(null);
  const [modalType, setModalType] = useState("approve");

  // User Management state
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState("all"); // all | admin | host | user
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({
    pending: 0,
    events: 0,
    users: 0,
    admins: 0,
    hosts: 0,
    regular: 0,
    suspended: 0,
  });

  // Confirmation Modal state
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmUser, setConfirmUser] = useState(null);

  const [loading, setLoading] = useState(true);

  // ✅ HELPER: Get user display name (handles both fullName and name fields)
  const getUserDisplayName = (user) => {
    if (!user) return "Unknown";
    return user.fullName || user.name || "Unknown";
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === "users") {
      loadUsers(roleFilter);
    }
  }, [activeTab, roleFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load host requests
      const requestsQuery = query(
        collection(db, "hostRequests"),
        where("status", "==", "pending")
      );
      const requestsSnapshot = await getDocs(requestsQuery);
      const requests = await Promise.all(
        requestsSnapshot.docs.map(async (docSnap) => {
          const requestData = docSnap.data();
          const userDoc = await getDoc(doc(db, "users", requestData.userId));
          const userData = userDoc.data();
          return {
            id: docSnap.id,
            ...requestData,
            // ✅ FIX: Use fullName OR name
            userName: userData?.fullName || userData?.name || "Unknown User",
          };
        })
      );
      setPendingRequests(requests);

      // Load stats
      const eventsSnapshot = await getDocs(collection(db, "events"));
      const userStats = await getUserStats();

      setStats({
        pending: requests.length,
        events: eventsSnapshot.size,
        ...userStats,
      });
    } catch (error) {
      console.error("Error loading admin data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async (filter) => {
    setLoading(true);
    try {
      const allUsers = await getAllUsers(filter);
      setUsers(allUsers);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // HOST REQUESTS HANDLERS
  // ==========================================

  const handleApproveClick = (request) => {
    setCurrentRequest(request);
    setModalType("approve");
    setModalVisible(true);
  };

  const handleRejectClick = (request) => {
    setCurrentRequest(request);
    setModalType("reject");
    setModalVisible(true);
  };

  const handleApproveSubmit = async (message) => {
    if (!currentRequest) return;

    setHostRequestsProcessing(currentRequest.id);
    try {
      await updateDoc(doc(db, "hostRequests", currentRequest.id), {
        status: "approved",
        reviewedAt: new Date().toISOString(),
        adminMessage: message,
      });

      await updateDoc(doc(db, "users", currentRequest.userId), {
        role: "host",
      });

      await createNotification(currentRequest.userId, {
        type: "host_approved",
        title: "Congratulations! 🎉",
        message: `Your host request has been approved! Admin says: "${message}"`,
        icon: "🎪",
      });

      console.log("✅ Host request approved");

      setPendingRequests((prev) => prev.filter((r) => r.id !== currentRequest.id));
      setStats((prev) => ({ ...prev, pending: Math.max(0, (prev.pending || 1) - 1) }));

      Alert.alert(
        "Success",
        `${currentRequest.userName} is now a host! They will need to choose their host type on their next login.`,
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Error approving request:", error);
      Alert.alert("Error", "Could not approve request. Please try again.");
    } finally {
      setHostRequestsProcessing(null);
      setCurrentRequest(null);
    }
  };

  const handleRejectSubmit = async (message) => {
    if (!currentRequest) return;

    setHostRequestsProcessing(currentRequest.id);
    try {
      await updateDoc(doc(db, "hostRequests", currentRequest.id), {
        status: "rejected",
        reviewedAt: new Date().toISOString(),
        adminMessage: message,
      });

      await createNotification(currentRequest.userId, {
        type: "host_rejected",
        title: "Host Request Update",
        message: `Your host request was reviewed. Admin says: "${message}"`,
        icon: "📝",
      });

      console.log("✅ Host request rejected");
      Alert.alert(
        "Rejected",
        `${currentRequest.userName}'s request has been rejected`
      );
      await loadData();
    } catch (error) {
      console.error("Error rejecting request:", error);
      Alert.alert("Error", "Could not reject request. Please try again.");
    } finally {
      setHostRequestsProcessing(null);
      setCurrentRequest(null);
    }
  };

  // ==========================================
  // USER MANAGEMENT HANDLERS
  // ==========================================

  const handleRemoveHostRole = (user) => {
    setConfirmUser(user);
    setConfirmAction("remove_host");
    setConfirmModalVisible(true);
  };

  const handleRemoveAdminRole = (user) => {
    setConfirmUser(user);
    setConfirmAction("remove_admin");
    setConfirmModalVisible(true);
  };

  const handleSuspendUser = (user) => {
    setConfirmUser(user);
    setConfirmAction("suspend");
    setConfirmModalVisible(true);
  };

  const handleUnsuspendUser = (user) => {
    setConfirmUser(user);
    setConfirmAction("unsuspend");
    setConfirmModalVisible(true);
  };

  const handleConfirmAction = async (reason) => {
    if (!confirmUser) return;

    // Check permissions
    const permission = await canPerformAdminAction(
      auth.currentUser.uid,
      confirmUser.id
    );

    if (!permission.allowed) {
      Alert.alert("Error", permission.reason);
      setConfirmModalVisible(false);
      return;
    }

    setLoading(true);
    setConfirmModalVisible(false);

    // ✅ FIX: Use getUserDisplayName for alerts
    const displayName = getUserDisplayName(confirmUser);

    try {
      let result;

      switch (confirmAction) {
        case "remove_host":
          result = await removeHostRole(confirmUser.id, reason);
          if (result.success) {
            Alert.alert(
              "Success",
              `Removed host role from ${displayName}. ${result.eventsCancelled} event(s) cancelled.`
            );
          }
          break;

        case "remove_admin":
          result = await removeAdminRole(confirmUser.id);
          if (result.success) {
            Alert.alert("Success", `Removed admin role from ${displayName}`);
          }
          break;

        case "suspend":
          result = await suspendUser(
            confirmUser.id,
            reason,
            auth.currentUser.uid
          );
          if (result.success) {
            Alert.alert(
              "Success",
              `Suspended ${displayName}. ${result.eventsCancelled} event(s) cancelled.`
            );
          }
          break;

        case "unsuspend":
          result = await unsuspendUser(confirmUser.id);
          if (result.success) {
            Alert.alert("Success", `Unsuspended ${displayName}`);
          }
          break;
      }

      if (!result.success) {
        Alert.alert("Error", result.error || "Action failed");
      }

      await loadData();
      await loadUsers(roleFilter);
    } catch (error) {
      console.error("Error performing admin action:", error);
      Alert.alert("Error", "Could not complete action. Please try again.");
    } finally {
      setLoading(false);
      setConfirmUser(null);
      setConfirmAction(null);
    }
  };

  // ==========================================
  // FILTERS
  // ==========================================

  // ✅ FIX: Search uses both fullName and name
  const filteredUsers = users.filter((user) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const displayName = getUserDisplayName(user).toLowerCase();
    return (
      displayName.includes(query) || user.email?.toLowerCase().includes(query)
    );
  });

  // ==========================================
  // RENDER COMPONENTS
  // ==========================================

  const styles = createStyles(colors);

  const UserCard = ({ user }) => (
    <View style={styles.userCard}>
      <View
        style={[
          styles.userGlass,
          {
            backgroundColor: user.suspended
              ? "rgba(255, 69, 58, 0.1)"
              : colors.surfaceGlass,
            borderColor: user.suspended
              ? "rgba(255, 69, 58, 0.3)"
              : colors.border,
          },
        ]}
      >
        {/* User Header */}
        <View style={styles.userHeader}>
          <View
            style={[
              styles.userAvatar,
              {
                backgroundColor: `${colors.primary}26`,
                borderColor: `${colors.primary}4D`,
              },
            ]}
          >
            <Text style={styles.avatarText}>
              {user.emoji || (typeof user.avatar === "string" ? user.avatar : "👤")}
            </Text>
          </View>
          <View style={styles.userInfo}>
            {/* ✅ FIX: Use getUserDisplayName */}
            <Text style={[styles.userName, { color: colors.text }]}>
              {getUserDisplayName(user)}
            </Text>
            <Text style={[styles.userEmail, { color: colors.textTertiary }]}>
              {user.email}
            </Text>
          </View>
          <View
            style={[
              styles.roleBadge,
              {
                backgroundColor: getRoleBadgeColor(user.role),
                borderColor: getRoleBadgeColor(user.role, true),
              },
            ]}
          >
            <Text
              style={[styles.roleText, { color: getRoleTextColor(user.role) }]}
            >
              {user.role?.toUpperCase() || "USER"}
            </Text>
          </View>
        </View>

        {/* Suspended Badge */}
        {user.suspended && (
          <View style={styles.suspendedBanner}>
            <Text style={styles.suspendedText}>
              🚫 SUSPENDED{" "}
              {user.suspensionReason ? `• ${user.suspensionReason}` : ""}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.userActions}>
          {user.suspended ? (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleUnsuspendUser(user)}
            >
              <View
                style={[
                  styles.actionGlass,
                  {
                    backgroundColor: "rgba(52, 199, 89, 0.1)",
                    borderColor: "rgba(52, 199, 89, 0.3)",
                  },
                ]}
              >
                <Text style={[styles.actionText, { color: "#34C759" }]}>
                  Unsuspend
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <>
              {user.role === "host" && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleRemoveHostRole(user)}
                >
                  <View
                    style={[
                      styles.actionGlass,
                      {
                        backgroundColor: "rgba(255, 159, 10, 0.1)",
                        borderColor: "rgba(255, 159, 10, 0.3)",
                      },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: "#FF9F0A" }]}>
                      Remove Host
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {user.role === "admin" && user.id !== auth.currentUser.uid && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleRemoveAdminRole(user)}
                >
                  <View
                    style={[
                      styles.actionGlass,
                      {
                        backgroundColor: "rgba(255, 159, 10, 0.1)",
                        borderColor: "rgba(255, 159, 10, 0.3)",
                      },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: "#FF9F0A" }]}>
                      Remove Admin
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {user.id !== auth.currentUser.uid && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleSuspendUser(user)}
                >
                  <View
                    style={[
                      styles.actionGlass,
                      {
                        backgroundColor: "rgba(255, 69, 58, 0.1)",
                        borderColor: "rgba(255, 69, 58, 0.3)",
                      },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: "#FF453A" }]}>
                      Suspend
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );

  const getRoleBadgeColor = (role, isBorder = false) => {
    const alpha = isBorder ? "4D" : "26";
    switch (role) {
      case "admin":
        return `#FF453A${alpha}`;
      case "host":
        return `#FF9F0A${alpha}`;
      default:
        return `#007AFF${alpha}`;
    }
  };

  const getRoleTextColor = (role) => {
    switch (role) {
      case "admin":
        return "#FF453A";
      case "host":
        return "#FF9F0A";
      default:
        return "#007AFF";
    }
  };

  if (loading && activeTab === "requests") {
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
    <GradientBackground>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: colors.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Admin Dashboard
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab("requests")}
        >
          <View
            style={[
              styles.tabGlass,
              {
                backgroundColor:
                  activeTab === "requests"
                    ? `${colors.primary}33`
                    : colors.surfaceGlass,
                borderColor:
                  activeTab === "requests"
                    ? `${colors.primary}66`
                    : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "requests"
                      ? colors.primary
                      : colors.textSecondary,
                },
              ]}
            >
              Host Requests
            </Text>
            {stats.pending > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{stats.pending}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tab}
          onPress={() => setActiveTab("users")}
        >
          <View
            style={[
              styles.tabGlass,
              {
                backgroundColor:
                  activeTab === "users"
                    ? `${colors.primary}33`
                    : colors.surfaceGlass,
                borderColor:
                  activeTab === "users" ? `${colors.primary}66` : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "users"
                      ? colors.primary
                      : colors.textSecondary,
                },
              ]}
            >
              Users
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={styles.statIcon}>
              {activeTab === "requests" ? "⏳" : "👥"}
            </Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {activeTab === "requests" ? stats.pending : stats.regular}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {activeTab === "requests" ? "Pending" : "Users"}
            </Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={styles.statIcon}>
              {activeTab === "requests" ? "🎉" : "👑"}
            </Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {activeTab === "requests" ? stats.events : stats.admins}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {activeTab === "requests" ? "Events" : "Admins"}
            </Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                backgroundColor: colors.surfaceGlass,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={styles.statIcon}>
              {activeTab === "requests" ? "👥" : "🎪"}
            </Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {activeTab === "requests" ? stats.regular : stats.hosts}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {activeTab === "requests" ? "Users" : "Hosts"}
            </Text>
          </View>
        </View>

        {/* HOST REQUESTS TAB */}
        {activeTab === "requests" && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Pending Host Requests
            </Text>

            {pendingRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>✅</Text>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  No pending requests
                </Text>
              </View>
            ) : (
              pendingRequests.map((request) => (
                <View key={request.id} style={styles.requestCard}>
                  <View
                    style={[
                      styles.requestGlass,
                      {
                        backgroundColor: colors.surfaceGlass,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.requestHeader}>
                      <View
                        style={[
                          styles.userAvatar,
                          {
                            backgroundColor: `${colors.primary}26`,
                            borderColor: `${colors.primary}4D`,
                          },
                        ]}
                      >
                        <Text style={styles.avatarText}>👤</Text>
                      </View>
                      <View style={styles.requestInfo}>
                        <Text
                          style={[styles.requestName, { color: colors.text }]}
                        >
                          {request.userName}
                        </Text>
                        <Text
                          style={[
                            styles.requestDate,
                            { color: colors.textTertiary },
                          ]}
                        >
                          {new Date(request.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.requestDetails}>
                      <View style={styles.detailRow}>
                        <Text
                          style={[
                            styles.detailLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          WHY HOST?
                        </Text>
                        <Text
                          style={[styles.detailValue, { color: colors.text }]}
                        >
                          {request.whyHost}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Text
                          style={[
                            styles.detailLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          EXPERIENCE
                        </Text>
                        <Text
                          style={[styles.detailValue, { color: colors.text }]}
                        >
                          {request.experience}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Text
                          style={[
                            styles.detailLabel,
                            { color: colors.textSecondary },
                          ]}
                        >
                          EVENT IDEAS
                        </Text>
                        <Text
                          style={[styles.detailValue, { color: colors.text }]}
                        >
                          {request.eventIdeas}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.rejectButton}
                        onPress={() => handleRejectClick(request)}
                        disabled={hostRequestsProcessing === request.id}
                      >
                        <View
                          style={[
                            styles.rejectGlass,
                            {
                              backgroundColor: "rgba(255, 69, 58, 0.1)",
                              borderColor: "rgba(255, 69, 58, 0.3)",
                              opacity:
                                hostRequestsProcessing === request.id ? 0.5 : 1,
                            },
                          ]}
                        >
                          <Text style={styles.rejectText}>
                            {hostRequestsProcessing === request.id
                              ? "Processing..."
                              : "Reject"}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.approveButton}
                        onPress={() => handleApproveClick(request)}
                        disabled={hostRequestsProcessing === request.id}
                      >
                        <View
                          style={[
                            styles.approveGlass,
                            {
                              backgroundColor: "rgba(52, 199, 89, 0.1)",
                              borderColor: "rgba(52, 199, 89, 0.3)",
                              opacity:
                                hostRequestsProcessing === request.id ? 0.5 : 1,
                            },
                          ]}
                        >
                          <Text style={styles.approveText}>
                            {hostRequestsProcessing === request.id
                              ? "Processing..."
                              : "✓ Approve"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* USERS TAB */}
        {activeTab === "users" && (
          <View style={styles.section}>
            {/* Search Bar */}
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: colors.surfaceGlass,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search users..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Role Filters */}
            <View style={styles.roleFilters}>
              {["all", "admin", "host", "user"].map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={styles.filterChip}
                  onPress={() => setRoleFilter(filter)}
                >
                  <View
                    style={[
                      styles.filterGlass,
                      {
                        backgroundColor:
                          roleFilter === filter
                            ? `${colors.primary}33`
                            : colors.surfaceGlass,
                        borderColor:
                          roleFilter === filter
                            ? `${colors.primary}66`
                            : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        {
                          color:
                            roleFilter === filter
                              ? colors.primary
                              : colors.text,
                        },
                      ]}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {filteredUsers.length} User{filteredUsers.length !== 1 ? "s" : ""}
            </Text>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : filteredUsers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>👥</Text>
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  No users found
                </Text>
              </View>
            ) : (
              filteredUsers.map((user) => (
                <UserCard key={user.id} user={user} />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Host Request Modal */}
      <AdminMessageModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={
          modalType === "approve" ? handleApproveSubmit : handleRejectSubmit
        }
        title={modalType === "approve" ? "Approve Request" : "Reject Request"}
        userName={currentRequest?.userName || ""}
        type={modalType}
      />

      {/* Confirmation Modal */}
      <AdminConfirmModal
        visible={confirmModalVisible}
        onClose={() => setConfirmModalVisible(false)}
        onConfirm={handleConfirmAction}
        actionType={confirmAction}
        userName={confirmUser ? getUserDisplayName(confirmUser) : ""}
        userRole={confirmUser?.role}
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
      paddingVertical: 60,
    },
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
    tabsContainer: {
      flexDirection: "row",
      paddingHorizontal: 24,
      marginBottom: 20,
      gap: 12,
    },
    tab: { flex: 1, borderRadius: 12, overflow: "hidden" },
    tabGlass: {
      borderWidth: 1,
      paddingVertical: 12,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    tabText: { fontSize: 15, fontWeight: "600" },
    badge: {
      backgroundColor: "#FF453A",
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 6,
    },
    badgeText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
    statsRow: { flexDirection: "row", gap: 12, marginBottom: 28 },
    statCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      alignItems: "center",
    },
    statIcon: { fontSize: 32, marginBottom: 8 },
    statValue: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
    statLabel: {
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      textAlign: "center",
    },
    section: { marginBottom: 28 },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 16,
      letterSpacing: -0.3,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 16,
    },
    searchIcon: { fontSize: 20, marginRight: 10 },
    searchInput: { flex: 1, fontSize: 15 },
    roleFilters: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 20,
    },
    filterChip: {
      borderRadius: 12,
      overflow: "hidden",
    },
    filterGlass: {
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    filterText: {
      fontSize: 14,
      fontWeight: "600",
    },
    // Request Card Styles
    requestCard: { marginBottom: 16, borderRadius: 16, overflow: "hidden" },
    requestGlass: { borderWidth: 1, padding: 16 },
    requestHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    userAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },
    avatarText: { fontSize: 24 },
    requestInfo: { flex: 1 },
    requestName: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
    requestDate: { fontSize: 12 },
    requestDetails: { marginBottom: 16 },
    detailRow: { marginBottom: 12 },
    detailLabel: {
      fontSize: 11,
      fontWeight: "600",
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    detailValue: { fontSize: 14, lineHeight: 20 },
    actionsRow: { flexDirection: "row", gap: 12 },
    rejectButton: { flex: 1, borderRadius: 12, overflow: "hidden" },
    rejectGlass: { borderWidth: 1, paddingVertical: 12, alignItems: "center" },
    rejectText: { fontSize: 15, fontWeight: "600", color: "#FF453A" },
    approveButton: { flex: 1, borderRadius: 12, overflow: "hidden" },
    approveGlass: { borderWidth: 1, paddingVertical: 12, alignItems: "center" },
    approveText: { fontSize: 15, fontWeight: "600", color: "#34C759" },
    // User Card Styles
    userCard: { marginBottom: 16, borderRadius: 16, overflow: "hidden" },
    userGlass: { borderWidth: 1, padding: 16 },
    userHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    userInfo: { flex: 1 },
    userName: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
    userEmail: { fontSize: 13 },
    roleBadge: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
    roleText: {
      fontSize: 11,
      fontWeight: "600",
    },
    suspendedBanner: {
      backgroundColor: "rgba(255, 69, 58, 0.15)",
      padding: 8,
      borderRadius: 8,
      marginBottom: 12,
    },
    suspendedText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#FF453A",
      textAlign: "center",
    },
    userActions: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    actionButton: {
      borderRadius: 10,
      overflow: "hidden",
      flex: 1,
      minWidth: "45%",
    },
    actionGlass: {
      borderWidth: 1,
      paddingVertical: 10,
      alignItems: "center",
    },
    actionText: {
      fontSize: 13,
      fontWeight: "600",
    },
    emptyState: { alignItems: "center", paddingVertical: 40 },
    emptyEmoji: { fontSize: 64, marginBottom: 12 },
    emptyText: { fontSize: 14 },
  });
}
